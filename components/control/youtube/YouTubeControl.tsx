"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { onValue, ref, runTransaction } from "firebase/database";
import {
  getStaffDb,
  getStaffFirebaseApp,
  isRealtimeEnabled,
} from "@/lib/realtime/firebaseClient";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import { controlTabId } from "@/lib/liveGame/ownership";
import { useGameSafety } from "@/components/control/visits/GameSafetyProvider";
import {
  refreshControllerLease,
  claimControllerLease,
  subscribeToDisplayPresence,
  subscribeToConnectionStatus,
} from "@/lib/realtime/sessionRepository";
import { ControlPageNav } from "@/components/control/nav/ControlPageNav";
import { ControlNav } from "@/components/control/nav/ControlNav";
import {
  COMMAND_PATH,
  STATUS_PATH,
  prepareVideoDisplay,
  publishCommand,
  stopOwnedVideo,
  subscribeCommand,
  subscribeFavorites,
  toggleFavorite,
  type VideoStatus,
} from "@/lib/youtube/repository";
import {
  commandFresh,
  recoveredPosition,
  thumbnail,
  type Video,
  type VideoCommand,
} from "@/lib/youtube/model";
import styles from "./youtube.module.css";
import { VideoPreview } from "./VideoPreview";
const messages: Record<string, string> = {
  "setup-required": "البحث يحتاج إعداد YouTube Data API. المفضلة تبقى متاحة.",
  "quota-exceeded": "وصل البحث إلى حصة YouTube المتاحة. حاول لاحقاً.",
  "rate-limit": "طلبات متقاربة؛ انتظر دقيقة ثم أعد المحاولة.",
  unauthenticated: "أعد تسجيل الدخول للبحث.",
  forbidden: "يلزم حساب أخصائي مخوّل.",
  "invalid-query": "اكتب عبارة بحث من حرفين إلى ١٢٠ حرفاً.",
  "search-unavailable": "تعذّر الوصول إلى YouTube. أعد المحاولة.",
  "auth-configuration": "يلزم إعداد مصادقة الخادم.",
};
export function YouTubeControl() {
  const auth = useStaffAuth(),
    safety = useGameSafety();
  const [query, setQuery] = useState(""),
    [watching, setWatching] = useState<Video | null>(null),
    [searched, setSearched] = useState(""),
    [results, setResults] = useState<Video[]>([]),
    [favorites, setFavorites] = useState<Video[]>([]),
    [page, setPage] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [command, setCommand] = useState<VideoCommand | null>(null),
    [status, setStatus] = useState<VideoStatus | null>(null),
    [displayConnected, setDisplayConnected] = useState(false),
    [online, setOnline] = useState(false),
    [seek, setSeek] = useState("0"),
    [now, setNow] = useState(Date.now);
  const commandRef = useRef(command);
  useEffect(() => {
    commandRef.current = command;
  }, [command]);
  const searchRequest = useRef<AbortController | null>(null),
    mounted = useRef(false),
    lastDisplayBeat = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      searchRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (auth.phase !== "authorized" || !auth.uid || !isRealtimeEnabled())
      return;
    const db = getStaffDb(),
      tab = controlTabId();
    let disposed = false;
    const stops = [
      subscribeFavorites(db, auth.uid, setFavorites, () =>
        setError("تعذّر تحميل المفضلة. تحقق من الاتصال ونشر القواعد المعتمدة."),
      ),
      subscribeCommand(db, setCommand, () => setError("تعذّر الاتصال بالعرض.")),
      onValue(
        ref(db, STATUS_PATH),
        (s) => setStatus(s.val()),
        () => setError("تعذّر قراءة حالة الفيديو."),
      ),
      subscribeToConnectionStatus(db, (s) => setOnline(s === "connected")),
      subscribeToDisplayPresence(db, (p) => {
        lastDisplayBeat.current =
          p?.connected === true && typeof p.updatedAt === "number"
            ? p.updatedAt
            : 0;
        setDisplayConnected(Date.now() - lastDisplayBeat.current < 35000);
      }),
    ];
    const heartbeat = setInterval(() => {
      setNow(Date.now());
      setDisplayConnected(Date.now() - lastDisplayBeat.current < 35000);
      const c = commandRef.current;
      if (
        !c ||
        c.controlTabId !== tab ||
        c.state === "stopped" ||
        !commandFresh(c, Date.now())
      )
        return;
      void refreshControllerLease(db)
        .then(() => {
          if (disposed || !commandFresh(c, Date.now())) return;
          return runTransaction(
            ref(db, COMMAND_PATH),
            (raw) =>
              raw?.controlTabId === tab && raw.commandId === c.commandId
                ? { ...raw, heartbeatAt: Date.now() }
                : undefined,
            { applyLocally: false },
          );
        })
        .catch(() =>
          setError("انقطع التحكم؛ سيتوقف العرض تلقائياً إذا لم يعد الاتصال."),
        );
    }, 4000);
    return () => {
      disposed = true;
      stops.forEach((stop) => stop());
      clearInterval(heartbeat);
      void stopOwnedVideo(db, tab).catch(() =>
        console.warn(
          "[youtube] owned command cleanup failed; playback expires safely",
        ),
      );
    };
  }, [auth.phase, auth.uid]);
  useEffect(() => {
    if (
      status?.state !== "ended" ||
      status.commandId !== command?.commandId ||
      command.controlTabId !== controlTabId()
    )
      return;
    void stopOwnedVideo(getStaffDb(), controlTabId()).catch(() =>
      setError("تعذّر إغلاق الفيديو بعد انتهائه."),
    );
  }, [status, command]);
  async function search(more = false) {
    if (loading || !online) return;
    setLoading(true);
    setError("");
    searchRequest.current?.abort();
    const abort = new AbortController();
    searchRequest.current = abort;
    try {
      const user = getAuth(getStaffFirebaseApp()).currentUser;
      if (!user) throw Error(messages.unauthenticated);
      const response = await fetch("/api/youtube/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: more ? searched : query,
          ...(more && page ? { pageToken: page } : {}),
        }),
        signal: abort.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(messages[body.error] ?? messages["search-unavailable"]);
      if (!mounted.current) return;
      setResults((old) =>
        more
          ? [
              ...new Map(
                [...old, ...body.videos].map((v: Video) => [v.videoId, v]),
              ).values(),
            ]
          : body.videos,
      );
      setPage(body.nextPageToken);
      if (!more) { setSearched(query); setWatching(null); }
    } catch (e) {
      if (!abort.signal.aborted)
        setError(
          e instanceof Error ? e.message : messages["search-unavailable"],
        );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  function watch(video: Video, onDisplay = false) {
    if (!safety.canLeave) {
      setError("أكمل النشاط واحفظ نتيجته قبل تشغيل الفيديو.");
      return;
    }
    setError("");
    setWatching(video);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (onDisplay) void send({ state: "playing", position: 0 }, video);
  }
  async function favorite(v: Video) {
    if (!auth.uid || busy) return;
    setBusy(true);
    setError("");
    try {
      await toggleFavorite(
        getStaffDb(),
        auth.uid,
        v,
        !favorites.some((x) => x.videoId === v.videoId),
      );
    } catch {
      setError("تعذّر حفظ المفضلة. تحقق من الاتصال والقواعد.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function send(
    patch: Partial<
      Pick<VideoCommand, "videoId" | "state" | "position" | "volume" | "muted">
    >,
    video?: Video,
  ) {
    if (!auth.uid || busy || !online) return;
    setBusy(true);
    setError("");
    try {
      const db = getStaffDb(),
        tab = controlTabId();
      const old = commandRef.current;
      if (
        old &&
        old.controlTabId !== tab &&
        old.state !== "stopped" &&
        // eslint-disable-next-line react-hooks/purity -- Playback event handler; ownership must be checked at click time.
        Date.now() - old.heartbeatAt < 15000
      )
        throw Error("الفيديو يتحكم به أخصائي في نافذة أخرى.");
      if (video) {
        if (!safety.canLeave)
          throw Error("أكمل النشاط واحفظ نتيجته قبل تشغيل الفيديو.");
        await prepareVideoDisplay(db, auth.uid, tab);
      }
      if (!video && (!old || old.controlTabId !== tab))
        throw Error("اختر فيديو أولاً.");
      // Disconnect handlers release the shared lease; explicit playback actions reacquire it safely.
      if (!video) await claimControllerLease(db, auth.uid);
      // eslint-disable-next-line react-hooks/purity -- Timestamp the acknowledged playback action, never a render.
      const now = Date.now();
      const position = old
        ? status?.commandId === old.commandId && now - status.updatedAt < 5000
          ? status.position
          : commandFresh(old, now)
            ? recoveredPosition(old, now)
            : status?.commandId === old.commandId
              ? status.position
              : old.position
        : 0;
      const next: VideoCommand = {
        sessionId:
          old?.controlTabId === tab ? old.sessionId : crypto.randomUUID(),
        commandId: crypto.randomUUID(),
        ownerId: auth.uid,
        controlTabId: tab,
        revision: (old?.revision ?? 0) + 1,
        videoId: video?.videoId ?? old!.videoId,
        state: old?.state ?? "playing",
        position,
        volume: old?.volume ?? 60,
        muted: old?.muted ?? false,
        ...patch,
        issuedAt: now,
        heartbeatAt: now,
      };
      await publishCommand(db, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إرسال الأمر.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const own = command?.controlTabId === controlTabId();
  return (
    <div className={styles.page} dir="rtl">
      <ControlPageNav backHref="/control" backLabel="الرئيسية" />
      <ControlNav active="youtube" showBrand={false} />
      <header>
        <span className={styles.logo}>▶</span>
        <div>
          <h1>
            يوتيوب <small>YouTube</small>
          </h1>
        </div>
      </header>
      {(!online || !displayConnected) && <p className={styles.connection} role="status">
        {!online ? "تحقق من اتصال الإنترنت." : "افتح شاشة العرض لتشغيل الفيديو."}
      </p>}
      <form
        className={styles.search}
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          minLength={2}
          maxLength={120}
          placeholder="ابحث عن أناشيد، كرتون، فيديوهات…"
          aria-label="البحث في يوتيوب"
        />
        <button disabled={loading || !online}>
          {loading ? "جارٍ البحث…" : "بحث"}
        </button>
      </form>
      <p className={styles.notice}>
        لا تُدخل بيانات المريض في البحث.
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {watching && (
        <section className={styles.watching} aria-label="مشاهدة الفيديو">
          <div className={styles.watchActions}>
            <button className={styles.back} onClick={() => setWatching(null)}>رجوع إلى النتائج</button>
            <button className={styles.displayAction} disabled={busy || !online || !displayConnected} onClick={() => void send({ state: "playing", position: 0 }, watching)}>عرض على شاشة الطفل</button>
          </div>
          {safety.canLeave ? <VideoPreview video={watching} /> : <p role="status">أكمل النشاط واحفظ نتيجته قبل تشغيل الفيديو.</p>}
          <div className={styles.watchTitle}>
            <div><h2>{watching.title}</h2><p>{watching.channel}</p></div>
            <button className={styles.heart} aria-label={favorites.some(v => v.videoId === watching.videoId) ? `إزالة ${watching.title} من المفضلة` : `إضافة ${watching.title} إلى المفضلة`} aria-pressed={favorites.some(v => v.videoId === watching.videoId)} disabled={busy || !online} onClick={() => void favorite(watching)}>{favorites.some(v => v.videoId === watching.videoId) ? "♥" : "♡"}</button>
          </div>
        </section>
      )}
      {command && command.state !== "stopped" && (
        <section className={styles.playerControls} aria-label="التحكم بالفيديو">
          <h2>الفيديو على شاشة العرض</h2>
          <p role="status">
            {!commandFresh(command, now)
              ? "انقطعت إشارة التحكم؛ اضغط استئناف للمتابعة."
              : status?.commandId === command.commandId
                ? ({
                    playing: "قيد التشغيل",
                    paused: "متوقف مؤقتاً",
                    blocked: "يلزم تفعيل الصوت من شاشة العرض",
                    ended: "انتهى الفيديو",
                    error: "الفيديو غير متاح أو لا يسمح بتضمينه",
                    loading: "جارٍ تحميل الفيديو",
                  }[status.state] ?? status.state)
                : "بانتظار تأكيد شاشة العرض"}
          </p>
          <div className={styles.controls}>
            <button
              disabled={!own || busy || !online}
              onClick={() =>
                void send({
                  state:
                    command.state === "playing" && commandFresh(command, now)
                      ? "paused"
                      : "playing",
                })
              }
            >
              {command.state === "playing" && commandFresh(command, now)
                ? "إيقاف مؤقت"
                : "استئناف"}
            </button>
            <button
              disabled={!own || busy || !online}
              onClick={() => void send({ position: 0, state: "playing" })}
            >
              إعادة من البداية
            </button>
            <button
              disabled={!own || busy || !online}
              onClick={() => void send({ muted: !command.muted })}
            >
              {command.muted ? "إلغاء الكتم" : "كتم"}
            </button>
            <button
              disabled={!own || busy || !online}
              onClick={() => void send({ state: "stopped" })}
            >
              إيقاف والعودة للانتظار
            </button>
            <label>
              الصوت{" "}
              <input
                aria-label="مستوى الصوت"
                type="range"
                min="0"
                max="100"
                value={command.volume}
                disabled={!own || busy || !online}
                onChange={(e) => void send({ volume: Number(e.target.value) })}
              />
            </label>
            <label>
              الانتقال إلى الثانية{" "}
              <input
                aria-label="ثانية الانتقال"
                type="number"
                min="0"
                max="86400"
                value={seek}
                onChange={(e) => setSeek(e.target.value)}
              />
            </label>
            <button
              disabled={
                !own ||
                busy ||
                !online ||
                !Number.isFinite(Number(seek)) ||
                Number(seek) < 0 ||
                Number(seek) > 86400
              }
              onClick={() => void send({ position: Number(seek) })}
            >
              انتقال
            </button>
            <a
              href={`https://www.youtube.com/watch?v=${command.videoId}`}
              target="_blank"
              rel="noopener"
            >
              فتح على YouTube ↗
            </a>
          </div>
        </section>
      )}
      <section aria-label="نتائج البحث" aria-busy={loading}>
        <h2>{watching ? "من نتائج البحث" : "نتائج البحث"} {results.length > 0 && <small>({results.length})</small>}</h2>
        {loading && <p role="status" className={styles.loading}>جارٍ تحميل نتائج YouTube…</p>}
        {results.length ? (
          <div className={styles.grid}>
            {results.filter(v => v.videoId !== watching?.videoId).map((v) => (
              <VideoCard
                key={v.videoId}
                video={v}
                saved={favorites.some((x) => x.videoId === v.videoId)}
                disabled={busy || !online}
                onPlay={() => watch(v)}
                onFavorite={() => void favorite(v)}
              />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            {searched
              ? "لم تظهر نتائج. جرّب عبارة أخرى."
              : "ابحث عن فيديو لعرض النتائج هنا."}
          </p>
        )}
        {page && (
          <button
            disabled={loading || !online}
            className={styles.more}
            onClick={() => void search(true)}
          >
            تحميل المزيد
          </button>
        )}
      </section>
      <section className={styles.favorites} aria-label="المفضلة">
        <h2>
          المفضلة <span>♥</span>
        </h2>
        {favorites.length ? (
          <div className={styles.grid}>
            {favorites.map((v) => (
              <VideoCard
                key={v.videoId}
                video={v}
                saved
                onDisplay
                disabled={busy || !online}
                onPlay={() => watch(v, true)}
                onFavorite={() => void favorite(v)}
              />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            احفظ فيديو بالضغط على ♡.
          </p>
        )}
      </section>
    </div>
  );
}

function VideoCard({
  video: v,
  saved,
  disabled,
  onPlay,
  onFavorite,
  onDisplay = false,
}: {
  video: Video;
  saved: boolean;
  disabled: boolean;
  onPlay: () => void;
  onFavorite: () => void;
  onDisplay?: boolean;
}) {
  return (
    <article className={styles.card}>
      <button
        className={styles.thumbnail}
        onClick={onPlay}
        disabled={disabled}
        aria-label={`${onDisplay ? "تشغيل" : "معاينة"} ${v.title}`}
      >
        <Image
          src={thumbnail(v.videoId)}
          alt=""
          width={480}
          height={270}
          unoptimized
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <span>▶ {onDisplay ? "تشغيل على العرض" : "معاينة الفيديو"}</span>
      </button>
      <div className={styles.cardText}>
        <div>
          <h3>{v.title}</h3>
          <p>{v.channel}</p>
        </div>
        <button
          className={styles.heart}
          aria-label={
            saved
              ? `إزالة ${v.title} من المفضلة`
              : `إضافة ${v.title} إلى المفضلة`
          }
          aria-pressed={saved}
          disabled={disabled}
          onClick={onFavorite}
        >
          {saved ? "♥" : "♡"}
        </button>
      </div>
    </article>
  );
}
