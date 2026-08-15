"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * TASK 9 PART 4 — thin wrapper around the browser Fullscreen API. Handles
 * both the standard API and Safari's webkit-prefixed one; never throws or
 * blocks the caller if fullscreen isn't supported or the request is
 * refused (e.g. not called from within a real user gesture, or the page is
 * embedded somewhere that disallows it via Permissions-Policy) — this is
 * an enhancement, not something gameplay can ever depend on succeeding,
 * same "never let a feature-detection gap break the experience" rule
 * lib/audio follows throughout.
 *
 * Deliberately does NOT attempt to auto-enter fullscreen on mount — the
 * API requires a genuine user gesture, so the caller must invoke
 * requestFullscreen() from inside a real click/tap handler (see
 * ShumosWaitingWorld's "بدء العرض" button).
 */
export interface UseFullscreenResult {
  isFullscreen: boolean;
  isSupported: boolean;
  requestFullscreen: () => void;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export function useFullscreen(): UseFullscreenResult {
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Starts false on both server and client (avoids an SSR/hydration text
  // mismatch on ShumosWaitingWorld's "⛶" glyph) and is detected for real once
  // this effect runs post-mount, same as isFullscreen below.
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement as FullscreenElement;

    function detectSupport() {
      setIsSupported(typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function");
    }
    detectSupport();

    function update() {
      const doc = document as FullscreenDocument;
      setIsFullscreen(Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement));
    }
    update();
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);

  const requestFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement as FullscreenElement;
    try {
      const request = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
      const result = request?.();
      if (result && typeof result.then === "function") {
        result.catch(() => {
          // Refused (missing user-gesture context, Permissions-Policy, etc.) — the "بدء العرض" button remains available to try again.
        });
      }
    } catch {
      // Some environments throw synchronously instead of rejecting a promise — same best-effort contract either way.
    }
  }, []);

  return { isFullscreen, isSupported, requestFullscreen };
}
