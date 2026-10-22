"use client";
import { useEffect, useRef, useState } from "react";
import { DisplayScreen } from "@/components/display/DisplayScreen";
import { useFirebaseAuth } from "@/lib/realtime/useFirebaseAuth";
import { getDisplayDb, isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { registerDisplayPresence } from "@/lib/realtime/sessionRepository";
import { EMPTY_RECEIVED, LocalTabShareDisplay, type ReceivedSharing } from "@/lib/youtube/localTabShareDisplay";

function NativeTabDisplay() {
  const auth = useFirebaseAuth();
  const [received, setReceived] = useState<ReceivedSharing>(EMPTY_RECEIVED), [blocked, setBlocked] = useState(false);
  const runtime = useRef<LocalTabShareDisplay | null>(null), video = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (auth.status !== "authenticated" || !auth.uid || typeof BroadcastChannel !== "function" || typeof RTCPeerConnection !== "function") return;
    const receiver = new LocalTabShareDisplay(getDisplayDb(), auth.uid, setReceived); runtime.current = receiver;
    return () => { receiver.dispose(); runtime.current = null; };
  }, [auth.status, auth.uid]);
  const stream = auth.status === "authenticated" ? received.stream : null;
  const showing = !!stream && !received.hidden;
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = stream;
    element.muted = !showing;
    const id = received.sessionId;
    const play = () => {
      if (!showing || !id) return;
      void element.play().then(() => {
        setBlocked(false); void runtime.current?.playback("playing", id);
      }).catch(() => { setBlocked(true); void runtime.current?.playback("blocked", id); });
    };
    if (showing) { element.addEventListener("loadeddata", play); play(); }
    else { element.pause(); if (id) void runtime.current?.playback("hidden", id); }
    return () => { element.removeEventListener("loadeddata", play); element.pause(); element.srcObject = null; };
  }, [stream, showing, received.sessionId]);
  useEffect(() => {
    if (showing) return registerDisplayPresence(getDisplayDb());
  }, [showing]);
  return <>
    {!showing && <DisplayScreen />}
    <section hidden={!showing} className="fixed inset-0 z-50 bg-black" dir="rtl" data-testid="native-youtube-display">
      <video ref={video} autoPlay playsInline className="h-full w-full object-contain" data-testid="tab-share-video" />
      {blocked && showing && <button className="absolute bottom-8 left-1/2 min-h-14 -translate-x-1/2 rounded-2xl bg-teal-600 px-8 text-xl text-white" onClick={() => {
        const element = video.current, id = received.sessionId;
        if (!element || !id) return;
        element.muted = false;
        void element.play().then(() => { setBlocked(false); void runtime.current?.playback("playing", id); }).catch(() => setBlocked(true));
      }}>تشغيل صوت العرض</button>}
    </section>
  </>;
}
export function YouTubeDisplay() { return isRealtimeEnabled() ? <NativeTabDisplay /> : <DisplayScreen />; }
