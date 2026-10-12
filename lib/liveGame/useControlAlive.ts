"use client";

import { useEffect, useRef, useState } from "react";
import { ControlFreshness } from "./ownership";

/**
 * Display-side: is the Control still writing? `heartbeatAt` changes with every Control write; liveness is judged
 * only by when THIS device last saw it change, so clock differences between the iPad and the projector laptop never matter.
 */
export function useControlAlive(heartbeatAt: number | undefined): boolean {
  const freshness = useRef(new ControlFreshness());
  const [alive, setAlive] = useState(true);
  useEffect(() => {
    freshness.current.observe(heartbeatAt, Date.now());
    queueMicrotask(() => setAlive(true));
  }, [heartbeatAt]);
  useEffect(() => {
    const t = setInterval(() => setAlive(freshness.current.alive(Date.now())), 2000);
    return () => clearInterval(t);
  }, []);
  return alive;
}
