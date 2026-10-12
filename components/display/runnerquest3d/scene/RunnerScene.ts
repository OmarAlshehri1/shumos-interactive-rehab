import * as THREE from "three";
import { LANE_WIDTH } from "@/lib/runnerquest3d/types";
import { RunnerCharacter } from "./character";
import { Own } from "./own";
import { paletteFor, type Palette } from "./palette";
import { Props } from "./props";
import { Sparkles } from "./sparkles";
import { QUALITY, QUALITY_ORDER, type Quality, type SceneFrame, type SceneStageInput, type SceneStats } from "./types";
import { World } from "./world";

const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export interface RunnerSceneOptions {
  quality: Quality;
  autoQuality?: boolean;
  onContextLost?: () => void;
  onQualityChange?: (q: Quality) => void;
}

/**
 * The Runner Quest 3D renderer. Pure presentation: it draws whatever SceneFrame it is
 * given and owns every GPU resource it creates (see dispose()). No game rules.
 */
export class RunnerScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 400);
  private own = new Own();
  private world: World;
  private props: Props | null = null;
  private propSnap: ReturnType<Own["snapshot"]> | null = null;
  private character: RunnerCharacter;
  private sparkles: Sparkles;
  private lastStars = -1;
  private hemi = new THREE.HemisphereLight(0xffffff, 0x446644, 1.1);
  private sun = new THREE.DirectionalLight(0xffffff, 2.6);
  private quality: Quality;
  private lastNow = 0;
  private x = 0;
  private camX = 0;
  private t = 0;
  private celebrateT = 0;
  private lastCelebrateSeq = -1;
  private palette: Palette = paletteFor("meadow");
  private frameMs: number[] = [];
  private frames = 0;
  private slowRun = 0;
  private disposed = false;
  private assetLoadMs = 0;
  private lastStats: SceneStats | null = null;
  private onLost = (e: Event) => { e.preventDefault(); this.opts.onContextLost?.(); };
  private stageInput: SceneStageInput | null = null;

  constructor(private canvas: HTMLCanvasElement, private opts: RunnerSceneOptions) {
    const t0 = performance.now();
    this.quality = opts.quality;
    const q = QUALITY[this.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    canvas.addEventListener("webglcontextlost", this.onLost);
    this.world = new World(this.own, this.scene, q);
    this.character = new RunnerCharacter(this.own);
    this.character.root.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; } });
    this.sparkles = new Sparkles(this.own);
    this.scene.add(this.character.root, this.sparkles.root, this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    this.applyQuality(this.quality);
    this.assetLoadMs = performance.now() - t0;
  }

  getQuality(): Quality { return this.quality; }

  setQuality(q: Quality): void {
    if (q === this.quality || this.disposed) return;
    this.quality = q;
    this.applyQuality(q);
    this.opts.onQualityChange?.(q);
  }

  private applyQuality(q: Quality): void {
    const p = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.dpr));
    const enabled = p.shadows > 0;
    this.renderer.shadowMap.enabled = enabled;
    this.sun.castShadow = enabled;
    if (enabled) {
      this.sun.shadow.mapSize.set(p.shadows, p.shadows);
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    }
    this.resize();
    this.scene.traverse((o) => { if (o instanceof THREE.Mesh && o.material) { const m = o.material as THREE.Material; m.needsUpdate = true; } });
  }

  resize(): void {
    const w = this.canvas.clientWidth || this.canvas.width || 1280, h = this.canvas.clientHeight || this.canvas.height || 720;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setStage(input: SceneStageInput, reducedMotion: boolean): void {
    this.stageInput = input;
    if (this.props) { this.scene.remove(this.props.root); if (this.propSnap) this.own.disposeSince(this.propSnap); }
    this.palette = paletteFor(input.spec.theme);
    const p = this.palette;
    this.scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
    this.hemi.color.setHex(p.hemiSky); this.hemi.groundColor.setHex(p.hemiGround); this.hemi.intensity = p.hemiI;
    this.sun.color.setHex(p.sun); this.sun.intensity = p.sunI;
    this.renderer.toneMappingExposure = p.exposure;
    // landmarks: bridges ~ every 190 m, never on top of the start area
    const bridges: number[] = [];
    for (let z = 95; z < input.length; z += 190) bridges.push(-z);
    this.world.setStage(p, input.length, reducedMotion, bridges);
    this.scene.background = this.world.skyTexture();
    this.propSnap = this.own.snapshot();
    this.props = new Props(this.own);
    this.props.build(input.encounters, input.length, input.spec.theme, input.spec.index === 8);
    this.scene.add(this.props.root);
    this.x = 0; this.camX = 0; this.lastStars = -1;
  }

  /** Draws one frame. `nowMs` is performance.now(). */
  render(frame: SceneFrame, nowMs: number): void {
    if (this.disposed || !this.stageInput) return;
    const dt = Math.min(0.1, Math.max(0.0001, this.lastNow ? (nowMs - this.lastNow) / 1000 : 0.016));
    if (this.lastNow) this.trackFrame(nowMs - this.lastNow);
    this.lastNow = nowMs;
    this.t += dt;
    const reduced = frame.reducedMotion;
    this.world.setReduced(reduced);
    // character placement
    const targetX = frame.lane * LANE_WIDTH;
    const prevX = this.x;
    this.x = damp(this.x, targetX, 9, dt);
    const lateralVel = (this.x - prevX) / dt / LANE_WIDTH;
    const z = -frame.distance;
    // hop derived from the authoritative distance and which hurdles were accepted
    let hop: number | null = null;
    const enc = this.stageInput.encounters;
    for (let i = 0; i < enc.length; i++) {
      const e = enc[i];
      if (e.kind !== "hurdle" || !e.lanes.includes(frame.lane)) continue;
      if (!(frame.armed[i] || !frame.footLiftRequired)) continue;
      const a = e.z - 1.35;
      if (frame.distance >= a && frame.distance <= e.z + 0.95) { hop = (frame.distance - a) / 2.3; break; }
    }
    if (frame.celebrateSeq !== this.lastCelebrateSeq) { if (this.lastCelebrateSeq !== -1) this.celebrateT = 1.2; this.lastCelebrateSeq = frame.celebrateSeq; }
    this.celebrateT = Math.max(0, this.celebrateT - dt);
    const celebrating = frame.mood === "celebrate" ? 0.5 : this.celebrateT > 0 ? 1 - this.celebrateT / 1.2 : 0;
    this.character.root.position.set(this.x, 0, z);
    this.character.update(dt, { speed: frame.speed, lateralVel, hop, celebrate: celebrating, mood: celebrating > 0 ? "celebrate" : frame.mood, reducedMotion: reduced });
    if (frame.stars > this.lastStars && this.lastStars >= 0 && !reduced) this.sparkles.spawn(this.x, 1.5, z - 0.4);
    this.lastStars = frame.stars;
    this.sparkles.update(dt);
    this.props?.update(this.t, frame.distance, frame.armed, frame.resolved, reduced);
    // camera: behind and above, gentle lateral follow, FOV widens a touch with speed
    this.camX = damp(this.camX, this.x * 0.55, 3.2, dt);
    this.camera.position.set(this.camX, 3.7, z + 7.6);
    this.camera.lookAt(this.camX * 0.9 + this.x * 0.1, 1.15, z - 7.5);
    const fov = 54 + (reduced ? 0 : Math.min(5, frame.speed * 0.9));
    if (Math.abs(this.camera.fov - fov) > 0.02) { this.camera.fov = damp(this.camera.fov, fov, 2, dt); this.camera.updateProjectionMatrix(); }
    this.world.update(dt, frame.distance, this.camera.position);
    this.sun.position.set(this.x - 9, 22, z + 10);
    this.sun.target.position.set(this.x, 0, z - 4);
    this.renderer.render(this.scene, this.camera);
    this.frames++;
  }

  private trackFrame(ms: number): void {
    if (ms > 1000) return; // tab was backgrounded; not a rendering cost
    this.frameMs.push(ms);
    if (this.frameMs.length > 240) this.frameMs.shift();
    if (this.opts.autoQuality && this.frameMs.length >= 120) {
      const avg = this.frameMs.slice(-120).reduce((a, b) => a + b, 0) / 120;
      this.slowRun = avg > 27 ? this.slowRun + 1 : 0;
      if (this.slowRun > 90) {
        this.slowRun = 0;
        const i = QUALITY_ORDER.indexOf(this.quality);
        if (i > 0) { this.frameMs = []; this.setQuality(QUALITY_ORDER[i - 1]); }
      }
    }
  }

  stats(): SceneStats {
    const f = this.frameMs;
    const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
    const info = this.renderer.info;
    this.lastStats = {
      fps: avg ? 1000 / avg : 0, frameMsAvg: avg, frameMsMax: f.length ? Math.max(...f) : 0,
      drawCalls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures,
      quality: this.quality, pixelRatio: this.renderer.getPixelRatio(), shadows: this.renderer.shadowMap.enabled, assetLoadMs: this.assetLoadMs, frames: this.frames,
    };
    return this.lastStats;
  }
  resetFrameStats(): void { this.frameMs = []; }
  resourceCounts() { return this.own.counts(); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.scene.traverse((o) => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    this.own.disposeAll();
    this.scene.clear();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
