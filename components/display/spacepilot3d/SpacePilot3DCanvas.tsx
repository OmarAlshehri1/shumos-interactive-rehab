"use client";

import { useEffect, useRef } from "react";
import { createPrototypeRenderer } from "@/lib/spacepilot3d/renderer";
import type { PrototypeControls, PrototypeViewStatus } from "@/lib/spacepilot3d/simulation";
import type { SensorInputStatus } from "@/lib/spacepilot3d/sensorInput";
import type { GameplaySnapshot } from "@/lib/spacepilot3d/gameplay";
import styles from "./prototype.module.css";

interface Props {
  onReady: (controls: PrototypeControls | null) => void;
  onStatus: (status: PrototypeViewStatus, error?: string) => void;
  onInputStatus: (status: SensorInputStatus) => void;
  onGameplay: (snapshot: GameplaySnapshot) => void;
}

export default function SpacePilot3DCanvas({ onReady, onStatus, onInputStatus, onGameplay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !guideRef.current) return;
    let renderer: ReturnType<typeof createPrototypeRenderer> | undefined;
    try {
      renderer = createPrototypeRenderer(canvas, onStatus, onInputStatus, guideRef.current, onGameplay);
      onReady(renderer.controls);
    } catch (error) {
      onStatus("error", error instanceof Error ? error.message : "WebGL could not initialize. Try a browser with hardware acceleration enabled.");
    }
    return () => { onReady(null); renderer?.dispose(); };
  }, [onReady, onStatus, onInputStatus, onGameplay]);
  return <>
    <canvas ref={canvasRef} className={styles.canvas} tabIndex={0} aria-label="3D space flight simulator. Keyboard mode uses arrow keys or W A S D. Sensor mode uses the Control page's right hand." />
    <div className={styles.guide} aria-label="Development input alignment guide">
      <div className={styles.inputMap} ref={guideRef} data-testid="flight-input-guide"><span className={styles.shipDot} /><span className={styles.pointerDot} /></div>
      <small>Blue: ship · Gold: sensor<br />Match dots to engage sensor</small>
    </div>
  </>;
}
