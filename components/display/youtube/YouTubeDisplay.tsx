"use client";
import { useEffect, useRef, useState } from "react";
import { onValue, ref } from "firebase/database";
import { DisplayScreen } from "@/components/display/DisplayScreen";
import { useFirebaseAuth } from "@/lib/realtime/useFirebaseAuth";
import { getDisplayDb, isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import {
  registerDisplayPresence,
  subscribeToConnectionStatus,
} from "@/lib/realtime/sessionRepository";
import {
  commandFresh,
  newerCommand,
  recoveredPosition,
  type VideoCommand,
} from "@/lib/youtube/model";
import { reportVideoStatus, subscribeCommand } from "@/lib/youtube/repository";
interface Player {
  loadVideoById(v: { videoId: string; startSeconds: number }): void;
  cueVideoById(v: { videoId: string; startSeconds: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(n: number, allow: boolean): void;
  mute(): void;
  unMute(): void;
  setVolume(n: number): void;
  getCurrentTime(): number;
  isMuted(): boolean;
  destroy(): void;
}
interface PlayerEvent {
  data: number;
}
interface YouTubeAPI {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: () => void;
        onStateChange: (e: PlayerEvent) => void;
        onError: (e: PlayerEvent) => void;
        onAutoplayBlocked: () => void;
      };
    },
  ) => Player;
}
declare global {
  interface Window {
    YT?: YouTubeAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let apiPromise: Promise<YouTubeAPI> | null = null;
function api(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    let done = false;
    const old = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        apiPromise = null;
        document
          .querySelector('script[src="https://www.youtube.com/iframe_api"]')
          ?.remove();
        reject(Error("player-timeout"));
      }
    }, 15000);
    window.onYouTubeIframeAPIReady = () => {
      old?.();
      if (!done && window.YT?.Player) {
        done = true;
        clearTimeout(timer);
        resolve(window.YT);
      }
    };
    if (
      !document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]',
      )
    ) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          apiPromise = null;
          script.remove();
          reject(Error("player-network"));
        }
      };
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}
function VideoPlayer({
  command,
  onEnded,
}: {
  command: VideoCommand;
  onEnded: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    player = useRef<Player | null>(null),
    current = useRef(command),
    applied = useRef<string | null>(null),
    loaded = useRef<string | null>(null);
  useEffect(() => {
    current.current = command;
  }, [command]);
  const [ready, setReady] = useState(false),
    [blocked, setBlocked] = useState(true),
    [error, setError] = useState(false);
  const state = useRef("loading");
  const report = (kind: string) => {
    state.current = kind;
    const c = current.current;
    void reportVideoStatus(getDisplayDb(), {
      sessionId: c.sessionId,
      commandId: c.commandId,
      state: kind,
      position: player.current?.getCurrentTime() ?? 0,
      updatedAt: Date.now(),
    }).catch(() => {});
  };
  function apply() {
    const c = current.current,
      p = player.current;
    if (!p || applied.current === c.commandId) return;
    applied.current = c.commandId;
    if (loaded.current !== c.videoId) {
      loaded.current = c.videoId;
      const spec = {
        videoId: c.videoId,
        startSeconds: recoveredPosition(c, Date.now()),
      };
      if (c.state === "playing") p.loadVideoById(spec);
      else p.cueVideoById(spec);
    } else p.seekTo(recoveredPosition(c, Date.now()), true);
    p.setVolume(c.volume);
    if (c.muted) p.mute();
    else p.unMute();
    if (c.state === "playing") p.playVideo();
    else if (c.state === "paused") p.pauseVideo();
    else p.stopVideo();
  }
  useEffect(() => {
    let disposed = false;
    void api()
      .then((YT) => {
        if (disposed || !container.current) return;
        const node = document.createElement("div");
        container.current.appendChild(node);
        player.current = new YT.Player(node, {
          videoId: current.current.videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            origin: location.origin,
            playsinline: 1,
            autoplay: 0,
            controls: 1,
          },
          events: {
            onReady: () => {
              if (disposed) return;
              setReady(true);
              apply();
            },
            onStateChange: (e) => {
              if (disposed) return;
              if (e.data === 1) {
                setError(false);
                setBlocked(false);
                report("playing");
              } else if (e.data === 2) report("paused");
              else if (e.data === 0) {
                report("ended");
                player.current?.stopVideo();
                onEnded(current.current.commandId);
              }
            },
            onError: () => {
              if (disposed) return;
              setError(true);
              report("error");
            },
            onAutoplayBlocked: () => {
              if (disposed) return;
              setBlocked(true);
              report("blocked");
            },
          },
        });
      })
      .catch(() => {
        if (!disposed) {
          setError(true);
          report("error");
        }
      });
    const statusTimer = setInterval(() => {
      if (!disposed && player.current) report(state.current);
    }, 2000);
    return () => {
      disposed = true;
      clearInterval(statusTimer);
      player.current?.destroy();
      player.current = null;
    };
    // The player is owned by this mount; current commands are applied separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ready) apply();
  }, [command.commandId, ready]);
  return (
    <main
      dir="rtl"
      style={{
        height: "100dvh",
        background: "#080d12",
        color: "white",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        ref={container}
        style={{ flex: 1, minHeight: 0, width: "100%" }}
        className="shumos-youtube-player"
      />
      {error ? (
        <div role="alert" style={{ padding: 24, textAlign: "center" }}>
          تعذّر تشغيل الفيديو أو لا يسمح بتضمينه.{" "}
          <a
            href={`https://www.youtube.com/watch?v=${command.videoId}`}
            target="_blank"
            rel="noopener"
            style={{ textDecoration: "underline" }}
          >
            فتح على YouTube
          </a>
        </div>
      ) : (
        blocked && (
          <button
            style={{ padding: 18, background: "#008d86", fontSize: 20 }}
            disabled={!ready}
            onClick={() => {
              const p = player.current;
              if (!p) return;
              p.unMute();
              if (current.current.state === "playing") p.playVideo();
              else p.pauseVideo();
            }}
          >
            تفعيل صوت العرض
          </button>
        )
      )}
      <style>{`.shumos-youtube-player iframe{width:100%;height:100%;border:0;min-height:200px}`}</style>
    </main>
  );
}
function RealtimeMediaDisplay() {
  const auth = useFirebaseAuth();
  const [command, setCommand] = useState<VideoCommand | null>(null),
    [online, setOnline] = useState(false),
    [hasGame, setHasGame] = useState(true),
    [now, setNow] = useState(Date.now),
    [ended, setEnded] = useState<string | null>(null);
  const last = useRef<VideoCommand | null>(null);
  useEffect(() => {
    if (auth.status !== "authenticated") {
      last.current = null; setCommand(null); setOnline(false); setHasGame(true);
      return;
    }
    const db = getDisplayDb();
    const stop = subscribeCommand(
      db,
      (c) => {
        if (!c) {
          last.current = null;
          setCommand(null);
        } else if (
          !last.current ||
          newerCommand(c, last.current) ||
          (c.commandId === last.current.commandId &&
            c.heartbeatAt >= last.current.heartbeatAt)
        ) {
          last.current = c;
          setCommand(c);
        }
      },
      () => setCommand(null),
    );
    const connection = subscribeToConnectionStatus(db, (s) =>
      setOnline(s === "connected"),
    );
    const live = onValue(
      ref(db, "liveSession"),
      (s) => setHasGame(s.exists()),
      () => setHasGame(true),
    );
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop();
      connection();
      live();
      clearInterval(timer);
    };
  }, [auth.status]);
  const active =
    auth.status === "authenticated" &&
    command &&
    command.state !== "stopped" &&
    command.commandId !== ended &&
    commandFresh(command, now) &&
    online &&
    !hasGame;
  useEffect(() => {
    if (!active) return;
    return registerDisplayPresence(getDisplayDb());
  }, [active]);
  return active ? (
    <VideoPlayer key={command.sessionId} command={command} onEnded={setEnded} />
  ) : (
    <DisplayScreen />
  );
}
export function YouTubeDisplay() {
  return isRealtimeEnabled() ? <RealtimeMediaDisplay /> : <DisplayScreen />;
}
