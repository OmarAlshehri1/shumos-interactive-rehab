"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import type { PrototypeControls, PrototypeViewStatus, PrototypeInputMode } from "@/lib/spacepilot3d/simulation";
import type { SensorInputStatus } from "@/lib/spacepilot3d/sensorInput";
import type { GameplaySnapshot } from "@/lib/spacepilot3d/gameplay";
import type { FlightDifficulty } from "@/lib/spacepilot3d/missions";
import styles from "./prototype.module.css";

const PrototypeCanvas = dynamic(() => import("./SpacePilot3DCanvas"), {
  ssr: false,
  loading: () => <div className={styles.message}>Loading the 3D flight deck…</div>,
});

export function SpacePilot3DPreview() {
  const controls = useRef<PrototypeControls | null>(null);
  const [status, setStatus] = useState<PrototypeViewStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<PrototypeInputMode>("keyboard");
  const [sensorStatus, setSensorStatus] = useState<SensorInputStatus>("waiting");
  const [difficulty, setDifficulty] = useState<FlightDifficulty>("MEDIUM");
  const [gameplay, setGameplay] = useState<GameplaySnapshot | null>(null);
  const onGameplay = useCallback((next: GameplaySnapshot) => { setGameplay(next); }, []);
  const onInputStatus = useCallback((next: SensorInputStatus) => { setSensorStatus(next); }, []);
  const onReady = useCallback((next: PrototypeControls | null) => { controls.current = next; }, []);
  const onStatus = useCallback((next: PrototypeViewStatus, message?: string) => {
    setStatus(next);
    setError(message ?? null);
  }, []);

  return (
    <main className={styles.preview} lang="en" dir="ltr">
      <PrototypeCanvas key={attempt} onReady={onReady} onStatus={onStatus} onInputStatus={onInputStatus} onGameplay={onGameplay} />
      <header className={styles.header}>
        <span className={styles.badge}>EXPERIMENTAL · PHASE 04</span>
        <h1>Space Pilot <span>3D flight lab</span></h1>
        <p>Placeholder geometry · Local input lab · No saved session</p>
      </header>
      <aside className={styles.panel} aria-label="Development controls">
        <div className={styles.panelTitle}><span>FLIGHT DECK</span><span className={styles.status} role="status">{status}</span></div>
        <label className={styles.inputLabel}>Difficulty
          <select aria-label="Difficulty" value={difficulty} disabled={status === "loading" || status === "error"} onChange={(event) => { const next = event.target.value as FlightDifficulty; controls.current?.setDifficulty(next); setDifficulty(next); }}>
            <option value="LOW">Low · gentle flight</option><option value="MEDIUM">Medium · balanced</option><option value="HIGH">High · faster passage</option>
          </select>
        </label>
        <label className={styles.inputLabel}>Input mode
          <select aria-label="Input mode" value={mode} disabled={status === "loading" || status === "error"} onChange={(event) => { const next = event.target.value as PrototypeInputMode; controls.current?.setInputMode(next); setMode(next); }}>
            <option value="keyboard">Keyboard simulation</option><option value="sensor">RIGHT_HAND sensor</option>
          </select>
        </label>
        {mode === "keyboard" ? <p>Use <strong>W A S D</strong> or <strong>arrow keys</strong> to fly.<br />Click the scene to focus keyboard input.</p> : <>
          <p>Connect RIGHT_HAND on the existing Control page in the same browser and origin.</p>
          <p className={styles.sensorState}>Sensor: <strong data-testid="sensor-status">{sensorStatus}</strong></p>
          <p>{sensorStatus === "tracking" ? "Using final normalized coordinates directly." : "Ship is held. Move the gold dot to the blue dot in the alignment guide."}</p>
          <button onClick={() => controls.current?.alignSensor()}>Re-engage sensor</button>
        </>}
        <div className={styles.buttons}>
          <button disabled={status !== "ready"} onClick={() => controls.current?.start()}>Start</button>
          <button disabled={status !== "running" && status !== "paused"} onClick={() => status === "running" ? controls.current?.pause() : controls.current?.resume()}>{status === "paused" ? "Resume" : "Pause"}</button>
          <button disabled={status === "loading" || status === "error"} onClick={() => controls.current?.restart()}>Restart</button>
        </div>
        {gameplay && <section className={styles.stats} aria-label="Development gameplay statistics" data-testid="gameplay-stats" data-run={gameplay.runId} data-tier={gameplay.stats.upgradeTier} data-collected={gameplay.stats.ringsCollected} data-collisions={gameplay.stats.asteroidCollisions} data-resolved={gameplay.stats.resolved}>
          <h2>Mission {gameplay.mission}/3 · {gameplay.missionName}</h2>
          <dl>
            <dt>Score / ship tier</dt><dd>{gameplay.stats.score} / {gameplay.stats.upgradeTier}</dd>
            <dt>Rings collected / presented</dt><dd>{gameplay.stats.ringsCollected} / {gameplay.stats.ringsPresented}</dd>
            <dt>Rings missed</dt><dd>{gameplay.stats.ringsMissed}</dd>
            <dt>Collection accuracy</dt><dd>{gameplay.stats.collectionAccuracy === null ? "—" : `${Math.round(gameplay.stats.collectionAccuracy * 100)}%`}</dd>
            <dt>Asteroids presented</dt><dd>{gameplay.stats.asteroidsPresented}</dd>
            <dt>Avoided / impacts</dt><dd>{gameplay.stats.asteroidsAvoided} / {gameplay.stats.asteroidCollisions}</dd>
            <dt>Total progress</dt><dd>{gameplay.stats.resolved} / {gameplay.stats.totalEncounters}</dd>
          </dl>
          <progress aria-label="Total encounter progress" max={gameplay.stats.totalEncounters} value={gameplay.stats.resolved} />
        </section>}
        {status === "mission-complete" && <button className={styles.nextMission} onClick={() => controls.current?.nextMission()}>Launch mission {(gameplay?.mission ?? 1) + 1}</button>}
        <small>Collect gold rings. Steer around rocks and fiery asteroids.<br />Impacts keep your rings. Difficulty starts a new run.<br />Local statistics only · No saved session</small>
      </aside>
      {status === "ready" && <div className={styles.hint}>Ready for launch <span>Press Start on the flight deck</span></div>}
      {status === "paused" && <div className={styles.hint}>Flight paused <span>Resume when you are ready</span></div>}
      {status === "mission-complete" && <div className={styles.hint}>Mission complete <span>Launch the next mission on the flight deck</span></div>}
      {status === "complete" && <div className={styles.hint}>Flight complete · Well done! <span>{gameplay?.stats.ringsCollected ?? 0} rings collected · Restart for another flight</span></div>}
      {error && <div className={styles.failure} role="alert"><h2>3D preview unavailable</h2><p>{error}</p><button onClick={() => { setStatus("loading"); setError(null); setMode("keyboard"); setDifficulty("MEDIUM"); setGameplay(null); setSensorStatus("waiting"); setAttempt((value) => value + 1); }}>Retry renderer</button></div>}
      <footer className={styles.footer}>SHUMOS INTERACTIVE REHABILITATION <span>DEVELOPMENT ONLY · {mode === "sensor" ? "RIGHT_HAND LOCAL INPUT" : "KEYBOARD SIMULATION"}</span></footer>
    </main>
  );
}
