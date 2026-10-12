import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { guideOf, type Guide } from '@/lib/bodysequence3d/captions';
import { currentRound, sequencesDone, type State } from '@/lib/bodysequence3d/engine';
import { layoutOf, type Box, type Layout } from '@/lib/bodysequence3d/layout';
import type { Lane } from '@/lib/bodysequence3d/sequence';
import { STAGES } from '@/lib/bodysequence3d/stages';
import { ParticlePool } from './particles';
import { buildReward, GLOW_COLOR, type Reward } from './reward';
import { drawFoot } from './glyph';
import { checkTexture, floorTexture, glowTexture, glyphTexture, lanePlateTexture, padFaceTexture, ringTexture, stopTexture, TONE, wallTexture, type GlyphTone } from './textures';

export type Quality = 'high' | 'balanced' | 'low';
export interface SceneOptions { quality: Quality; reducedEffects: boolean; reducedMotion: boolean; highContrast: boolean }
export interface DrawInput {
  state: State;
  connected: boolean;
  /** Visual running clock (ms): the Display's own extrapolation of the authoritative clock. */
  clock: number;
}
export interface SceneStats { calls: number; triangles: number; geometries: number; textures: number; frameMs: number; particles: number; laneBuilds: number }

const TILT = (18 * Math.PI) / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const TONE_COLOR: Record<GlyphTone, number> = { idle: 0x38d9ff, dim: 0x24608c, active: 0xff9a1f, done: 0x35e58b, hold: 0x38d9ff, stop: 0xff4b55 };
const TONE_OPACITY: Record<GlyphTone, number> = { idle: 0.62, dim: 0.34, active: 1, done: 1, hold: 0.95, stop: 1 };

function rrect(w: number, h: number, r: number, hole?: { w: number; h: number; r: number }): THREE.Shape {
  const trace = (p: THREE.Path | THREE.Shape, W: number, H: number, R: number) => {
    const x = -W / 2, y = -H / 2;
    p.moveTo(x + R, y); p.lineTo(x + W - R, y); p.quadraticCurveTo(x + W, y, x + W, y + R); p.lineTo(x + W, y + H - R); p.quadraticCurveTo(x + W, y + H, x + W - R, y + H);
    p.lineTo(x + R, y + H); p.quadraticCurveTo(x, y + H, x, y + H - R); p.lineTo(x, y + R); p.quadraticCurveTo(x, y, x + R, y);
  };
  const s = new THREE.Shape();
  trace(s, w, h, r);
  if (hole) { const p = new THREE.Path(); trace(p, hole.w, hole.h, hole.r); s.holes.push(p); }
  return s;
}

interface LaneObj {
  lane: Lane;
  box: Box;
  group: THREE.Group;
  face: THREE.Mesh;
  halo: THREE.Mesh;
  border: THREE.Mesh;
  glow: THREE.Mesh;
  glyph: THREE.Mesh;
  plate: THREE.Mesh;
  check: THREE.Mesh;
  pulse: THREE.Mesh;
  stop: THREE.Mesh;
  arc: THREE.Mesh;
  glyphKey: string;
  plateKey: string;
  doneAt: number;
  popAt: number;
}

interface LaneSpec { tone: GlyphTone; foot: 'R' | 'L' | null; order: number; lock: boolean; arrow: boolean; glyph: boolean; arc: number; stop: boolean }

export function createScene(canvas: HTMLCanvasElement, opts: SceneOptions) {
  const lq = opts.quality === 'low' || opts.reducedEffects;
  const calm = opts.reducedMotion;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.quality !== 'low', powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.quality === 'high' ? 2 : opts.quality === 'balanced' ? 1.5 : 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.highContrast ? 1.15 : 1.0;
  renderer.shadowMap.enabled = !lq;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x050818);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050818, 48, 90);
  const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 1, 90);
  const camDist = 36;
  camera.position.set(0, camDist * Math.cos(TILT), camDist * Math.sin(TILT));
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  let aspect = 16 / 9, fit = 1.136, halfH = 4.5;

  let envRt: THREE.WebGLRenderTarget | null = null;
  if (!lq) {
    const pm = new THREE.PMREMGenerator(renderer);
    envRt = pm.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRt.texture;
    scene.environmentIntensity = 0.38;
    pm.dispose();
  }

  const pool = new ParticlePool(lq ? 160 : 520);
  scene.add(pool.points);
  const own: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { own.push(x); return x; };
  const planeGeo = keep(new THREE.PlaneGeometry(1, 1));
  planeGeo.rotateX(-Math.PI / 2);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1040, 0.9));
  const key = new THREE.DirectionalLight(0xdbe8ff, 1.5);
  key.position.set(-6, 14, 5);
  key.castShadow = !lq;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -11, right: 11, top: 8, bottom: -8, near: 1, far: 40 });
  key.shadow.bias = -0.0006;
  scene.add(key);
  const cyanL = new THREE.PointLight(0x38d9ff, 120, 16, 2); cyanL.position.set(-7, 3.2, 0.5);
  const magL = new THREE.PointLight(0xff4fd8, 120, 16, 2); magL.position.set(7, 3.2, 0.5);
  const violetL = new THREE.PointLight(0x8a5cff, 70, 14, 2); violetL.position.set(0, 3, -4);
  scene.add(cyanL, magL, violetL);

  // ---------- arena (floor, walls, neon, crystals, dust) ----------
  const arena = new THREE.Group();
  scene.add(arena);
  const floorTex = floorTexture();
  floorTex.repeat.set(9, 7);
  const floor = new THREE.Mesh(planeGeo, keep(new THREE.MeshStandardMaterial({ map: floorTex, color: 0xffffff, metalness: 0.55, roughness: 0.42, envMapIntensity: 0.8 })));
  floor.scale.set(72, 1, 56);
  floor.receiveShadow = !lq;
  arena.add(floor);
  const flat = (tex: THREE.Texture | null, w: number, h: number, o: { color?: number; opacity?: number; additive?: boolean; y?: number; order?: number } = {}) => {
    const m = keep(new THREE.MeshBasicMaterial({ map: tex, color: o.color ?? 0xffffff, transparent: true, opacity: o.opacity ?? 1, depthWrite: false, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, toneMapped: false }));
    const mesh = new THREE.Mesh(planeGeo, m);
    mesh.scale.set(w, 1, h);
    mesh.position.y = o.y ?? 0.03;
    mesh.renderOrder = o.order ?? 2;
    return mesh;
  };
  const glowTex = glowTexture();
  // soft pools of coloured light on the floor: cyan on the child's left of the picture, magenta on the right (reference mood)
  const poolL = flat(glowTex, 9, 9, { color: 0x1fa8ff, additive: true, opacity: 0.55, y: 0.012, order: 1 });
  const poolR = flat(glowTex, 9, 9, { color: 0xff3fc8, additive: true, opacity: 0.4, y: 0.012, order: 1 });
  const poolC = flat(glowTex, 14, 8, { color: 0x4a3cff, additive: true, opacity: 0.25, y: 0.011, order: 1 });
  arena.add(poolL, poolR, poolC);

  const wallTex = wallTexture();
  const wallMat = keep(new THREE.MeshStandardMaterial({ map: wallTex, color: 0xffffff, metalness: 0.8, roughness: 0.2, emissive: 0x0a1a44, emissiveIntensity: 0.6 }));
  const neonCyan = keep(new THREE.MeshBasicMaterial({ color: 0x38d9ff, toneMapped: false }));
  const neonMag = keep(new THREE.MeshBasicMaterial({ color: 0xff4fd8, toneMapped: false }));
  const neonViolet = keep(new THREE.MeshBasicMaterial({ color: 0x8a5cff, toneMapped: false }));
  const tubeGeo = keep(new THREE.CylinderGeometry(0.05, 0.05, 1, 10));
  const boxGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const walls = new THREE.Group();
  arena.add(walls);
  const crystalGeo = keep(new THREE.ConeGeometry(0.5, 1, 6));
  const crystalMat = keep(new THREE.MeshStandardMaterial({ color: 0xcfe8ff, emissive: 0x2f8cff, emissiveIntensity: 0.9, metalness: 0.15, roughness: 0.08, transparent: true, opacity: 0.8, flatShading: true }));
  const crystalMatM = keep(new THREE.MeshStandardMaterial({ color: 0xffd0f4, emissive: 0xc83cff, emissiveIntensity: 0.9, metalness: 0.15, roughness: 0.08, transparent: true, opacity: 0.8, flatShading: true }));
  const crystals = new THREE.Group();
  arena.add(crystals);
  let arenaKey = '';
  function buildWalls() {
    const k = `${aspect.toFixed(2)}|${fit.toFixed(3)}`;
    if (k === arenaKey) return;
    arenaKey = k;
    walls.clear(); crystals.clear();
    const halfW = halfH * aspect;
    const zTop = -halfH - 0.2;
    // far wall: dark glass panels with neon seams (the reference's windowed wall)
    const n = Math.max(5, Math.round((halfW * 2) / 3.2));
    const pw = (halfW * 2 + 2) / n;
    for (let i = 0; i < n; i++) {
      const x = -halfW - 1 + pw * (i + 0.5);
      const p = new THREE.Mesh(boxGeo, wallMat); p.scale.set(pw - 0.12, 2.8, 0.18); p.position.set(x, 1.4, zTop - 0.1); p.castShadow = false; walls.add(p);
      const seam = new THREE.Mesh(tubeGeo, i % 2 ? neonMag : neonCyan); seam.scale.set(1, 2.9, 1); seam.position.set(x - pw / 2, 1.45, zTop + 0.05); walls.add(seam);
    }
    const rail = new THREE.Mesh(boxGeo, neonViolet); rail.scale.set(halfW * 2 + 2, 0.07, 0.07); rail.position.set(0, 0.04, zTop + 0.1); walls.add(rail);
    // floor trim: cyan on the left edge, magenta on the right, violet along the far edge
    for (const [sx, m] of [[-1, neonCyan], [1, neonMag]] as const) {
      const t = new THREE.Mesh(boxGeo, m); t.scale.set(0.09, 0.05, halfH * 2 + 0.4); t.position.set(sx * (halfW - 0.18), 0.03, -0.1); walls.add(t);
      const vt = new THREE.Mesh(tubeGeo, m); vt.scale.set(1, 3.4, 1); vt.position.set(sx * (halfW - 0.1), 1.7, zTop + 0.1); walls.add(vt);
    }
    // crystal clusters in the far corners and low corners (outside every lane and reward)
    const spots: [number, number, number, boolean][] = [[-halfW + 1.3, -halfH + 0.9, 1, false], [halfW - 1.3, -halfH + 0.9, 1.1, true], [-halfW + 0.9, halfH - 0.8, 0.8, false], [halfW - 0.9, halfH - 0.8, 0.85, true], [-halfW + 2.6, -halfH + 0.6, 0.6, false], [halfW - 2.6, -halfH + 0.6, 0.65, true]];
    spots.forEach(([x, z, s, mag], i) => {
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: mag ? 0xd24bff : 0x2f9cff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      gl.scale.setScalar(3.4 * s); gl.position.set(x, 0.5, z); crystals.add(gl);
      for (let j = 0; j < 6; j++) {
        const c = new THREE.Mesh(crystalGeo, mag ? crystalMatM : crystalMat);
        const hgt = (0.8 + ((i * 3 + j * 5) % 7) * 0.16) * s;
        c.scale.set(0.42 * s, hgt, 0.42 * s);
        const a = j * 1.05 + i;
        c.position.set(x + Math.cos(a) * 0.3 * s * (j % 3), hgt * 0.5, z + Math.sin(a) * 0.26 * s * (j % 3));
        c.rotation.set(Math.sin(a * 2) * 0.28, j * 0.9, Math.cos(a * 3) * 0.28);
        c.castShadow = !lq;
        crystals.add(c);
      }
    });
  }

  // floating motes
  const dustN = lq ? 50 : 130;
  const dustPos = new Float32Array(dustN * 3), dustSeed = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dustSeed[i * 3] = Math.random() * 6.28; dustSeed[i * 3 + 1] = Math.random() * 6.28; dustSeed[i * 3 + 2] = 0.5 + Math.random(); }
  const dustGeo = keep(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, keep(new THREE.PointsMaterial({ map: glowTex, color: 0x9fd8ff, size: 0.2, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));
  dust.frustumCulled = false;
  scene.add(dust);

  // ---------- field (lanes) ----------
  const fieldOuter = new THREE.Group();
  const fieldInner = new THREE.Group();
  fieldOuter.add(fieldInner);
  scene.add(fieldOuter);
  let layout: Layout = layoutOf(2, 1, false);
  let lanes: LaneObj[] = [];
  let laneKey = '';
  let laneBuilds = 0;
  let laneDisposables: { dispose(): void }[] = [];
  const faceTex = padFaceTexture();
  const checkTex = checkTexture();
  const ringTex = ringTexture();
  const stopTex = stopTexture();

  function buildLanes(l: Layout, hc: boolean) {
    for (const d of laneDisposables) d.dispose();
    laneDisposables = [];
    fieldInner.clear();
    lanes = [];
    laneBuilds++;
    const own2 = <T extends { dispose(): void }>(x: T): T => { laneDisposables.push(x); return x; };
    const all: [Lane, Box][] = [...(['L', 'C', 'R'] as const).flatMap((k) => (l.boxes[k] ? [[k, l.boxes[k]!] as [Lane, Box]] : [])), ['H', l.home]];
    for (const [lane, box] of all) {
      const grp = new THREE.Group();
      grp.position.set(box.x, 0, -box.y);
      const r = Math.min(box.w, box.h) * 0.14;
      const slabGeo = own2(new THREE.ExtrudeGeometry(rrect(box.w, box.h, r), { depth: 0.05, bevelEnabled: false }));
      slabGeo.rotateX(-Math.PI / 2);
      const slab = new THREE.Mesh(slabGeo, own2(new THREE.MeshStandardMaterial({ color: 0x0a1230, metalness: 0.7, roughness: 0.3 })));
      slab.receiveShadow = !lq;
      const mk = (tex: THREE.Texture | null, w: number, h: number, y: number, order: number, additive = false, color = 0xffffff) => {
        const m = own2(new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 1, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false, side: THREE.DoubleSide }));
        const mesh = new THREE.Mesh(planeGeo, m);
        mesh.scale.set(w, 1, h); mesh.position.y = y; mesh.renderOrder = order;
        return mesh;
      };
      const face = mk(faceTex, box.w - 0.1, box.h - 0.1, 0.056, 1);
      const glow = mk(glowTex, box.w * 1.5, box.h * 1.5, 0.058, 2, true, TONE_COLOR.idle);
      const bw = hc ? 0.2 : 0.13;
      const ringGeo = (grow: number, th: number) => { const g = own2(new THREE.ShapeGeometry(rrect(box.w + grow, box.h + grow, r + grow / 2, { w: box.w + grow - th * 2, h: box.h + grow - th * 2, r: Math.max(0.05, r + grow / 2 - th) }))); g.rotateX(-Math.PI / 2); return g; };
      const border = new THREE.Mesh(ringGeo(0, bw), own2(new THREE.MeshBasicMaterial({ color: TONE_COLOR.idle, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false })));
      border.position.y = 0.062; border.renderOrder = 4;
      const halo = new THREE.Mesh(ringGeo(0.26, 0.3), own2(new THREE.MeshBasicMaterial({ color: TONE_COLOR.idle, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
      halo.position.y = 0.059; halo.renderOrder = 3;
      const gs = lane === 'H' ? box.h * 1.7 : Math.min(box.h * 0.92, box.w * 1.35);
      const glyph = mk(null, gs, gs, 0.07, 5);
      glyph.position.z = lane === 'H' ? 0 : -0.1;
      const plate = mk(null, Math.min(box.w * 0.7, 2.6), Math.min(box.w * 0.7, 2.6) / 4, 0.066, 5);
      plate.position.z = lane === 'H' ? box.h / 2 + 0.42 : box.h / 2 - 0.34;
      const cs = Math.min(box.w, box.h) * 0.55;
      const check = mk(checkTex, cs, cs, 0.09, 8);
      const pulse = mk(ringTex, box.w, box.w, 0.075, 6, true, 0x35e58b);
      const ss = Math.min(box.w, box.h) * 0.78;
      const stop = mk(stopTex, ss, ss, 0.085, 7);
      const arcGeo = own2(new THREE.RingGeometry(Math.min(box.w, box.h) * 0.46, Math.min(box.w, box.h) * 0.5, 64, 1, 0, Math.PI * 2));
      arcGeo.rotateX(-Math.PI / 2);
      const arc = new THREE.Mesh(arcGeo, own2(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false })));
      arc.position.y = 0.08; arc.renderOrder = 7; arc.visible = false;
      grp.add(slab, face, glow, halo, border, glyph, plate, pulse, check, stop, arc);
      fieldInner.add(grp);
      lanes.push({ lane, box, group: grp, face, halo, border, glow, glyph, plate, check, pulse, stop, arc, glyphKey: '', plateKey: '', doneAt: -1e9, popAt: -1e9 });
    }
  }

  // ---------- reward ----------
  let reward: Reward | null = null;
  let rewardKind = '';
  const rewardLeft = new THREE.Group();
  const columnGroup = new THREE.Group();
  scene.add(rewardLeft, columnGroup);
  const colMats: THREE.MeshStandardMaterial[] = [];
  let colSlots: THREE.Mesh[] = [];
  let colGem: THREE.Mesh | null = null;
  let colLit: number[] = [];
  const colDisposables: { dispose(): void }[] = [];
  let colN = 0;
  function buildColumn(n: number, kind: string) {
    for (const d of colDisposables) d.dispose();
    colDisposables.length = 0; columnGroup.clear(); colMats.length = 0; colSlots = []; colLit = [];
    colN = n;
    const dd = <T extends { dispose(): void }>(x: T): T => { colDisposables.push(x); return x; };
    const slotGeo = dd(new RoundedBoxGeometry(0.9, 0.34, 0.6, 3, 0.12));
    const frame = dd(new THREE.CylinderGeometry(0.035, 0.035, 1, 8));
    const frameMat = dd(new THREE.MeshBasicMaterial({ color: 0x38d9ff, transparent: true, opacity: 0.55, toneMapped: false }));
    const span = 4.6, step = span / n;
    for (let i = 0; i < n; i++) {
      const m = dd(new THREE.MeshStandardMaterial({ color: 0x7a86a8, emissive: i % 2 ? 0xff6a3d : 0xffb21f, emissiveIntensity: 0.1, metalness: 0.4, roughness: 0.25, transparent: true, opacity: 0.45 }));
      colMats.push(m); colLit.push(0);
      const s = new THREE.Mesh(slotGeo, m);
      s.position.set(0, 0.2, span / 2 - step * (i + 0.5)); s.castShadow = !lq;
      colSlots.push(s); columnGroup.add(s);
    }
    for (const sx of [-0.5, 0.5]) { const f = new THREE.Mesh(frame, frameMat); f.rotation.x = Math.PI / 2; f.scale.set(1, span + 0.5, 1); f.position.set(sx, 0.2, 0); columnGroup.add(f); }
    const gm = dd(new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x38d9ff, emissiveIntensity: 0.5, metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.7, flatShading: true }));
    colMats.push(gm);
    colGem = new THREE.Mesh(dd(new THREE.OctahedronGeometry(0.42, 0)), gm);
    colGem.scale.set(1, 1.5, 1);
    colGem.position.set(0, 0.7, -span / 2 - 0.55); columnGroup.add(colGem);
    void kind;
  }

  const sparkle = (x: number, y: number, z: number, cols: number[], style: 'spark' | 'ring' | 'confetti' | 'stream', big = false) => pool.burst(x, y, z, cols, style, lq ? 0.5 : 1, big);

  // ---------- per-frame state ----------
  let prevStepSeq = -1, prevRoundSeq = -1, prevCue = -1, prevStatus = '', prevRun = -1, prevStage = -1;
  let lastLane: Lane | null = null;
  let cueAt = -1e9, cueKind = '';
  let stageDoneAt = -1e9;
  let frameMs = 0;
  let h = 9;

  function laneSpecs(s: State, g: Guide, dim: boolean): Map<Lane, LaneSpec> {
    const out = new Map<Lane, LaneSpec>();
    const base = (): LaneSpec => ({ tone: dim ? 'dim' : 'idle', foot: null, order: 0, lock: false, arrow: true, glyph: false, arc: -1, stop: false });
    for (const k of ['L', 'C', 'R', 'H'] as Lane[]) out.set(k, base());
    if (dim) return out;
    const rd = currentRound(s);
    const step = g.step;
    const holdProgress = s.hold ? clamp01((s.clock - s.hold.startedAt) / s.hold.ms) : -1;
    const show = (lane: Lane, patch: Partial<LaneSpec>) => out.set(lane, { ...out.get(lane)!, ...patch });
    if (g.phase === 'preview' && g.previewIndex >= 0) {
      const st = rd.steps[g.previewIndex];
      if (st && st.move !== 'stop') {
        show(st.lane, { tone: 'active', foot: st.foot === 'any' ? null : st.foot, order: g.previewIndex + 1, glyph: true });
        if (st.anchor) show(st.anchor.lane, { tone: 'hold', foot: st.anchor.foot, lock: true, glyph: true, arrow: false });
      } else if (st) for (const k of ['L', 'C', 'R'] as Lane[]) show(k, { tone: 'stop', stop: true });
    } else if ((g.phase === 'go' || g.phase === 'hold') && step) {
      const showIt = g.revealed;
      if (step.move === 'stop') {
        for (const k of ['L', 'C', 'R'] as Lane[]) show(k, { tone: 'stop', stop: true, arc: g.phase === 'hold' ? holdProgress : -1 });
      } else if (showIt) {
        const order = rd.showAll || rd.mode === 'remember' ? g.stepIndex + 1 : 0;
        show(step.lane, { tone: 'active', foot: step.foot === 'any' ? null : step.foot, order, glyph: true, arc: g.phase === 'hold' ? holdProgress : -1 });
        if (step.anchor) show(step.anchor.lane, { tone: 'hold', foot: step.anchor.foot, lock: true, glyph: true, arrow: false });
      }
    } else if (g.phase === 'complete' || g.phase === 'ended') {
      for (const k of ['L', 'C', 'R'] as Lane[]) show(k, { tone: 'done' });
    }
    return out;
  }

  function fitField(s: State, l: Layout) {
    const rot = (s.config.rot + s.config.proj.rot) % 360;
    fieldOuter.rotation.y = (-rot * Math.PI) / 180;
    fieldInner.position.set(0, 0, l.centerY);
    // when the child stands at a side edge the lane row runs up the picture: shrink it to the safe height
    const vertical = rot === 90 || rot === 270;
    const room = (halfH * 2) - 1.4;
    fieldOuter.scale.setScalar(vertical ? Math.min(1, room / l.width) : 1);
  }

  function draw(input: DrawInput, dt: number, t: number) {
    const t0 = performance.now();
    const { state: s, connected, clock } = input;
    const def = STAGES[s.stage];
    const live = { ...s, clock: s.status === 'running' ? Math.max(s.clock, clock) : s.clock };
    const g = guideOf(live);

    // fit + arena
    const fitNew = 1 / (1 - (2 * s.config.proj.inset) / 100);
    if (Math.abs(fitNew - fit) > 1e-3) { fit = fitNew; applyCamera(); }
    buildWalls();

    // lanes
    const l = layoutOf(def.lanes, s.config.spacing, s.config.mirror);
    const lk = `${def.lanes}|${s.config.spacing}|${s.config.mirror}|${opts.highContrast ? 1 : 0}`;
    if (lk !== laneKey) { laneKey = lk; layout = l; buildLanes(l, opts.highContrast); }
    fitField(s, layout);

    // reward + column (rebuilt per stage)
    const rk = `${s.stage}|${s.run}`;
    if (rk !== rewardKind) {
      rewardKind = rk;
      reward?.dispose(); rewardLeft.clear();
      reward = buildReward(def.reward, lq);
      rewardLeft.add(reward.group);
      buildColumn(def.rounds.length, def.reward);
    }
    const halfW = halfH * aspect;
    const rx = Math.min(halfW - 1.6, 7.0);
    rewardLeft.position.set(-rx, 0, 0);
    columnGroup.position.set(rx, 0, 0);

    // events: success / round / cue / stage
    if (prevRun !== s.run || prevStage !== s.stage) { prevStepSeq = s.stepSeq; prevRoundSeq = s.roundSeq; prevCue = s.cue?.n ?? 0; prevRun = s.run; prevStage = s.stage; lastLane = null; stageDoneAt = -1e9; }
    const doneLane = lanes.find((o) => o.lane === lastLane);
    if (s.stepSeq !== prevStepSeq) {
      if (s.stepSeq > prevStepSeq && doneLane) {
        doneLane.doneAt = t;
        fieldOuter.updateMatrixWorld(true);
        const wp = new THREE.Vector3(doneLane.box.x, 0, -(doneLane.box.y + doneLane.box.h / 2)).applyMatrix4(fieldInner.matrixWorld);
        const px = wp.x, pz = wp.z;
        sparkle(px, 0.3, pz, [0x35e58b, 0x7dffbd, 0x38d9ff], 'spark');
      }
      prevStepSeq = s.stepSeq;
    }
    if (s.roundSeq !== prevRoundSeq) {
      if (s.roundSeq > prevRoundSeq && reward) {
        const sp = reward.spots[Math.min(reward.spots.length - 1, Math.max(0, s.roundSeq - 1) % reward.spots.length)];
        sparkle(-rx + sp[0], 1.0, sp[1], [GLOW_COLOR[def.reward], 0xffc233, 0xffffff], 'ring', true);
        sparkle(rx, 0.8, 0, [0xffc233, 0xff7a59], 'stream');
      }
      prevRoundSeq = s.roundSeq;
    }
    if ((s.cue?.n ?? 0) !== prevCue) { if (s.cue) { cueAt = t; cueKind = s.cue.kind; for (const o of lanes) o.popAt = t; } prevCue = s.cue?.n ?? 0; }
    if (s.status !== prevStatus) {
      if (s.status === 'stage-complete') { stageDoneAt = t; if (reward) pool.celebrate([0xffc233, 0x38d9ff, 0xff4fd8, 0x8a5cff], [[-rx, 0], [rx, 0], [-rx, -2], [rx, 2], [0, -4]], lq ? 0.5 : 1, def.reward === 'grand'); }
      if (s.status === 'ended' && prevStatus !== 'ended') pool.celebrate([0xffc233, 0x38d9ff, 0xff4fd8, 0x8a5cff, 0x35e58b], [[-rx, 0], [rx, 0], [-4, -3], [4, -3], [0, 0]], lq ? 0.6 : 1.2, true);
      prevStatus = s.status;
    }
    if (g.step && (g.phase === 'go' || g.phase === 'hold')) lastLane = g.step.lane;

    // lane visuals
    const dim = !connected || s.status === 'paused';
    const specs = laneSpecs(live, g, dim);
    const ready = s.status === 'ready';
    for (const o of lanes) {
      const sp = specs.get(o.lane)!;
      let tone = sp.tone;
      const sinceDone = t - o.doneAt;
      const flashing = sinceDone < 1.3 && !dim;
      if (flashing) tone = 'done';
      const col = TONE_COLOR[tone];
      const breath = calm ? 0 : Math.sin(t * (tone === 'active' ? 3.2 : 1.6));
      const bm = o.border.material as THREE.MeshBasicMaterial;
      bm.color.setHex(col);
      let bo = TONE_OPACITY[tone];
      if (tone === 'active') bo = 0.82 + 0.18 * breath;
      if (ready && !dim) bo = 0.55 + 0.12 * (calm ? 0 : Math.sin(t * 1.2 + o.box.x));
      bm.opacity = bo;
      const hm = o.halo.material as THREE.MeshBasicMaterial;
      hm.color.setHex(col);
      hm.opacity = (tone === 'active' ? 0.32 + 0.14 * breath : tone === 'stop' || tone === 'done' || tone === 'hold' ? 0.28 : 0.12) * (lq ? 0.7 : 1);
      const gm = o.glow.material as THREE.MeshBasicMaterial;
      gm.color.setHex(col);
      gm.opacity = tone === 'active' ? 0.34 + 0.1 * breath : tone === 'done' || tone === 'stop' || tone === 'hold' ? 0.26 : tone === 'dim' ? 0.05 : 0.12;
      // glyph
      const showGlyph = flashing ? false : sp.glyph;
      o.glyph.visible = showGlyph || (o.lane === 'H' && !flashing);
      if (o.glyph.visible) {
        let foot = sp.foot, gt: GlyphTone = tone, lock = sp.lock, order = sp.order, arrow = sp.arrow;
        if (o.lane === 'H' && !sp.glyph) { foot = null; gt = dim ? 'dim' : 'idle'; lock = false; order = 0; arrow = false; }
        const k = `${foot ?? '-'}|${o.lane}|${gt}|${order}|${lock ? 1 : 0}|${arrow ? 1 : 0}`;
        if (k !== o.glyphKey) {
          o.glyphKey = k;
          (o.glyph.material as THREE.MeshBasicMaterial).map = o.lane === 'H' && foot === null ? neutralTexture(gt) : glyphTexture({ foot, lane: o.lane, tone: gt, order: order || undefined, lock, arrow, label: false });
          (o.glyph.material as THREE.MeshBasicMaterial).needsUpdate = true;
        }
        const popT = t - o.popAt;
        const pop = !calm && popT < 0.6 && (cueKind === 'repeat' || cueKind === 'replay' || cueKind === 'back') ? 1 + 0.12 * Math.sin((popT / 0.6) * Math.PI) : 1;
        const bounce = !calm && tone === 'active' ? 1 + 0.025 * Math.sin(t * 3.2) : 1;
        const gsz = (o.lane === 'H' ? o.box.h * 1.7 : Math.min(o.box.h * 0.92, o.box.w * 1.35)) * pop * bounce;
        o.glyph.scale.set(gsz, 1, gsz);
        (o.glyph.material as THREE.MeshBasicMaterial).opacity = dim ? 0.5 : 1;
      }
      // plate (lane name, always readable)
      const pk = `${o.lane}|${dim ? 'dim' : tone === 'active' ? 'active' : tone === 'stop' ? 'stop' : 'idle'}`;
      if (pk !== o.plateKey) { o.plateKey = pk; (o.plate.material as THREE.MeshBasicMaterial).map = lanePlateTexture(o.lane, (pk.split('|')[1]) as GlyphTone); (o.plate.material as THREE.MeshBasicMaterial).needsUpdate = true; }
      // tick / pulse
      o.check.visible = flashing;
      if (flashing) { const k = sinceDone / 1.3; (o.check.material as THREE.MeshBasicMaterial).opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; const sc = Math.min(o.box.w, o.box.h) * 0.55 * (calm ? 1 : 0.7 + 0.3 * Math.min(1, k * 5)); o.check.scale.set(sc, 1, sc); }
      o.pulse.visible = flashing && !calm;
      if (o.pulse.visible) { const k = sinceDone / 1.0; const sc = o.box.w * (0.35 + 0.65 * Math.min(1, k)); o.pulse.scale.set(sc, 1, sc); (o.pulse.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k); }
      // stop sign
      o.stop.visible = sp.stop && !dim;
      if (o.stop.visible) { const sc = Math.min(o.box.w, o.box.h) * 0.78 * (calm ? 1 : 1 + 0.03 * Math.sin(t * 2.4)); o.stop.scale.set(sc, 1, sc); }
      // hold ring
      o.arc.visible = sp.arc >= 0 && !dim;
      if (o.arc.visible) {
        const geo = o.arc.geometry as THREE.RingGeometry;
        const total = geo.index!.count;
        geo.setDrawRange(0, Math.max(3, Math.floor((total * clamp01(sp.arc)) / 3) * 3));
        (o.arc.material as THREE.MeshBasicMaterial).color.setHex(tone === 'stop' ? 0xffd0d3 : 0xffe2b0);
      }
    }

    // soft violet "no problem" shimmer on a gentle cue (never red, never flashing)
    const shimmer = clamp01(1 - (t - cueAt) / 0.9);
    const cueIsErr = cueKind === 'incorrect' || cueKind === 'order';
    violetL.intensity = 70 + (cueIsErr && !calm ? shimmer * 90 : 0);

    // reward / column
    const done = s.status === 'stage-complete' || s.status === 'ended';
    const litCount = s.status === 'ready' ? 0 : sequencesDone(s);
    reward?.update(dt, t, litCount, done, calm);
    for (let i = 0; i < colN; i++) {
      const want = done || i < litCount ? 1 : 0;
      colLit[i] += (want - colLit[i]) * Math.min(1, dt * 3.2);
      colMats[i].emissiveIntensity = 0.1 + 1.25 * colLit[i];
      colMats[i].opacity = 0.45 + 0.55 * colLit[i];
    }
    if (colGem) {
      const gm = colMats[colN];
      const want = done ? 1 : 0;
      gm.emissiveIntensity += ((0.5 + 2.4 * want) - gm.emissiveIntensity) * Math.min(1, dt * 3);
      gm.opacity += ((0.7 + 0.3 * want) - gm.opacity) * Math.min(1, dt * 3);
      if (!calm) colGem.rotation.y += dt * (0.5 + 1.5 * (done ? 1 : 0));
    }
    // stage-complete flourish: pool lights swell
    const swell = done ? clamp01(1 - (t - stageDoneAt) / 2.5) : 0;
    poolL.scale.set(9 + swell * 3, 1, 9 + swell * 3);
    poolR.scale.set(9 + swell * 3, 1, 9 + swell * 3);
    poolL.position.set(-halfW * 0.62, 0.012, 0); poolR.position.set(halfW * 0.62, 0.012, 0); poolC.position.set(0, 0.011, 0);
    cyanL.position.x = -halfW * 0.85; magL.position.x = halfW * 0.85;

    // motes
    if (!calm) {
      for (let i = 0; i < dustN; i++) {
        const a = dustSeed[i * 3], b = dustSeed[i * 3 + 1], sp = dustSeed[i * 3 + 2];
        dustPos[i * 3] = Math.sin(a + t * 0.07 * sp) * (halfW - 0.5);
        dustPos[i * 3 + 1] = 0.3 + (0.5 + 0.5 * Math.sin(b + t * 0.11 * sp)) * 2.4;
        dustPos[i * 3 + 2] = Math.cos(b * 1.3 + t * 0.05 * sp) * (halfH - 0.3);
      }
      dustGeo.getAttribute('position').needsUpdate = true;
    } else if (t < 1) {
      for (let i = 0; i < dustN; i++) { dustPos[i * 3] = Math.sin(dustSeed[i * 3]) * (halfW - 0.5); dustPos[i * 3 + 1] = 0.6 + (i % 7) * 0.3; dustPos[i * 3 + 2] = Math.cos(dustSeed[i * 3 + 1] * 1.3) * (halfH - 0.3); }
      dustGeo.getAttribute('position').needsUpdate = true;
    }

    pool.update(dt);
    renderer.render(scene, camera);
    frameMs = performance.now() - t0;
  }

  const neutralCache = new Map<string, THREE.CanvasTexture>();
  /** The neutral stance: both feet side by side (child's left foot on the left). */
  function neutralTexture(tone: GlyphTone): THREE.CanvasTexture {
    const hit = neutralCache.get(tone);
    if (hit) return hit;
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const ctx = c.getContext('2d')!;
    const st = TONE[tone];
    drawFoot(ctx, 'L', 170, 256, 330, { stroke: st.stroke, fill: st.fill, glow: st.glow, lineWidth: 7 });
    drawFoot(ctx, 'R', 342, 256, 330, { stroke: st.stroke, fill: st.fill, glow: st.glow, lineWidth: 7 });
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    neutralCache.set(tone, tx);
    return tx;
  }

  function applyCamera() {
    halfH = 4.5 * fit;
    camera.left = -halfH * aspect; camera.right = halfH * aspect; camera.top = halfH; camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    pool.setPixelsPerUnit(h / (halfH * 2) * 0.9);
    arenaKey = '';
  }

  function resize(width: number, height: number) {
    h = height; aspect = width / height;
    renderer.setSize(width, height, false);
    applyCamera();
  }

  function stats(): SceneStats {
    const i = renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, frameMs: Math.round(frameMs * 10) / 10, particles: pool.alive, laneBuilds };
  }

  function dispose() {
    for (const d of laneDisposables) d.dispose();
    for (const d of colDisposables) d.dispose();
    neutralCache.forEach((tx) => tx.dispose());
    reward?.dispose();
    pool.dispose();
    for (const d of own) d.dispose();
    envRt?.dispose();
    renderer.dispose();
  }

  return { renderer, draw, resize, stats, dispose };
}
