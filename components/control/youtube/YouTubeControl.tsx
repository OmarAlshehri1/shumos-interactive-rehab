"use client";
import { useEffect, useRef, useState } from "react";
import { subscribeToDisplayPresence } from "@/lib/realtime/sessionRepository";
import { getStaffDb, isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import { useGameSafety } from "@/components/control/visits/GameSafetyProvider";
import { subscribeFavorites } from "@/lib/youtube/repository";
import type { Video } from "@/lib/youtube/model";
import { IDLE_SHARING, LocalTabShareControl, type SharingState } from "@/lib/youtube/localTabShareControl";
import { nativeTabCaptureSupported } from "@/lib/youtube/tabShareModel";
import { ControlIcon } from "@/components/control/ui/ControlIcon";
import styles from "./youtube.module.css";

const STATUS: Record<SharingState["phase"], string> = {
  idle: "العرض متوقف", selecting: "بانتظار اختيار تبويب يوتيوب…", connecting: "جارٍ الاتصال بالشاشة…",
  sharing: "يوتيوب على شاشة العرض", hidden: "يوتيوب مخفي مؤقتًا", reconnecting: "بانتظار عودة شاشة العرض…",
  blocked: "اضغط تشغيل الصوت على شاشة العرض", error: "المشاركة متوقفة",
};

export function YouTubeControl() {
  const auth = useStaffAuth(), safety = useGameSafety();
  const [sharing, setSharing] = useState(IDLE_SHARING), [favorites, setFavorites] = useState<Video[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null), [favoriteError, setFavoriteError] = useState(false);
  const [displayOnline, setDisplayOnline] = useState(false);
  useEffect(() => {
    if (auth.phase !== "authorized" || !isRealtimeEnabled()) return;
    return subscribeToDisplayPresence(getStaffDb(), next => setDisplayOnline(next?.connected === true && typeof next.updatedAt === "number" && Date.now() - next.updatedAt < 45000));
  }, [auth.phase]);
  const runtime = useRef<LocalTabShareControl | null>(null);
  const allowed = useRef(false);
  useEffect(() => { allowed.current = auth.phase === "authorized" && safety.known && safety.connected && safety.canLeave; }, [auth.phase, safety.known, safety.connected, safety.canLeave]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser capabilities are unavailable during SSR.
    setSupported(nativeTabCaptureSupported());
  }, []);
  useEffect(() => {
    if (auth.phase !== "authorized" || !auth.uid || !isRealtimeEnabled()) return;
    const stop = subscribeFavorites(getStaffDb(), auth.uid, setFavorites, () => setFavoriteError(true));
    if (nativeTabCaptureSupported()) runtime.current = new LocalTabShareControl(getStaffDb(), auth.uid, () => allowed.current, setSharing);
    return () => { stop(); runtime.current?.dispose(); runtime.current = null; };
  }, [auth.phase, auth.uid]);
  const active = !["idle", "error", "selecting"].includes(sharing.phase);
  const disabled = supported !== true || !safety.known || !safety.connected || !safety.canLeave || auth.phase !== "authorized";
  return <main className={styles.page} dir="rtl" lang="ar" data-testid="native-youtube-control" data-control-page-layout="centered">
    <div className={styles.workspace}>
      <header className={styles.heading}><span className={styles.logo} aria-hidden="true"><ControlIcon name="youtube"/></span><div><h1>يوتيوب</h1><p>مشاركة المحتوى على شاشة العرض</p></div></header>
      <div className={styles.workspaceGrid}>
        <section className={styles.openCard} aria-label="فتح يوتيوب">
          <span className={styles.largeIcon}><ControlIcon name="youtube"/></span>
          <h2>المحتوى المناسب، في مكانه</h2><p>افتح يوتيوب واختر محتوى الجلسة، ثم ابدأ المشاركة.</p>
          <a className={styles.original} href="https://www.youtube.com/" target="_blank" rel="noopener noreferrer">فتح يوتيوب ↗</a>
        </section>
        <section className={styles.nativePanel} aria-label="مشاركة يوتيوب">
          <div className={styles.panelHeading}><h2>شاشة العرض</h2><span className={styles.deviceStatus} data-connected={displayOnline}>{displayOnline ? "متصلة" : "غير متصلة"}</span></div>
          <p className={styles.connection} role="status" data-testid="tab-share-status">{STATUS[sharing.phase]}</p>
          <a className={styles.displayLink} href="/display" target="_blank" rel="noopener noreferrer">فتح شاشة العرض ↗</a>
          <div className={styles.nativeActions}>
            <button className={styles.displayAction} disabled={disabled || active || sharing.phase === "selecting"} onClick={() => void runtime.current?.start()}>بدء المشاركة</button>
            <button className={styles.back} disabled={!active || sharing.phase === "connecting" || sharing.phase === "reconnecting"} onClick={() => void runtime.current?.toggleHidden()}>{sharing.phase === "hidden" ? "إظهار العرض" : "إخفاء العرض"}</button>
            <button className={styles.back} disabled={!active && sharing.phase !== "selecting"} onClick={() => runtime.current?.stop()}>إيقاف العرض</button>
          </div>
          {active && <p className={styles.notice}>{sharing.audio ? "صوت التبويب مشارك" : "صوت التبويب غير مشارك"}</p>}
          {supported === false && <p className={styles.notice}>المشاركة متاحة عبر Chrome على الكمبيوتر.</p>}
          {supported && !active && <p className={styles.notice}>اختر تبويب يوتيوب مع مشاركة الصوت.</p>}
          {safety.live && !safety.canLeave && <p className={styles.error}>أنهِ النشاط واحفظ نتيجته من أدواته قبل المشاركة.</p>}
          {sharing.error && <p role="alert" className={styles.error}>{sharing.error}</p>}
        </section>
      </div>
      {(favorites.length > 0 || favoriteError) && <details className={styles.favoriteLinks}><summary>المفضلة</summary>
        {favoriteError ? <p className={styles.notice}>تعذّر تحميل المفضلة.</p> : <ul>{favorites.map(video => <li key={video.videoId}><a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer">{video.title} ↗</a></li>)}</ul>}
      </details>}
    </div>
  </main>;
}
