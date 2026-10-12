import { nextObjective, guidancePlacement } from "./objectiveGuidance";
import * as THREE from "three";
import { createFlightGraphics, QUALITY_DPR, type GraphicsQuality } from "./graphics";
import { PrototypeFlightInput } from "./prototypeInput";
import type { SensorInputStatus } from "./sensorInput";
import { type PrototypeControls, type PrototypeViewStatus } from "./simulation";
import { GameplaySimulation, type GameplaySnapshot } from "./gameplay";
import { DIFFICULTY_PRESETS } from "./missions";
import type { FlightSceneState, RemoteSceneDriver } from "./presentation";

/** All GPU resources belong to this instance, including partially built scenes. */
export function createPrototypeRenderer(canvas: HTMLCanvasElement, onStatus: (status: PrototypeViewStatus, message?: string) => void, onInputStatus: (status: SensorInputStatus) => void, inputGuide: HTMLElement, onGameplay: (snapshot: GameplaySnapshot) => void, remote?: RemoteSceneDriver, objectiveElement?: HTMLElement) {
  let graphics: ReturnType<typeof createFlightGraphics> | undefined;
  let quality: GraphicsQuality = "medium", adaptiveDpr = QUALITY_DPR.medium, reducedEffects = false, reducedCameraMotion = false;
  let measureAt = performance.now(), frameTimes: number[] = [], lastQualityAt = 0;
  let renderer: THREE.WebGLRenderer | undefined;
  let input: PrototypeFlightInput | undefined;
  let observer: ResizeObserver | undefined;
  let disposed = false;
  let failed = false;
  let previousFrameMs: number | null = null;
  // Paired Display never constructs or steps a gameplay simulation.
  const localSimulation = remote ? null : new GameplaySimulation({ sessionId: crypto.randomUUID() });
  let simulation: FlightSceneState = localSimulation ?? remote!.read();

  const pauseForVisibility = () => {
    if (document.hidden && simulation.status === "running") {
      localSimulation?.pause();
      input?.pause();
      previousFrameMs = null;
      onStatus("paused");
    }
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    failed = true;
    localSimulation?.pause();
    remote?.unavailable();
    input?.pause();
    renderer?.setAnimationLoop(null);
    onStatus("error", "The graphics context was lost. Retry the renderer to start a fresh demonstration.");
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderer?.setAnimationLoop(null);
    observer?.disconnect();
    input?.dispose();
    document.removeEventListener("visibilitychange", pauseForVisibility);
    canvas.removeEventListener("webglcontextlost", contextLost);
    graphics?.dispose();
    renderer?.dispose();
    canvas.dataset.graphicsDisposed = "true";
  };

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, adaptiveDpr));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    graphics = createFlightGraphics(renderer);
    const { scene, camera } = graphics;
    onStatus("loading");
    void graphics.ready.then(() => { if (!disposed) onStatus("ready"); }).catch((error: unknown) => {
      if (disposed) return;
      failed = true; remote?.unavailable(); renderer?.setAnimationLoop(null);
      onStatus("error", error instanceof Error ? error.message : "Spacecraft failed to load. Reload Display to retry.");
    });
    if (!remote) input = new PrototypeFlightInput(canvas);
    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      renderer!.setPixelRatio(Math.min(window.devicePixelRatio || 1, adaptiveDpr));
      renderer!.setSize(width, height, false);
      camera.aspect = width / height; camera.updateProjectionMatrix();
    };
    observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    document.addEventListener("visibilitychange", pauseForVisibility);
    canvas.addEventListener("webglcontextlost", contextLost);

    const controls: PrototypeControls = {
      start: () => { if (failed || disposed || !localSimulation) return; localSimulation.start(); input!.resume(); previousFrameMs = null; canvas.focus(); onStatus(simulation.status); },
      pause: () => { if (failed || disposed || !localSimulation) return; localSimulation.pause(); input!.pause(); previousFrameMs = null; onStatus(simulation.status); },
      resume: () => { if (failed || disposed || !localSimulation) return; localSimulation.resume(); input!.resume(); previousFrameMs = null; canvas.focus(); onStatus(simulation.status); },
      restart: () => { if (failed || disposed || !localSimulation) return; input!.reset(); localSimulation.restart(); previousFrameMs = null; canvas.focus(); onStatus(simulation.status); },
      setInputMode: (mode) => { if (failed || disposed || !localSimulation) return; input!.select(mode); localSimulation.invalidateInput(); },
      alignSensor: () => { if (failed || disposed || !localSimulation) return; input!.align(); localSimulation.invalidateInput(); },
      nextMission: () => { if (failed || disposed || !localSimulation) return; localSimulation.nextMission(); input!.resume(); previousFrameMs = null; canvas.focus(); onStatus(simulation.status); },
      setDifficulty: (difficulty) => { if (failed || disposed || !localSimulation) return; input!.reset(); localSimulation.restart(DIFFICULTY_PRESETS[difficulty]); previousFrameMs = null; canvas.focus(); onStatus(simulation.status); },
    };
    let reportedRevision = -1;
    let reportedSensorStatus: SensorInputStatus | null = null;
    const projectedObjective = new THREE.Vector3();
    const projectedHazard = new THREE.Vector3(), cameraHazard = new THREE.Vector3();
    let guidance: unknown = null;
    let guideX = NaN, guideY = NaN, rawX = NaN, rawY = NaN;
    renderer.setAnimationLoop(() => {
      // Match message receipt clocks; RAF's frame-start timestamp can be older
      // than a sync received immediately before this callback.
      const nowMs = performance.now();
      if (disposed || failed) return;
      const delta = previousFrameMs === null ? 0 : (nowMs - previousFrameMs) / 1000;
      previousFrameMs = nowMs;
      remote?.update(nowMs, delta);
      if (remote) simulation = remote.read();
      const pointer = input?.sample(delta > 0 && delta <= 0.25 ? delta : 0) ?? null;
      const beforeStatus = simulation.status;
      localSimulation?.step(delta, pointer);
      if (beforeStatus !== simulation.status) {
        if (simulation.status !== "running") input?.pause();
        onStatus(simulation.status);
      }
      if (reportedRevision !== simulation.revision) {
        reportedRevision = simulation.revision;
        if (localSimulation) onGameplay(localSimulation.snapshot()); // Outcomes/lifecycle only, never a movement sample.
      }
      if (input && reportedSensorStatus !== input.sensor.status) {
        reportedSensorStatus = input.sensor.status;
        onInputStatus(reportedSensorStatus); // Availability transitions only, never coordinates.
      }
      // Small development guide: DOM updates only when coordinates change.
      const position = input?.position ?? ("controlX" in simulation.ship ? { x: simulation.ship.controlX, y: simulation.ship.controlY } : { x: 0.5 + simulation.ship.x / 9.6, y: 0.5 - simulation.ship.y / 5.6 }), raw = input?.sensor.latestPointer ?? remote?.rawPointer?.();
      if (position.x !== guideX || position.y !== guideY) {
        guideX = position.x; guideY = position.y;
        inputGuide.style.setProperty("--ship-x", `${guideX * 100}%`);
        inputGuide.style.setProperty("--ship-y", `${guideY * 100}%`);
        inputGuide.dataset.flightX = String(guideX); inputGuide.dataset.flightY = String(guideY);
      }
      if (raw && (raw.x !== rawX || raw.y !== rawY)) {
        rawX = raw.x; rawY = raw.y;
        inputGuide.style.setProperty("--pointer-x", `${rawX * 100}%`);
        inputGuide.style.setProperty("--pointer-y", `${rawY * 100}%`);
      }
      inputGuide.dataset.pointerVisible = String(!!raw);
      graphics!.update(simulation, delta);
      renderer!.render(scene, camera);
      if(objectiveElement) {
        const objective = 'controlX' in simulation.ship && simulation.flightSettings && simulation.status==='running' ? nextObjective(simulation.ship,simulation.objects,simulation.flightSettings,simulation.accessibility) : null;
        objectiveElement.hidden = !objective;
        if(objective) {
          projectedObjective.set(objective.x,objective.y,objective.z).project(camera);
          const hazard=objective.kind==='route'?simulation.objects.find(o=>o.id===objective.id):undefined;
          let exclusion: {x:number;y:number;halfWidth:number;halfHeight:number}|undefined;
          if(hazard){
            projectedHazard.set(hazard.x,hazard.y,hazard.z).project(camera);
            cameraHazard.set(hazard.x,hazard.y,hazard.z).applyMatrix4(camera.matrixWorldInverse);
            const depth=Math.max(.1,-cameraHazard.z-hazard.radius);
            exclusion={x:projectedHazard.x,y:projectedHazard.y,halfWidth:camera.projectionMatrix.elements[0]*hazard.radius/depth+110/Math.max(1,canvas.clientWidth),halfHeight:camera.projectionMatrix.elements[5]*hazard.radius/depth+140/Math.max(1,canvas.clientHeight)};
          }
          const place=guidancePlacement(projectedObjective.x,projectedObjective.y,projectedObjective.z>1,exclusion);
          objectiveElement.hidden=place.obscured;
          objectiveElement.style.left=`${(place.x+1)*50}%`;objectiveElement.style.top=`${(1-place.y)*50}%`;
          objectiveElement.dataset.kind=objective.kind;objectiveElement.dataset.offscreen=String(place.offscreen);
          objectiveElement.style.setProperty('--guidance-angle',`${place.angle}deg`);
          const label=objectiveElement.querySelector('[data-objective-label]');if(label)label.textContent=objective.kind==='ring'?'الحلقة التالية':hazard&&Math.abs(objective.x-hazard.x)>1?'مرّ من الجانب':hazard&&objective.y>hazard.y?'تجاوز من أعلى':'تجاوز من أسفل';
          guidance={...objective,...place};
        } else guidance=null;
      }
      if (graphics!.loaded) remote?.presented?.();
      if (delta > 0) frameTimes.push(delta * 1000);
      if (frameTimes.length > 240) frameTimes.shift();
      if (nowMs - measureAt >= 1000 && frameTimes.length) {
        const sorted = [...frameTimes].sort((a, b) => a - b);
        const mean = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        canvas.dataset.graphicsMetrics = JSON.stringify({ quality, reducedEffects, reducedCameraMotion: reducedCameraMotion || !!simulation.flightSettings?.reducedCamera, guidance, worldPose: "z" in simulation.ship ? simulation.ship : null, cameraPosition: camera.position.toArray(), landmarks: graphics!.landmarkProjections(), dpr: renderer!.getPixelRatio(), fps: 1000 / mean, meanMs: mean, p95Ms: sorted[Math.floor(sorted.length * .95)], maxMs: sorted[sorted.length - 1], frames: sorted.length, drawCalls: renderer!.info.render.calls, triangles: renderer!.info.render.triangles, geometries: renderer!.info.memory.geometries, textures: renderer!.info.memory.textures, programs: renderer!.info.programs?.length, assetLoadMs: graphics!.assetLoadMs, loaded: graphics!.loaded, focused: document.hasFocus(), visible: !document.hidden });
        // Sustained GPU pressure lowers resolution, never changes input or simulation.
        if (nowMs - lastQualityAt > 5000 && frameTimes.length > 100 && mean > 22 && adaptiveDpr > .6) {
          adaptiveDpr = Math.max(.6, adaptiveDpr - .15); resize(); lastQualityAt = nowMs; frameTimes = [];
        }
        measureAt = nowMs;
      }
    });
    return { controls, dispose, setReducedCameraMotion(value: boolean) { reducedCameraMotion = value; graphics!.setReducedCameraMotion(value); }, setReducedEffects(value: boolean) { reducedEffects = value; graphics!.setReducedEffects(value); }, setQuality(value: GraphicsQuality) {
      quality = value; adaptiveDpr = QUALITY_DPR[value]; graphics!.setQuality(value); frameTimes = []; lastQualityAt = performance.now(); resize();
    } };
  } catch (error) {
    dispose();
    throw error;
  }
}
