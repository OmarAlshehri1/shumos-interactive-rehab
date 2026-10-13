import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { done as doneOf, type State } from '@/lib/achievementcity/engine';
import { LEVELS, focusMilestone, levelProgress, worldTargets } from '@/lib/achievementcity/milestones';
import { MAKERS } from './catalog';
import { Env } from './env';
import { Fx } from './fx';
import { buildClouds, buildForest, type Forest } from './forest';
import { disposeKit, shared } from './kit';
import type { Live, Made } from './builders1';
import { buildTerrain, buildWater } from './terrain';
import { createLife, type Life } from './life';

export interface SceneOptions { quality: 'high' | 'balanced' | 'low'; reducedEffects: boolean; reducedMotion: boolean; highContrast: boolean; cinematic: boolean }
export interface SceneStats { calls: number; triangles: number; geometries: number; textures: number; builds: number; baked: number; trees: number; pending: number }
export type SceneEvent = { type: 'start'; id: string; level: number; index: number } | { type: 'done'; id: string; level: number; index: number };

interface Entry { id: string; level: number; index: number; made: Made | null }

/** Camera framing per level: the world never resets, the camera just pulls back as the city grows. */
const FRAMING = [
  { look: new THREE.Vector3(-24, 3, 12), dist: 96, elev: 0.43, az: 0.14 },
  { look: new THREE.Vector3(-8, 3, 6), dist: 212, elev: 0.5, az: 0.08 },
  { look: new THREE.Vector3(-4, 4, 2), dist: 244, elev: 0.52, az: 0.06 },
];
const smooth = (a: number, b: number, k: number) => a + (b - a) * k;

export function createScene(canvas: HTMLCanvasElement, opts: SceneOptions, onEvent?: (e: SceneEvent) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.quality !== 'low', powerPreference: 'high-performance' });
  const pr = Math.min(window.devicePixelRatio || 1, opts.quality === 'high' ? 2 : opts.quality === 'balanced' ? 1.5 : 1);
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const shadows = opts.quality !== 'low';
  renderer.shadowMap.enabled = shadows;
  // the world is almost static: the shadow map is refreshed every other frame (halves the shadow pass; moving cars/planes lag by one frame)
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 2, 1400);
  const env = new Env(scene, shadows, opts.quality === 'high' ? 4096 : 2048);
  const terrain = buildTerrain(opts.quality);
  const water = buildWater();
  const forest: Forest = buildForest(opts.quality);
  const clouds = buildClouds();
  const fx = new Fx();
  fx.budget = opts.reducedEffects ? 0.35 : 1;
  const world = new THREE.Group();
  scene.add(terrain, water.mesh, forest.group, clouds.group, world, fx.group);

  const entries: Entry[] = [];
  LEVELS.forEach((lv) => lv.milestones.forEach((m, i) => entries.push({ id: m.id, level: lv.index, index: i, made: null })));
  const lives: Live[] = [];
  const life: Life = createLife(scene, opts.quality, opts.reducedMotion);
  const need = (e: Entry): Made | null => {
    if (e.made) return e.made;
    const mk = MAKERS[e.id];
    if (!mk) return null;
    e.made = mk();
    world.add(e.made.build.group);
    if (e.made.live) lives.push(e.made.live);
    return e.made;
  };

  // ---- composer (bloom only on 'high'; everything still renders without it) ----
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  const setupComposer = (w: number, h: number) => {
    if (opts.quality !== 'high' || opts.reducedEffects) return;
    try {
      const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.6, 0.88);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    } catch { composer = null; bloom = null; }
  };

  let width = 2, height = 2;
  const resize = (w: number, h: number) => {
    width = w; height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) { composer.setSize(w, h); composer.setPixelRatio(pr); } else setupComposer(w, h);
    fx.setView(h * pr, camera.fov);
  };

  // ---- state application ----
  let key = '';
  let first = true;
  let lastSeq = -1;
  let tod = 0.25, todTarget = 0.25;
  const cam = { look: FRAMING[0].look.clone(), dist: FRAMING[0].dist, elev: FRAMING[0].elev, az: FRAMING[0].az };
  let focus: THREE.Vector3 | null = null;
  let focusT = 0;
  let level = 0;
  let celebrate = 0;
  let finale = 0;
  let fireworkTimer = 0;
  let pendingCount = 0;
  const readyFlags = { lights: 0 };

  const applyState = (s: State) => {
    const done = doneOf(s);
    const complete = s.status === 'level-complete' || (s.status === 'ended' && done >= s.target);
    const targets = worldTargets({ level: s.level, done, target: s.target, complete });
    for (const e of entries) {
      const t = targets[e.level][e.index];
      const m = need(e);
      if (!m) continue;
      m.build.target = t;
      if (first) { m.build.apply(t); m.build.t = t; }
    }
    level = s.level;
    const pr2 = levelProgress(s.level, done, s.target);
    const p = complete ? 1 : (pr2.completed + pr2.partial) / pr2.total;
    todTarget = s.level === 0 ? 0.22 + 0.12 * p : s.level === 1 ? 0.36 + 0.24 * p : 0.6 + 0.35 * p;
    if (first) { tod = todTarget; const f0 = FRAMING[s.level]; cam.look.copy(f0.look); cam.dist = f0.dist; cam.elev = f0.elev; cam.az = f0.az; }
    const fm = focusMilestone(s.level, done, s.target);
    const fe = entries.find((e) => e.level === s.level && e.index === fm);
    if (fe?.made) { focus = fe.made.build.anchor.clone(); focusT = 3.2; }
    if (!first && lastSeq >= 0 && s.seq !== lastSeq && s.evt?.kind !== 'undo') {
      if (s.status === 'level-complete') { celebrate = 1; if (s.level === 2) finale = 1; }
    }
    if (first && s.status === 'level-complete' && s.level === 2) finale = 0.4;
    lastSeq = s.seq;
    first = false;
    readyFlags.lights = 0;
  };

  const updateBuilds = (dt: number) => {
    // order: earlier levels / milestones first; a pending build waits until the previous one is well under way
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
      if (diff !== 0 && Math.abs(diff) < 0.004) { b.apply(b.target); diff = 0; } // snap: a residual must never leave a build at 0.9996 (never merged)
      if (diff !== 0) {
        if (diff > 0 && !gate) continue;
        const rate = (opts.reducedMotion ? 3 : 1) * turbo / b.dur;
        const wasLow = b.t < 0.02;
        b.apply(THREE.MathUtils.clamp(b.t + Math.sign(diff) * Math.min(Math.abs(diff), rate * dt), 0, 1));
        if (diff > 0) {
          if (wasLow && b.t >= 0.02) onEvent?.({ type: 'start', id: e.id, level: e.level, index: e.index });
          if (!opts.reducedMotion && (turbo < 4 || Math.random() < 0.15)) fx.dust(b.anchor.x + (Math.random() - 0.5) * 5, b.anchor.y, b.anchor.z + (Math.random() - 0.5) * 5, 4, 1);
          if (b.t >= 1) { fx.ring(b.anchor.x, b.anchor.y, b.anchor.z, 9); fx.sparkle(b.anchor.x, b.anchor.y + 2, b.anchor.z, 26, 7); onEvent?.({ type: 'done', id: e.id, level: e.level, index: e.index }); }
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
  function draw(input: { state: State; connected: boolean }, dt: number, time: number) {
    const s = input.state;
    const k = `${s.run}:${s.level}:${s.seq}:${s.status}:${s.target}`;
    if (k !== key) { key = k; applyState(s); }
    const frozen = s.status === 'paused' || !input.connected;
    const sdt = frozen ? 0 : dt;
    simTime += sdt;
    shared.time.value = simTime;
    updateBuilds(frozen ? 0 : dt);
    for (const l of lives) l.update(sdt, simTime);
    tod += (todTarget - tod) * (1 - Math.exp(-dt * 0.8));
    env.set(tod);
    shared.night.value = env.night;
    const u = water.uniforms;
    u.uTime.value = simTime; u.uNight.value = env.night; (u.uSun.value as THREE.Vector3).copy(env.sunDir);
    (u.uSky.value as THREE.Color).copy(env.horizon); (u.uSunCol.value as THREE.Color).copy(env.sunColor);
    (u.uShallow.value as THREE.Color).copy(env.shallow); (u.uDeepC.value as THREE.Color).copy(env.deep); (u.uFog.value as THREE.Color).copy(scene.fog!.color);
    clouds.update(sdt, env.night);
    life.update(sdt, simTime, env.night, (id) => entries.find((e) => e.id === id)?.made?.build.t ?? 0, level);

    // celebration: gentle fireworks / confetti, never harsh flashes
    if (celebrate > 0 && !frozen) {
      celebrate = Math.max(0, celebrate - sdt / 5);
      const f = FRAMING[level];
      fireworkTimer -= sdt;
      if (fireworkTimer <= 0 && !opts.reducedEffects) {
        fireworkTimer = finale ? 0.55 : 0.9;
        const cols = ['#ffd966', '#ff8fb1', '#8fd8ff', '#b6f08a', '#ffffff'];
        fx.launch(f.look.x + (Math.random() - 0.5) * 70, f.look.z - 20 - Math.random() * 40, 36 + Math.random() * 14, cols[Math.floor(Math.random() * cols.length)]);
        if (Math.random() < 0.5) fx.confetti(f.look.x, 28, f.look.z, 14);
      }
    }
    if (finale > 0 && !frozen) finale = Math.max(0, finale - sdt / 22);
    fx.update(frozen ? 0 : dt);

    // camera: ease towards the level framing, drift gently, lean toward the current construction
    const fr = FRAMING[level];
    const kk = 1 - Math.exp(-dt * 0.9);
    cam.look.lerp(fr.look, kk); cam.dist = smooth(cam.dist, fr.dist * (1 + 0.1 * Math.min(1, celebrate + finale)), kk); cam.elev = smooth(cam.elev, fr.elev, kk); cam.az = smooth(cam.az, fr.az, kk);
    focusT = Math.max(0, focusT - dt);
    const fw = focus && focusT > 0 && !opts.reducedMotion ? Math.min(1, focusT / 1.2) * 0.22 : 0;
    lookTmp.copy(cam.look);
    if (focus) lookTmp.lerp(focus, fw);
    const drift = opts.cinematic && !opts.reducedMotion ? Math.sin(time * 0.06) * 0.11 + (finale > 0 ? Math.sin(time * 0.1) * 0.12 : 0) : 0;
    const az = cam.az + drift, el = cam.elev + (opts.cinematic && !opts.reducedMotion ? Math.sin(time * 0.045 + 1) * 0.015 : 0);
    camera.position.set(lookTmp.x + Math.sin(az) * Math.cos(el) * cam.dist, lookTmp.y + Math.sin(el) * cam.dist, lookTmp.z + Math.cos(az) * Math.cos(el) * cam.dist);
    camera.lookAt(lookTmp);
    // keep the sun's shadow box centred on what the camera sees
    env.sun.target.position.set(lookTmp.x, 0, lookTmp.z);
    env.sun.position.copy(env.sunDir).multiplyScalar(260).add(env.sun.target.position);
    if (bloom) bloom.strength = 0.16 + env.night * 0.34;
    renderer.toneMappingExposure = 1.0 - env.night * 0.08;
    if (shadows && (frame & 1) === 0) renderer.shadowMap.needsUpdate = true;
    if (composer) composer.render(); else renderer.render(scene, camera);
    frame++;
  }

  const stats = (): SceneStats => ({
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    builds: entries.filter((e) => e.made).length, baked: entries.filter((e) => e.made?.build.isBaked).length, trees: forest.count, pending: pendingCount,
  });
  /** For tests: current build progress per milestone id. */
  const progress = () => Object.fromEntries(entries.filter((e) => e.made).map((e) => [e.id, Math.round(e.made!.build.t * 100) / 100]));

  const dispose = () => {
    entries.forEach((e) => e.made?.build.dispose());
    forest.dispose(); clouds.dispose(); fx.dispose(); env.dispose(); life.dispose();
    terrain.geometry.dispose(); (terrain.material as THREE.Material).dispose();
    water.mesh.geometry.dispose(); (water.mesh.material as THREE.Material).dispose();
    disposeKit();
    composer?.dispose();
    renderer.dispose();
  };
  void frame; void width; void height; void readyFlags;
  return { renderer, draw, resize, stats, progress, dispose };
}
