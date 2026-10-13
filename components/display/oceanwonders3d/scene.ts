import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { done as doneOf, type State } from '@/lib/oceanwonders/engine';
import { LEVELS, focusMilestone, levelProgress, worldTargets } from '@/lib/oceanwonders/milestones';
import { MAKERS } from './catalog';
import { baseline } from './builders1';
import { disposeCreatures } from './creatures';
import { disposeFlora } from './flora';
import { Fx } from './fx';
import { U, disposeKit, setGlow, type Live, type Made } from './kit';
import { buildDome, buildSeabed, buildShafts, buildSnow, seabedY } from './seabed';
import { disposeStructures, lights, resetLights } from './structures';

export interface SceneOptions { quality: 'high' | 'balanced' | 'low'; reducedEffects: boolean; reducedMotion: boolean; highContrast: boolean; cinematic: boolean }
export interface SceneStats { cam: number[]; F: number; calls: number; triangles: number; geometries: number; textures: number; builds: number; baked: number; trees: number; pending: number }
export type SceneEvent = { type: 'start'; id: string; level: number; index: number } | { type: 'done'; id: string; level: number; index: number };
interface Entry { id: string; level: number; index: number; made: Made | null }

const Cc = (h: string) => new THREE.Color(h);
/** F = level + progress (0..3). Every key below describes the ocean at F = 0,1,2,3, so nothing ever "resets" between levels. */
const PALETTE = [
  { fog: Cc('#2bb4cf'), dens: 0.0072, top: Cc('#c4faff'), mid: Cc('#2bb4cf'), bot: Cc('#0c6a92'), hs: Cc('#a4ecff'), hg: Cc('#2f8a96'), hi: 1.05, sun: Cc('#fff3d6'), si: 2.4, shaft: 0.12, caus: 1.0, glow: 1.0 },
  { fog: Cc('#1a92c0'), dens: 0.0052, top: Cc('#9aeaf8'), mid: Cc('#1a92c0'), bot: Cc('#0a4d78'), hs: Cc('#8ad9ff'), hg: Cc('#1f6a8c'), hi: 1.0, sun: Cc('#ffeccc'), si: 2.2, shaft: 0.14, caus: 0.95, glow: 1.1 },
  { fog: Cc('#1c7fb0'), dens: 0.0037, top: Cc('#b8f0ff'), mid: Cc('#1c7fb0'), bot: Cc('#0f3f7c'), hs: Cc('#a4e4ff'), hg: Cc('#2f67a0'), hi: 1.08, sun: Cc('#ffe2b4'), si: 2.4, shaft: 0.2, caus: 1.05, glow: 1.3 },
  { fog: Cc('#1b77b4'), dens: 0.0031, top: Cc('#d6f4ff'), mid: Cc('#1b77b4'), bot: Cc('#15357f'), hs: Cc('#c0e8ff'), hg: Cc('#4a62b0'), hi: 1.12, sun: Cc('#ffe0b0'), si: 2.6, shaft: 0.3, caus: 1.1, glow: 1.6 },
];
/** Camera framing per F: the shot pulls back and rises as the ocean grows. */
const FRAMING = [
  { look: new THREE.Vector3(0, 4.6, 3), dist: 31, elev: 0.09, az: 0.12 },
  { look: new THREE.Vector3(0, 6.5, -8), dist: 62, elev: 0.11, az: 0.1 },
  { look: new THREE.Vector3(0, 9, -30), dist: 108, elev: 0.1, az: 0.07 },
  { look: new THREE.Vector3(0, 15, -58), dist: 150, elev: 0.09, az: 0.05 },
];
const lerpN = (a: number, b: number, k: number) => a + (b - a) * k;
const pal = (F: number) => { const i = Math.max(0, Math.min(2.9999, F)), a = Math.floor(i); return { a: PALETTE[a], b: PALETTE[a + 1], k: i - a, i: a }; };

export function createScene(canvas: HTMLCanvasElement, opts: SceneOptions, onEvent?: (e: SceneEvent) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.quality !== 'low', powerPreference: 'high-performance' });
  const pr = Math.min(window.devicePixelRatio || 1, opts.quality === 'high' ? 2 : opts.quality === 'balanced' ? 1.5 : 1);
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const shadows = opts.quality !== 'low';
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  resetLights();
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#1ba6bd', 0.005);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 1, 1600);

  const sun = new THREE.DirectionalLight('#fff3d6', 2.4);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(opts.quality === 'high' ? 4096 : 2048, opts.quality === 'high' ? 4096 : 2048);
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.35; sun.shadow.radius = 4;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 520;
  const hemi = new THREE.HemisphereLight('#a4ecff', '#2f8a96', 1.05);
  scene.add(sun, sun.target, hemi, lights.cave, lights.palace);

  const dome = buildDome();
  const seabed = buildSeabed(opts.quality);
  const shafts = buildShafts(opts.quality === 'low' ? 6 : 14);
  const snow = buildSnow(opts.quality === 'low' ? 160 : opts.reducedEffects ? 200 : 520);
  const fx = new Fx(opts.quality === 'low' ? 180 : 420, opts.quality === 'low' ? 160 : 360);
  fx.budget = opts.reducedEffects ? 0.35 : 1;
  const world = new THREE.Group();
  scene.add(dome, seabed, shafts.group, snow.points, world, fx.group);

  const base = baseline();
  world.add(base.build.group);
  base.build.bake();
  const entries: Entry[] = [];
  LEVELS.forEach((lv) => lv.milestones.forEach((m, i) => entries.push({ id: m.id, level: lv.index, index: i, made: null })));
  const lives: Live[] = base.live ? [base.live] : [];
  const need = (e: Entry): Made | null => {
    if (e.made) return e.made;
    const mk = MAKERS[e.id];
    if (!mk) return null;
    e.made = mk();
    world.add(e.made.build.group);
    if (e.made.live) lives.push(e.made.live);
    return e.made;
  };

  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  const setupComposer = (w: number, h: number) => {
    if (opts.quality !== 'high' || opts.reducedEffects) return;
    try {
      const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.7, 0.82);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    } catch { composer = null; bloom = null; }
  };
  const resize = (w: number, h: number) => {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) { composer.setSize(w, h); composer.setPixelRatio(pr); } else setupComposer(w, h);
  };

  // ---- state application ----
  let key = '';
  let first = true;
  let lastSeq = -1;
  let F = 0, Ft = 0;
  const cam = { look: FRAMING[0].look.clone(), dist: FRAMING[0].dist, elev: FRAMING[0].elev, az: FRAMING[0].az };
  let focus: THREE.Vector3 | null = null;
  let focusT = 0;
  let celebrate = 0;
  let finale = 0;
  let finaleHold = false;
  let pendingCount = 0;
  let ventT = 0;
  let warmTick = 0;
  let currentLevel = 0;

  const framing = (f: number) => {
    const i = Math.max(0, Math.min(2.9999, f)), a = Math.floor(i), k = i - a, A = FRAMING[a], B = FRAMING[a + 1];
    const e = k * k * (3 - 2 * k);
    return { look: A.look.clone().lerp(B.look, e), dist: lerpN(A.dist, B.dist, e), elev: lerpN(A.elev, B.elev, e), az: lerpN(A.az, B.az, e) };
  };
  const applyState = (s: State) => {
    const done = doneOf(s);
    const complete = s.status === 'level-complete' || (s.status === 'ended' && done >= s.target);
    const targets = worldTargets({ level: s.level, done, target: s.target, complete });
    for (const e of entries) {
      const t = targets[e.level][e.index];
      // only what the ocean currently shows is generated now; the rest is warmed one milestone at a time while idle
      if (t <= 0 && !e.made) continue;
      const m = need(e);
      if (!m) continue;
      m.build.target = t;
      if (first) { m.build.apply(t); m.build.t = t; }
    }
    const pr2 = levelProgress(s.level, done, s.target);
    const p = complete ? 1 : (pr2.completed + pr2.partial) / pr2.total;
    Ft = s.level + p;
    currentLevel = s.level;
    finaleHold = complete && s.level === 2;
    if (first) { F = Ft; const f0 = framing(F); cam.look.copy(f0.look); cam.dist = f0.dist; cam.elev = f0.elev; cam.az = f0.az; }
    const fm = focusMilestone(s.level, done, s.target);
    const fe = entries.find((e) => e.level === s.level && e.index === fm);
    if (fe?.made) { focus = fe.made.build.anchor.clone(); focusT = 3.4; }
    if (!first && lastSeq >= 0 && s.seq !== lastSeq && s.evt?.kind !== 'undo') {
      if (s.status === 'level-complete') { celebrate = 1; if (s.level === 2) finale = 1; }
    }
    if (first && finaleHold) finale = 0.35;
    lastSeq = s.seq;
    first = false;
  };

  const updateBuilds = (dt: number) => {
    pendingCount = 0;
    for (const e of entries) if (e.made && e.made.build.target !== e.made.build.t) pendingCount++;
    const turbo = pendingCount > 12 ? 8 : pendingCount > 6 ? 4 : pendingCount > 2 ? 2 : 1;
    let gate = true;
    let bakes = 0;
    for (const e of entries) {
      const m = e.made;
      if (!m) continue;
      const b = m.build;
      let diff = b.target - b.t;
      if (diff !== 0 && Math.abs(diff) < 0.004) { b.apply(b.target); diff = 0; }
      if (diff !== 0) {
        if (diff > 0 && !gate) continue;
        const rate = (opts.reducedMotion ? 3 : 1) * turbo / b.dur;
        const wasLow = b.t < 0.02;
        b.apply(THREE.MathUtils.clamp(b.t + Math.sign(diff) * Math.min(Math.abs(diff), rate * dt), 0, 1));
        if (diff > 0) {
          if (wasLow && b.t >= 0.02) { onEvent?.({ type: 'start', id: e.id, level: e.level, index: e.index }); fx.bubbleBurst(b.anchor.x, b.anchor.y + 1, b.anchor.z, 14, 6); }
          if (!opts.reducedMotion && (turbo < 4 || Math.random() < 0.2)) {
            fx.sparkle(b.anchor.x, b.anchor.y + 3, b.anchor.z, 2, 9, '#bff4ff', 1.4);
            if (Math.random() < 0.3) fx.bubbleBurst(b.anchor.x, b.anchor.y + 0.5, b.anchor.z, 1, 8);
          }
          if (b.t >= 1) { fx.ring(b.anchor.x, b.anchor.y, b.anchor.z, 14); fx.sparkle(b.anchor.x, b.anchor.y + 4, b.anchor.z, 34, 12, '#ffe9a8', 1.6); onEvent?.({ type: 'done', id: e.id, level: e.level, index: e.index }); }
          else if (b.t < b.target) gate = b.t > 0.3 ? gate : false;
        }
      } else if (b.t >= 1 && !b.isBaked && bakes < 1) {
        b.bake(); bakes++;
      }
      if (b.t >= 1) b.apply(1);
    }
  };

  // ---- drawing ----
  let simTime = 0;
  let frame = 0;
  const lookTmp = new THREE.Vector3();
  const tmpC = new THREE.Color();
  const sunDir = new THREE.Vector3(-0.38, 0.82, -0.42).normalize();
  const domeU = (dome.material as THREE.ShaderMaterial).uniforms;
  function draw(input: { state: State; connected: boolean }, dt: number, time: number) {
    const s = input.state;
    const k = `${s.run}:${s.level}:${s.seq}:${s.status}:${s.target}`;
    if (k !== key) { key = k; applyState(s); }
    const frozen = s.status === 'paused' || !input.connected;
    const sdt = frozen ? 0 : dt;
    simTime += sdt;
    U.time.value = simTime;
    updateBuilds(frozen ? 0 : dt);
    // idle warm-up: generate the next milestones (current level first, then the next) one at a time, never while something is growing
    if (!frozen && pendingCount === 0 && ++warmTick % 24 === 0) {
      const nxt = entries.find((e) => !e.made && e.level <= Math.min(2, currentLevel + 1));
      if (nxt) need(nxt);
    }
    for (const l of lives) l.update(sdt, simTime);

    // palette: one continuous ocean from F = 0 to 3
    F += (Ft - F) * (1 - Math.exp(-dt * 0.7));
    const { a, b, k: pk } = pal(F);
    const mixC = (x: THREE.Color, y: THREE.Color, out: THREE.Color) => out.copy(x).lerp(y, pk);
    mixC(a.fog, b.fog, tmpC); (scene.fog as THREE.FogExp2).color.copy(tmpC); (scene.fog as THREE.FogExp2).density = lerpN(a.dens, b.dens, pk);
    mixC(a.top, b.top, domeU.uTop.value as THREE.Color); mixC(a.mid, b.mid, domeU.uMid.value as THREE.Color); mixC(a.bot, b.bot, domeU.uBot.value as THREE.Color);
    (domeU.uSun.value as THREE.Vector3).copy(sunDir);
    mixC(a.hs, b.hs, hemi.color); mixC(a.hg, b.hg, hemi.groundColor); hemi.intensity = lerpN(a.hi, b.hi, pk);
    mixC(a.sun, b.sun, sun.color); sun.intensity = lerpN(a.si, b.si, pk) * (opts.highContrast ? 1.1 : 1);
    const lift = Math.min(1, celebrate * 0.5 + finale * 0.7);
    shafts.uniforms.uI.value = (lerpN(a.shaft, b.shaft, pk) + lift * 0.1) * (opts.reducedEffects ? 0.6 : 1);
    U.caus.value = lerpN(a.caus, b.caus, pk);
    const gk = lerpN(a.glow, b.glow, pk) * (1 + lift * 0.9);
    for (const g of ['palace', 'pearls', 'bloom', 'landmark', 'cave', 'bio', 'bio2', 'magic', 'jelly', 'warm']) setGlow(g, gk);
    domeU.uGlow.value = 1 + lift * 0.4;

    // ambient + growth vents
    ventT -= dt;
    if (ventT <= 0) {
      ventT = 0.9;
      fx.setVents(entries.flatMap((e) => (e.made && e.made.build.t > 0.9 ? e.made.vents ?? [] : [])).concat([new THREE.Vector3(-24, seabedY(-24, 6) + 0.4, 6), new THREE.Vector3(17, seabedY(17, -6) + 0.4, -6)]));
    }
    // celebration: gentle motes and bubbles, never harsh flashes
    if ((celebrate > 0 || finale > 0) && !frozen) {
      celebrate = Math.max(0, celebrate - sdt / 6);
      if (Math.random() < 0.5 * fx.budget * (finale > 0 ? 1.6 : 1)) {
        const f = framing(Ft);
        fx.sparkle(f.look.x + (Math.random() - 0.5) * f.dist * 0.9, 2 + Math.random() * 12, f.look.z - 10 - Math.random() * f.dist * 0.4, 3, 8, ['#ffe9a8', '#ffc2ee', '#bff4ff'][Math.floor(Math.random() * 3)], 2.4);
        fx.bubbleBurst(f.look.x + (Math.random() - 0.5) * f.dist * 0.8, 0.5, f.look.z - Math.random() * f.dist * 0.4, 2, 8);
      }
    }
    if (finale > 0 && !frozen) finale = Math.max(0, finale - sdt / 26);
    fx.update(frozen ? 0 : dt);

    // camera: follows the growing ocean (continuous framing), drifts gently, leans toward the newest growth
    const fr = framing(F);
    const kk = 1 - Math.exp(-dt * 0.9);
    cam.look.lerp(fr.look, kk); cam.dist = lerpN(cam.dist, fr.dist * (1 + 0.14 * Math.min(1, celebrate + finale)), kk); cam.elev = lerpN(cam.elev, fr.elev, kk); cam.az = lerpN(cam.az, fr.az, kk);
    focusT = Math.max(0, focusT - dt);
    const fw = focus && focusT > 0 && !opts.reducedMotion ? Math.min(1, focusT / 1.2) * 0.2 : 0;
    lookTmp.copy(cam.look);
    if (focus) lookTmp.lerp(focus, fw);
    const drift = opts.cinematic && !opts.reducedMotion ? Math.sin(time * 0.05) * 0.1 + (finale > 0 ? Math.sin(time * 0.09) * 0.1 : 0) : 0;
    const az = cam.az + drift, el = cam.elev + (opts.cinematic && !opts.reducedMotion ? Math.sin(time * 0.04 + 1) * 0.012 : 0);
    camera.position.set(lookTmp.x + Math.sin(az) * Math.cos(el) * cam.dist, Math.max(2.2, lookTmp.y + Math.sin(el) * cam.dist), lookTmp.z + Math.cos(az) * Math.cos(el) * cam.dist);
    camera.lookAt(lookTmp);
    dome.position.copy(camera.position);
    snow.uniforms.uCenter.value.copy(lookTmp);

    // shadow box follows what the camera sees
    const ext = 36 + Math.min(3, F) * 38;
    const sc = sun.shadow.camera;
    if (Math.abs(sc.right - ext) > 1) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
    sun.target.position.set(lookTmp.x, 0, lookTmp.z - ext * 0.3);
    sun.position.copy(sunDir).multiplyScalar(260).add(sun.target.position);
    sun.target.updateMatrixWorld();
    if (bloom) bloom.strength = 0.28 + lift * 0.3;
    if (shadows && (pendingCount > 0 || (frame % 24) === 0 || frame < 4)) renderer.shadowMap.needsUpdate = true;
    if (composer) composer.render(); else renderer.render(scene, camera);
    frame++;
  }

  const stats = (): SceneStats => ({
    cam: [Math.round(camera.position.x), Math.round(camera.position.y), Math.round(camera.position.z), Math.round(cam.dist)], F: Math.round(F * 100) / 100,
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    builds: entries.filter((e) => e.made).length, baked: entries.filter((e) => e.made?.build.isBaked).length, trees: 0, pending: pendingCount,
  });
  /** For tests: current build progress per milestone id. */
  const progress = () => Object.fromEntries(entries.map((e) => [e.id, e.made ? Math.round(e.made.build.t * 100) / 100 : 0]));

  const dispose = () => {
    entries.forEach((e) => e.made?.build.dispose());
    base.build.dispose();
    fx.dispose(); shafts.dispose(); snow.dispose();
    (dome.material as THREE.Material).dispose(); dome.geometry.dispose();
    seabed.geometry.dispose();
    disposeKit(); disposeFlora(); disposeCreatures(); disposeStructures();
    composer?.dispose();
    renderer.dispose();
  };
  return { renderer, draw, resize, stats, progress, dispose };
}
