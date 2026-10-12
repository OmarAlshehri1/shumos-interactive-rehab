import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Config, Phase, Quality, StoneState } from '@/lib/footsteps3d/engine';
import { hashSeed, mulberry32 } from '@/lib/footsteps3d/rng';
import type { FloorPath, Stone } from '@/lib/footsteps3d/world';
import { bedTexture, contactShadowTexture, dappleTexture, digitTexture, footTexture, glowTexture, grassTexture, patchTexture, rimGlowTexture, stoneTexture, wingTexture } from './textures';

/**
 * The Enchanted Forest renderer (child Display). Pure presentation: it draws the stones and states it is given.
 *
 * FLOOR VIEW (default, the one meant for real projection): an orthographic camera looking down. A tiny tilt (12 degrees)
 * lets trees and stones show a little side depth; the ground is stretched by 1/cos(tilt) so ground shapes keep their
 * true proportions on screen (a round stone stays round). The camera never moves. CINEMATIC is an opt-in perspective
 * preview, never the physical floor mode. The river is shallow, flat decoration: nothing is ever deep, nothing falls.
 */
const TILT = (12 * Math.PI) / 180;
const COS = Math.cos(TILT);
const TOP_Y = 0.405;
const GOLD = new THREE.Color('#ffc247');
const GOLD_SOFT = new THREE.Color('#ffe19a');

interface WorldStyle {
  sun: string; sunIntensity: number; sunDir: [number, number]; hemiSky: string; hemiGround: string; hemiIntensity: number; exposure: number; background: string;
  waterShallow: string; waterDeep: string; river: { pts: [number, number][]; width: number }; trees: number; bushes: number; flowers: number; flowerColors: string[];
  canopy: string[]; glowPlants: number; particleColor: string; particleSize: number; reeds: number;
}

const STYLES: WorldStyle[] = [
  { // sunny enchanted garden: bright, warm, many flowers, a small brook
    sun: '#fff0c4', sunIntensity: 2.7, sunDir: [-0.55, -0.6], hemiSky: '#d6ecff', hemiGround: '#6b8f3f', hemiIntensity: 1.15, exposure: 1.05, background: '#6fae45',
    waterShallow: '#8fe3df', waterDeep: '#3fa7c4', river: { pts: [[-0.06, 0.9], [0.3, 0.85], [0.62, 0.92], [1.06, 0.86]], width: 1.0 },
    trees: 16, bushes: 14, flowers: 230, flowerColors: ['#ffffff', '#ffd1e8', '#ffe27a', '#ffb18c', '#d9c2ff'], canopy: ['#5bb04a', '#79c24f', '#4a9e47'], glowPlants: 0,
    particleColor: '#fff6c8', particleSize: 5, reeds: 18,
  },
  { // lush riverside forest: deeper greens, a broad river under the path
    sun: '#ffe8b4', sunIntensity: 2.3, sunDir: [-0.5, -0.65], hemiSky: '#bfe3d4', hemiGround: '#3f6a3d', hemiIntensity: 1.1, exposure: 1.02, background: '#4f9440',
    waterShallow: '#79d9c5', waterDeep: '#2b8fa6', river: { pts: [[-0.06, 0.42], [0.25, 0.56], [0.55, 0.4], [0.8, 0.52], [1.06, 0.44]], width: 2.4 },
    trees: 22, bushes: 16, flowers: 120, flowerColors: ['#ffffff', '#ffe27a', '#ffc4d8', '#cfe9ff'], canopy: ['#3f8f43', '#2f7a3f', '#4aa04a', '#2a6b3a'], glowPlants: 0,
    particleColor: '#ffefb0', particleSize: 5, reeds: 60,
  },
  { // magical twilight forest: cooler light, restrained golden glow, still bright enough for every target
    sun: '#ffd7a0', sunIntensity: 2.0, sunDir: [-0.45, -0.7], hemiSky: '#9aa0e8', hemiGround: '#35507a', hemiIntensity: 1.3, exposure: 1.12, background: '#3d7a58',
    waterShallow: '#7fd3e8', waterDeep: '#3a63b0', river: { pts: [[-0.06, 0.62], [0.3, 0.46], [0.6, 0.64], [1.06, 0.5]], width: 2.0 },
    trees: 22, bushes: 14, flowers: 80, flowerColors: ['#ffe9a8', '#bfe9ff', '#e6d0ff'], canopy: ['#2f6f66', '#3a5f8a', '#2c7a5a', '#4a4f96'], glowPlants: 34,
    particleColor: '#ffd978', particleSize: 8, reeds: 40,
  },
];

export interface ForestSpec {
  world: 0 | 1 | 2;
  path: FloorPath;
  stage: number;
  seed: number;
  config: Config;
}

export interface ForestFrame {
  states: readonly StoneState[];
  step: number;
  phase: Phase;
  /** Memory stage: 0..1 progress through the pair preview. */
  previewProgress: number;
  pairStart: number;
  isMemory: boolean;
  /** Memory stage without assistance after the preview: no stone is lit. */
  hideTarget: boolean;
  cue: number;
  success: { n: number; stone: number };
  /** Control is not connected: calm, nothing highlighted. */
  allIdle: boolean;
  /** Paused / resting: pulses and effects hold still. */
  frozen: boolean;
  config: Config;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function qualityParams(q: Quality) {
  return q === 'high'
    ? { pr: 2, shadow: 2048, aa: true, butterflies: 5, particles: 70, treeScale: 1, detail: 2, dapple: true, flowers: 1 }
    : q === 'medium'
      ? { pr: 1.5, shadow: 1024, aa: true, butterflies: 3, particles: 36, treeScale: 0.8, detail: 1, dapple: true, flowers: 0.6 }
      : { pr: 1, shadow: 0, aa: false, butterflies: 0, particles: 0, treeScale: 0.6, detail: 1, dapple: false, flowers: 0.35 };
}

/**
 * A stepping stone built as a smooth radial mesh: a domed top, softly rounded shoulders and a short wall, with a gently
 * irregular outline and a little natural unevenness. UVs are planar (x, z), so the top never smears or shows seams.
 */
const STONE_PROFILE: [number, number][] = [[0, 0.405], [0.28, 0.4], [0.55, 0.388], [0.76, 0.366], [0.88, 0.33], [0.95, 0.27], [0.985, 0.2], [1, 0.12], [1, 0.02]];
/** Height of the stone's surface at a radius fraction (linear along the profile). */
function surfaceY(rf: number): number {
  for (let k = 1; k < STONE_PROFILE.length; k++) {
    const [r1, y1] = STONE_PROFILE[k];
    const [r0, y0] = STONE_PROFILE[k - 1];
    if (rf <= r1 || k === STONE_PROFILE.length - 1) return r1 === r0 ? y1 : y0 + ((y1 - y0) * (Math.min(rf, r1) - r0)) / (r1 - r0);
  }
  return 0.3;
}
function outlineParams(seed: number) {
  const rng = mulberry32(seed + 17);
  return { a1: rng() * 6.28, a2: rng() * 6.28, a3: rng() * 6.28, a4: rng() * 6.28 };
}
const outlineAt = (t: number, p: { a1: number; a2: number; a3: number }) => 1 + 0.05 * Math.sin(2 * t + p.a1) + 0.035 * Math.sin(3 * t + p.a2) + 0.02 * Math.sin(5 * t + p.a3);

/** A border band that follows one stone's own outline and hugs its surface (so it never clips the edge or floats). */
function stoneRingGeometry(r: number, seed: number, inner: number, outer: number, lift: number): THREE.BufferGeometry {
  const p = outlineParams(seed);
  const SEG = 96;
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const t = (i / SEG) * Math.PI * 2;
    const o = outlineAt(t, p);
    for (const rf of [inner, outer]) pos.push(Math.cos(t) * r * o * rf, surfaceY(rf) + lift, Math.sin(t) * r * o * rf);
  }
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function stoneGeometry(r: number, seed: number): THREE.BufferGeometry {
  const { a1, a2, a3, a4 } = outlineParams(seed);
  const SEG = 72;
  const profile = STONE_PROFILE;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let k = 0; k < profile.length; k++) {
    const [rf, y] = profile[k];
    for (let i = 0; i <= SEG; i++) {
      const t = (i / SEG) * Math.PI * 2;
      const rad = r * outlineAt(t, { a1, a2, a3 }) * rf;
      const x = Math.cos(t) * rad, z = Math.sin(t) * rad;
      const bump = (rf < 0.97 ? 0.014 : 0) * Math.sin(x * 5.5 + a4) * Math.cos(z * 4.7 + a1);
      pos.push(x, y + bump, z);
      uv.push(x / (r * 2.3) + 0.5, z / (r * 2.3) + 0.5);
    }
  }
  const row = SEG + 1;
  for (let k = 0; k < profile.length - 1; k++) for (let i = 0; i < SEG; i++) {
    const a = k * row + i, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A lumpy blob of merged icospheres (a tree canopy or bush), vertex-coloured lighter on top. */
function blobGeometry(seed: number, lobes: number, detail: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < lobes; i++) {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
    const small = i > 4; // small leafy clumps studding the big lobes
    const s = i === 0 ? 1 : small ? 0.2 + rng() * 0.16 : 0.45 + rng() * 0.4;
    const ox = i === 0 ? 0 : (rng() - 0.5) * (small ? 1.7 : 1.1), oz = i === 0 ? 0 : (rng() - 0.5) * (small ? 1.7 : 1.1), oy = i === 0 ? 0 : small ? 0.15 + rng() * 0.45 : 0.1 + rng() * 0.35;
    g.scale(s, s * 0.78, s);
    g.translate(ox, oy, oz);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const jitter = 1 + (Math.sin(pos.getX(k) * 9 + i) * Math.cos(pos.getZ(k) * 8 + i * 2)) * 0.07;
      pos.setXYZ(k, pos.getX(k) * jitter, pos.getY(k), pos.getZ(k) * jitter);
    }
    parts.push(g);
  }
  // merge manually (no extra dependency)
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let off = 0;
  const indices: number[] = [];
  for (const p of parts) {
    const pp = p.attributes.position;
    for (let k = 0; k < pp.count; k++) {
      pos.set([pp.getX(k), pp.getY(k), pp.getZ(k)], (off + k) * 3);
      const t = clamp01((pp.getY(k) + 0.4) / 1.3);
      const leaf = 0.5 + 0.5 * Math.sin(pp.getX(k) * 17 + pp.getZ(k) * 11) * Math.cos(pp.getZ(k) * 14 - pp.getY(k) * 9);
      const shade = (0.5 + 0.55 * t) * (0.86 + 0.28 * leaf);
      col.set([shade, shade, shade], (off + k) * 3);
    }
    const idx = p.index!;
    for (let k = 0; k < idx.count; k++) indices.push(idx.getX(k) + off);
    off += pp.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  parts.forEach((p) => p.dispose());
  return merged;
}

function ribbon(points: THREE.Vector3[], widthAt: (t: number) => number): THREE.BufferGeometry {
  const n = points.length;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
  const idx: number[] = [];
  let len = 0;
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl;
    const w = widthAt(i / (n - 1)) / 2;
    if (i > 0) len += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    pos.set([points[i].x + nx * w, points[i].y, points[i].z + nz * w], i * 6);
    pos.set([points[i].x - nx * w, points[i].y, points[i].z - nz * w], i * 6 + 3);
    uv.set([len, 0], i * 4);
    uv.set([len, 1], i * 4 + 2);
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const RIVER_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIVER_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform float uFlow; uniform float uAlpha;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){
  float v = vUv.y;
  float edge = smoothstep(0.0, 0.22, v) * smoothstep(1.0, 0.78, v);
  float flow = vUv.x * 0.55 - uTime * uFlow;
  float n = noise(vec2(flow * 1.6, v * 7.0)) * 0.55 + noise(vec2(flow * 3.4 + 7.0, v * 15.0)) * 0.3;
  vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 0.95, edge) * 0.85);
  col += (n - 0.4) * 0.12;
  float streak = smoothstep(0.80, 0.97, noise(vec2(flow * 5.5, v * 21.0)));
  col += streak * 0.2 * vec3(1.0, 1.0, 0.92);
  float ring = smoothstep(0.92, 0.99, noise(vec2(flow * 2.0 + 3.0, v * 9.0 + uTime * 0.05)));
  col += ring * 0.1;
  float foam = smoothstep(0.55, 0.0, edge) * (0.45 + 0.55 * noise(vec2(flow * 6.0, v * 30.0)));
  col = mix(col, vec3(0.95, 1.0, 1.0), foam * 0.55);
  float a = uAlpha * smoothstep(0.0, 0.1, v) * smoothstep(1.0, 0.9, v);
  gl_FragColor = vec4(col, a);
}`;

const POINT_VERT = `
attribute float aAlpha; attribute float aSize; varying float vAlpha; uniform float uScale;
void main(){ vAlpha = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale; gl_Position = projectionMatrix * mv; }`;
const POINT_FRAG = `
precision highp float; varying float vAlpha; uniform vec3 uColor;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a *= a; gl_FragColor = vec4(uColor, a * vAlpha); }`;

function pointsMaterial(color: THREE.Color | string) {
  return new THREE.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(color) }, uScale: { value: 1 } } });
}

interface StoneVisual {
  stone: Stone;
  group: THREE.Group;
  body: THREE.Mesh;
  bodyMat: THREE.MeshStandardMaterial;
  halo: THREE.Mesh; ring: THREE.Mesh; foot: THREE.Mesh; digit: THREE.Mesh; next: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial; ringMat: THREE.MeshBasicMaterial; footMat: THREE.MeshBasicMaterial; digitMat: THREE.MeshBasicMaterial; nextMat: THREE.MeshBasicMaterial;
  waves: [THREE.Mesh, THREE.Mesh]; waveMats: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  bloom: THREE.Mesh; bloomMat: THREE.MeshBasicMaterial;
  amt: number; nextAmt: number; digitAmt: number; succ: number;
}

export function createForest(canvas: HTMLCanvasElement, spec: ForestSpec) {
  const { path, world, config } = spec;
  const style = STYLES[world];
  const qp = qualityParams(config.quality);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: qp.aa, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qp.pr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = style.exposure;
  renderer.shadowMap.enabled = qp.shadow > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const W = path.worldW, H = path.worldH;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(style.background);
  const rng = mulberry32(hashSeed(spec.seed, spec.stage, 99));
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => { disposables.push(o); return o; };
  const toX = (x: number) => x - W / 2;
  const toZ = (y: number) => y - H / 2;

  // ---- light -----------------------------------------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(style.hemiSky, style.hemiGround, style.hemiIntensity));
  const sun = new THREE.DirectionalLight(style.sun, style.sunIntensity);
  sun.position.set(style.sunDir[0] * -26, 24, style.sunDir[1] * -26);
  sun.target.position.set(0, 0, 0);
  if (qp.shadow > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(qp.shadow, qp.shadow);
    const ext = Math.max(W, H) * 0.78;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 2, far: 80 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    // soft shadows: depth without ever darkening a stone enough to hurt target readability
    sun.shadow.intensity = 0.5;
  }
  scene.add(sun, sun.target);

  // ---- ground ----------------------------------------------------------------------------------------------------
  const gTex = grassTexture(world).clone();
  gTex.needsUpdate = true;
  gTex.repeat.set((W + 10) / 7, (H + 10) / 7);
  const groundMat = track(new THREE.MeshStandardMaterial({ map: gTex, roughness: 1, metalness: 0 }));
  track(gTex);
  const groundGeo = track(new THREE.PlaneGeometry(W + 10, H + 10));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  worldGroup.add(ground);
  const patchMat = track(new THREE.MeshBasicMaterial({ map: patchTexture(world), transparent: true, depthWrite: false }));
  const patch = new THREE.Mesh(track(new THREE.PlaneGeometry(W + 10, H + 10)), patchMat);
  patch.rotation.x = -Math.PI / 2;
  patch.position.y = 0.006;
  worldGroup.add(patch);

  // ---- river (shallow, flat, decorative) ----------------------------------------------------------------------------
  const curve = new THREE.CatmullRomCurve3(style.river.pts.map(([nx, ny]) => new THREE.Vector3(toX(nx * W), 0, toZ(ny * H))));
  const riverPts = curve.getPoints(90);
  const riverWidth = (t: number) => style.river.width * (0.88 + 0.22 * Math.sin(t * 9 + world));
  const bedMat = track(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, map: (() => { const t = bedTexture().clone(); t.needsUpdate = true; t.repeat.set(6, 1); return track(t); })(), roughness: 1 }));
  const bed = new THREE.Mesh(track(ribbon(riverPts.map((p) => new THREE.Vector3(p.x, 0.014, p.z)), (t) => riverWidth(t) * 1.1)), bedMat);
  bed.receiveShadow = true;
  worldGroup.add(bed);
  const riverMat = track(new THREE.ShaderMaterial({
    vertexShader: RIVER_VERT, fragmentShader: RIVER_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uShallow: { value: new THREE.Color(style.waterShallow) }, uDeep: { value: new THREE.Color(style.waterDeep) }, uFlow: { value: 0.35 }, uAlpha: { value: 0.82 } },
  }));
  const water = new THREE.Mesh(track(ribbon(riverPts.map((p) => new THREE.Vector3(p.x, 0.05, p.z)), riverWidth)), riverMat);
  worldGroup.add(water);
  const distToRiver = (x: number, z: number) => {
    let m = Infinity;
    for (const p of riverPts) m = Math.min(m, Math.hypot(p.x - x, p.z - z));
    return m - style.river.width * 0.62;
  };

  // ---- exclusions: nothing decorative ever touches a stone or the usable floor's centre of play ----------------------------
  const stonesX = path.stones.map((s) => ({ x: toX(s.x), z: toZ(s.y) }));
  const clearOfStones = (x: number, z: number, r: number, pad: number) => stonesX.every((s) => Math.hypot(s.x - x, s.z - z) >= path.radius + r + pad);
  const inUsable = (x: number, z: number, r: number) => x - r > toX(path.usable.x0) && x + r < toX(path.usable.x1) && z - r > toZ(path.usable.y0) && z + r < toZ(path.usable.y1);

  // ---- trees, bushes (instanced, lumpy, varied) ------------------------------------------------------------------------
  const treeCount = Math.round(style.trees * qp.treeScale);
  const treeVariants = [0, 1, 2].map((v) => track(blobGeometry(7000 + v * 31, 11, qp.detail)));
  const canopyMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }));
  const trunkGeo = track(new THREE.CylinderGeometry(0.1, 0.17, 1.4, 7));
  const trunkMat = track(new THREE.MeshStandardMaterial({ color: '#6a4a2d', roughness: 1 }));
  type Inst = { x: number; z: number; s: number; rot: number; v: number; tint: THREE.Color };
  const trees: Inst[] = [];
  const bushes: Inst[] = [];
  for (let attempt = 0; attempt < 400 && trees.length < treeCount; attempt++) {
    // candidates hug the screen border so the frame is lush while the play area stays open
    const side = Math.floor(rng() * 4);
    const along = rng();
    const s = 1.1 + rng() * 1.5;
    const out = (rng() - 0.25) * s * 0.9;
    const x = side === 0 ? -W / 2 + out - 0.2 : side === 1 ? W / 2 - out + 0.2 : (along - 0.5) * (W + 2);
    const z = side === 2 ? -H / 2 + out - 0.2 : side === 3 ? H / 2 - out + 0.2 : (along - 0.5) * (H + 2);
    if (!clearOfStones(x, z, s * 0.95, 0.9)) continue;
    if (inUsable(x, z, s * 0.4) && (side < 2 ? Math.abs(x) < W / 2 - 1.4 : Math.abs(z) < H / 2 - 1.4)) continue;
    if (distToRiver(x, z) < s * 0.7) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < (t.s + s) * 0.62)) continue;
    trees.push({ x, z, s, rot: rng() * 6.28, v: Math.floor(rng() * 3), tint: new THREE.Color(style.canopy[Math.floor(rng() * style.canopy.length)]).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.06) });
  }
  const bushCount = Math.round(style.bushes * qp.treeScale);
  for (let attempt = 0; attempt < 400 && bushes.length < bushCount; attempt++) {
    const s = 0.35 + rng() * 0.45;
    const x = (rng() - 0.5) * (W + 1), z = (rng() - 0.5) * (H + 1);
    if (!clearOfStones(x, z, s, 1.1) || distToRiver(x, z) < s + 0.35) continue;
    if (inUsable(x, z, s) && Math.hypot(x / (W / 2), z / (H / 2)) < 0.82) continue; // keep the middle of the floor open
    bushes.push({ x, z, s, rot: rng() * 6.28, v: Math.floor(rng() * 3), tint: new THREE.Color(style.canopy[Math.floor(rng() * style.canopy.length)]).offsetHSL(0, 0, 0.04) });
  }
  const dummy = new THREE.Object3D();
  const placeInstances = (geo: THREE.BufferGeometry, mat: THREE.Material, items: Inst[], yScale: number, cast: boolean, yOff = 0) => {
    if (!items.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      dummy.position.set(it.x, yOff + it.s * 0.75 * yScale, it.z);
      dummy.rotation.set(0, it.rot, 0);
      dummy.scale.set(it.s, it.s * yScale, it.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, it.tint);
    });
    m.castShadow = cast;
    m.receiveShadow = true;
    worldGroup.add(m);
    return m;
  };
  for (let v = 0; v < 3; v++) {
    placeInstances(treeVariants[v], canopyMat, trees.filter((t) => t.v === v), 1.0, true, 0.9);
    placeInstances(treeVariants[v], canopyMat, bushes.filter((t) => t.v === v), 0.8, true, 0);
  }
  if (trees.length) {
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    trees.forEach((t, i) => { dummy.position.set(t.x, 0.6, t.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(t.s * 0.9, t.s * 0.9, t.s * 0.9); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); });
    trunks.castShadow = true;
    worldGroup.add(trunks);
  }

  // ---- shoreline rocks, pebbles, reeds --------------------------------------------------------------------------------------
  const rockGeo = track((() => { const g0 = new THREE.IcosahedronGeometry(1, 1); g0.deleteAttribute('normal'); g0.deleteAttribute('uv'); return mergeVertices(g0, 1e-4); })());
  { const pos = rockGeo.attributes.position; for (let i = 0; i < pos.count; i++) { const j = 1 + Math.sin(pos.getX(i) * 5) * Math.cos(pos.getY(i) * 4 + pos.getZ(i) * 3) * 0.14; pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j, pos.getZ(i) * j); } rockGeo.computeVertexNormals(); }
  const rockMat = track(new THREE.MeshStandardMaterial({ map: stoneTexture(1), roughness: 0.95 }));
  const rockItems: { x: number; z: number; s: number; rot: number }[] = [];
  for (let i = 0; i < 70 && rockItems.length < Math.round(34 * qp.treeScale); i++) {
    const p = riverPts[Math.floor(rng() * riverPts.length)];
    const w = riverWidth(0.5) / 2;
    const side = rng() < 0.5 ? -1 : 1;
    const x = p.x + (rng() - 0.5) * 0.6, z = p.z + side * (w + 0.05 + rng() * 0.25);
    if (Math.abs(x) > W / 2 + 0.5 || Math.abs(z) > H / 2 + 0.5) continue;
    const s = 0.14 + rng() * 0.26;
    if (!clearOfStones(x, z, s, 0.5)) continue;
    rockItems.push({ x, z, s, rot: rng() * 6 });
  }
  if (rockItems.length) {
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockItems.length);
    rockItems.forEach((r, i) => { dummy.position.set(r.x, r.s * 0.4, r.z); dummy.rotation.set(0, r.rot, 0); dummy.scale.set(r.s * 1.3, r.s * 0.75, r.s); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix); rocks.setColorAt(i, new THREE.Color().setHSL(0.09, 0.08, 0.5 + rng() * 0.2)); });
    rocks.castShadow = true; rocks.receiveShadow = true;
    worldGroup.add(rocks);
  }
  { // pebbles under the water (visible through it)
    const n = Math.round(150 * qp.flowers + 30);
    const pebbles = new THREE.InstancedMesh(rockGeo, rockMat, n);
    for (let i = 0; i < n; i++) {
      const t = rng(), p = curve.getPoint(t);
      const w = riverWidth(t) * 0.46;
      dummy.position.set(p.x + (rng() - 0.5) * 0.4, 0.03, p.z + (rng() - 0.5) * 2 * w);
      const s = 0.04 + rng() * 0.1;
      dummy.rotation.set(0, rng() * 6, 0); dummy.scale.set(s * 1.4, s * 0.5, s); dummy.updateMatrix();
      pebbles.setMatrixAt(i, dummy.matrix);
      pebbles.setColorAt(i, new THREE.Color().setHSL(0.08 + rng() * 0.06, 0.18, 0.4 + rng() * 0.3));
    }
    worldGroup.add(pebbles);
  }
  if (style.reeds > 0) {
    const reedGeo = track(new THREE.ConeGeometry(0.05, 0.75, 4));
    reedGeo.translate(0, 0.37, 0);
    const reedMat = track(new THREE.MeshStandardMaterial({ color: '#6aa44a', roughness: 0.9 }));
    const n = Math.round(style.reeds * qp.treeScale);
    const reeds = new THREE.InstancedMesh(reedGeo, reedMat, n);
    let placed = 0;
    for (let i = 0; i < n * 3 && placed < n; i++) {
      const t = rng(), p = curve.getPoint(t), w = riverWidth(t) / 2, side = rng() < 0.5 ? -1 : 1;
      const x = p.x + (rng() - 0.5) * 0.7, z = p.z + side * (w + 0.1 + rng() * 0.35);
      if (Math.abs(x) > W / 2 + 0.3 || Math.abs(z) > H / 2 + 0.3 || !clearOfStones(x, z, 0.1, 0.6)) continue;
      dummy.position.set(x, 0.02, z); dummy.rotation.set((rng() - 0.5) * 0.3, rng() * 6, (rng() - 0.5) * 0.3); const s = 0.7 + rng() * 0.9; dummy.scale.set(s, s, s); dummy.updateMatrix();
      reeds.setMatrixAt(placed, dummy.matrix); reeds.setColorAt(placed, new THREE.Color().setHSL(0.24 + rng() * 0.05, 0.4, 0.34 + rng() * 0.12)); placed++;
    }
    reeds.count = placed;
    reeds.castShadow = true;
    worldGroup.add(reeds);
  }

  // ---- flowers (small, never on or beside a stone) and glowing plants (twilight) ------------------------------------------
  { const target = Math.round(style.flowers * qp.flowers); const petalGeo = track(new THREE.SphereGeometry(0.075, 6, 4)); petalGeo.scale(1, 0.45, 1);
    const centreGeo = track(new THREE.SphereGeometry(0.04, 6, 4));
    const petals = new THREE.InstancedMesh(petalGeo, track(new THREE.MeshStandardMaterial({ roughness: 0.7 })), target * 5);
    const centres = new THREE.InstancedMesh(centreGeo, track(new THREE.MeshStandardMaterial({ color: '#ffcf3a', roughness: 0.6 })), target);
    let placed = 0;
    for (let i = 0; i < target * 6 && placed < target; i++) {
      const x = (rng() - 0.5) * W, z = (rng() - 0.5) * H;
      if (!clearOfStones(x, z, 0.1, path.radius * 0.6 + 0.4) || distToRiver(x, z) < 0.25) continue;
      const col = new THREE.Color(style.flowerColors[Math.floor(rng() * style.flowerColors.length)]);
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; dummy.position.set(x + Math.cos(a) * 0.075, 0.07, z + Math.sin(a) * 0.075); dummy.rotation.set(0, a, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); petals.setMatrixAt(placed * 5 + k, dummy.matrix); petals.setColorAt(placed * 5 + k, col); }
      dummy.position.set(x, 0.1, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); centres.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    petals.count = placed * 5; centres.count = placed;
    worldGroup.add(petals, centres);
  }
  const glowMats: THREE.MeshBasicMaterial[] = [];
  if (style.glowPlants > 0 && qp.flowers > 0.5) {
    const bulbGeo = track(new THREE.SphereGeometry(0.11, 10, 8)); bulbGeo.translate(0, 0.16, 0);
    const bulbMat = track(new THREE.MeshStandardMaterial({ color: '#bfe9ff', emissive: new THREE.Color('#7fd8ff'), emissiveIntensity: 0.9, roughness: 0.5 }));
    const glowMat = track(new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#8fe0ff', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    glowMats.push(glowMat);
    const glowGeo = track(new THREE.PlaneGeometry(1, 1)); glowGeo.rotateX(-Math.PI / 2);
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, style.glowPlants);
    const glows = new THREE.InstancedMesh(glowGeo, glowMat, style.glowPlants);
    let placed = 0;
    for (let i = 0; i < 300 && placed < style.glowPlants; i++) {
      const x = (rng() - 0.5) * W, z = (rng() - 0.5) * H;
      if (!clearOfStones(x, z, 0.2, path.radius * 0.6 + 0.9) || distToRiver(x, z) < 0.3) continue;
      const k = 0.8 + rng() * 0.8;
      dummy.position.set(x, 0, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(k); dummy.updateMatrix(); bulbs.setMatrixAt(placed, dummy.matrix);
      dummy.position.set(x, 0.05, z); dummy.scale.setScalar(0.9 + rng() * 0.7); dummy.updateMatrix(); glows.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    bulbs.count = glows.count = placed;
    worldGroup.add(bulbs, glows);
  }

  // ---- dappled light (slowly drifting leaf shadows) ---------------------------------------------------------------------
  let dappleTex: THREE.CanvasTexture | null = null;
  if (qp.dapple) {
    dappleTex = dappleTexture().clone(); dappleTex.needsUpdate = true; dappleTex.repeat.set((W + 10) / 12, (H + 10) / 12); track(dappleTex);
    const dm = track(new THREE.MeshBasicMaterial({ map: dappleTex, transparent: true, opacity: world === 2 ? 0.16 : 0.26, depthWrite: false }));
    const d = new THREE.Mesh(track(new THREE.PlaneGeometry(W + 10, H + 10)), dm);
    d.rotation.x = -Math.PI / 2; d.position.y = 0.09; worldGroup.add(d);
  }

  // ---- stepping stones ------------------------------------------------------------------------------------------------------
  const stoneVisuals: StoneVisual[] = [];
  const R = path.radius;
  // planar UVs scaled to the stone: each stone shows one variant of the painted rock texture
  const stoneTex = [0, 1, 2].map((v) => { const t = stoneTexture(v).clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; return track(t); });
  const haloGeo = track(new THREE.PlaneGeometry(R * 3.6, R * 3.6)); haloGeo.rotateX(-Math.PI / 2);
    const waveGeo = track(new THREE.RingGeometry(R * 0.96, R * 1.04, 64)); waveGeo.rotateX(-Math.PI / 2);
  const footGeo = track(new THREE.PlaneGeometry(R * 1.1, R * 1.1)); footGeo.rotateX(-Math.PI / 2);
  const contactGeo = track(new THREE.PlaneGeometry(R * 3.0, R * 3.0)); contactGeo.rotateX(-Math.PI / 2);
  const additive = (map: THREE.Texture | null, color: THREE.Color | string) => track(new THREE.MeshBasicMaterial({ map, color: new THREE.Color(color), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const solid = (map: THREE.Texture | null, color: THREE.Color | string) => track(new THREE.MeshBasicMaterial({ map, color: new THREE.Color(color), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const contactMat = track(new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.85 }));
  const mossGeo = track(new THREE.SphereGeometry(1, 8, 6));
  const mossItems: { x: number; z: number; s: number; rot: number }[] = [];
  path.stones.forEach((st, i) => {
    const group = new THREE.Group();
    group.position.set(toX(st.x), 0.02, toZ(st.y));
    const geo = track(stoneGeometry(R, st.shape));
    const tex = stoneTex[st.shape % 3];
    const bodyMat = track(new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.35, roughness: 0.92, metalness: 0, emissive: GOLD.clone(), emissiveIntensity: 0 }));
    const body = new THREE.Mesh(geo, bodyMat);
    body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    const contact = new THREE.Mesh(contactGeo, contactMat); contact.position.y = 0.0; group.add(contact);
    const next = stoneVisuals.length;
    const haloMat = additive(rimGlowTexture(), '#ffb830');
    const halo = new THREE.Mesh(haloGeo, haloMat); halo.position.y = 0.06; group.add(halo);
    const ringMat = solid(null, '#f6b21e');
    const ring = new THREE.Mesh(track(stoneRingGeometry(R, st.shape, 0.84, 0.965, 0.035)), ringMat); group.add(ring);
    const nextMat = solid(null, '#c9a24a');
    const nextRing = new THREE.Mesh(track(stoneRingGeometry(R, st.shape, 0.86, 0.95, 0.03)), nextMat); group.add(nextRing);
    const footMat = solid(footTexture(st.foot ?? 'PAIR'), '#6e4410');
    const foot = new THREE.Mesh(footGeo, footMat); foot.position.y = TOP_Y + 0.012; group.add(foot);
    // the footprint points toward the next stone: a gentle directional cue
    const nx = path.stones[Math.min(i + 1, path.stones.length - 1)], pv = path.stones[Math.max(i - 1, 0)];
    const dx = (i + 1 < path.stones.length ? nx.x - st.x : st.x - pv.x), dz = (i + 1 < path.stones.length ? nx.y - st.y : st.y - pv.y);
    foot.rotation.y = Math.atan2(-dx, -dz);
    const digitMat = solid(digitTexture(1 + (i % 2)), '#6e4410');
    const digit = new THREE.Mesh(footGeo, digitMat); digit.position.y = TOP_Y + 0.02; digit.scale.setScalar(1.15); group.add(digit);
    const w1 = additive(null, GOLD), w2 = additive(null, GOLD_SOFT);
    const wave1 = new THREE.Mesh(waveGeo, w1), wave2 = new THREE.Mesh(waveGeo, w2);
    wave1.position.y = wave2.position.y = 0.12; wave1.visible = wave2.visible = false; group.add(wave1, wave2);
    const bloomMat = additive(glowTexture(), '#ffd36a');
    const bloom = new THREE.Mesh(haloGeo, bloomMat); bloom.position.y = TOP_Y + 0.03; bloom.visible = false; group.add(bloom);
    for (let k = 0; k < 4; k++) { const a = rng() * 6.28; const rr = R * (0.8 + rng() * 0.14); mossItems.push({ x: toX(st.x) + Math.cos(a) * rr, z: toZ(st.y) + Math.sin(a) * rr, s: R * (0.045 + rng() * 0.05), rot: rng() * 6 }); }
    worldGroup.add(group);
    void next;
    stoneVisuals.push({ stone: st, group, body, bodyMat, halo, ring, foot, digit, next: nextRing, haloMat, ringMat, footMat, digitMat, nextMat, waves: [wave1, wave2], waveMats: [w1, w2], bloom, bloomMat, amt: 0, nextAmt: 0, digitAmt: 0, succ: -1 });
  });
  { // moss: small flattened lumps on stone rims, away from the lit centre
    const mossMat = track(new THREE.MeshStandardMaterial({ color: '#7fae58', roughness: 1 }));
    const moss = new THREE.InstancedMesh(mossGeo, mossMat, mossItems.length);
    mossItems.forEach((m, i) => { dummy.position.set(m.x, 0.33, m.z); dummy.rotation.set(0, m.rot, 0); dummy.scale.set(m.s * 1.4, m.s * 0.5, m.s); dummy.updateMatrix(); moss.setMatrixAt(i, dummy.matrix); moss.setColorAt(i, new THREE.Color().setHSL(0.24 + rng() * 0.06, 0.45, 0.3 + rng() * 0.12)); });
    worldGroup.add(moss);
  }

  // ---- floating pollen / fireflies, success particles ----------------------------------------------------------------------
  const ambientN = qp.particles;
  let ambient: THREE.Points | null = null;
  const amb = { pos: new Float32Array(ambientN * 3), alpha: new Float32Array(ambientN), size: new Float32Array(ambientN), seed: new Float32Array(ambientN * 3) };
  const ambientMat = pointsMaterial(style.particleColor);
  if (ambientN > 0) {
    for (let i = 0; i < ambientN; i++) { amb.seed.set([rng() * W - W / 2, 0.4 + rng() * 2.2, rng() * H - H / 2], i * 3); amb.size[i] = style.particleSize * (0.6 + rng() * 0.8); }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(amb.pos, 3)); g.setAttribute('aAlpha', new THREE.BufferAttribute(amb.alpha, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(amb.size, 1));
    ambient = new THREE.Points(g, track(ambientMat)); ambient.frustumCulled = false; worldGroup.add(ambient);
  }
  const SP = 40;
  const sp = { pos: new Float32Array(SP * 3), alpha: new Float32Array(SP), size: new Float32Array(SP), vel: new Float32Array(SP * 3), life: new Float32Array(SP).fill(-1) };
  const spMat = pointsMaterial('#ffd36a');
  const spGeo = track(new THREE.BufferGeometry());
  spGeo.setAttribute('position', new THREE.BufferAttribute(sp.pos, 3)); spGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sp.alpha, 1)); spGeo.setAttribute('aSize', new THREE.BufferAttribute(sp.size, 1));
  const successPoints = new THREE.Points(spGeo, track(spMat)); successPoints.frustumCulled = false; worldGroup.add(successPoints);
  let spCursor = 0;

  // ---- butterflies -------------------------------------------------------------------------------------------------------------
  const butterflies: { g: THREE.Group; wings: THREE.Mesh[]; ph: number; ax: number; az: number; sp: number; cx: number; cz: number }[] = [];
  if (qp.butterflies > 0) {
    const wingGeo = track(new THREE.PlaneGeometry(0.42, 0.42)); wingGeo.rotateX(-Math.PI / 2); wingGeo.translate(0.21, 0, 0);
    const bodyGeo = track(new THREE.CapsuleGeometry(0.025, 0.2, 3, 6)); bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = track(new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.8 }));
    const colors = ['#ffcf3a', '#ff8fbf', '#7cc8ff', '#ffffff', '#ff9a52'];
    for (let i = 0; i < qp.butterflies; i++) {
      const mat = track(new THREE.MeshStandardMaterial({ map: wingTexture(), color: colors[i % colors.length], roughness: 0.6, side: THREE.DoubleSide, transparent: true, alphaTest: 0.2, emissive: new THREE.Color(colors[i % colors.length]), emissiveIntensity: 0.14 }));
      const g = new THREE.Group();
      const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
      r.scale.x = -1; l.castShadow = r.castShadow = true;
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      g.add(l, r, body); g.scale.setScalar(0.9 + rng() * 0.5);
      worldGroup.add(g);
      butterflies.push({ g, wings: [l, r], ph: rng() * 6, ax: 2 + rng() * 5, az: 1.2 + rng() * 2.6, sp: 0.12 + rng() * 0.12, cx: (rng() - 0.5) * W * 0.8, cz: (rng() - 0.5) * H * 0.8 });
    }
  }

  // ---- calibration grid ------------------------------------------------------------------------------------------------------
  const grid = new THREE.Group();
  {
    const mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 }); track(mat);
    const pts: THREE.Vector3[] = [];
    const cm = config.floorWidthCm > 0 ? config.floorWidthCm / W : 0; // cm per world unit
    const step = cm > 0 ? 50 / cm : W / 16;
    for (let x = 0; x <= W / 2 + 1e-6; x += step) for (const sx of x === 0 ? [1] : [1, -1]) pts.push(new THREE.Vector3(sx * x, 0.2, -H / 2), new THREE.Vector3(sx * x, 0.2, H / 2));
    for (let z = 0; z <= H / 2 + 1e-6; z += step) for (const sz of z === 0 ? [1] : [1, -1]) pts.push(new THREE.Vector3(-W / 2, 0.2, sz * z), new THREE.Vector3(W / 2, 0.2, sz * z));
    const u = path.usable;
    const ux0 = toX(u.x0), ux1 = toX(u.x1), uz0 = toZ(u.y0), uz1 = toZ(u.y1);
    pts.push(new THREE.Vector3(ux0, 0.22, uz0), new THREE.Vector3(ux1, 0.22, uz0), new THREE.Vector3(ux1, 0.22, uz0), new THREE.Vector3(ux1, 0.22, uz1), new THREE.Vector3(ux1, 0.22, uz1), new THREE.Vector3(ux0, 0.22, uz1), new THREE.Vector3(ux0, 0.22, uz1), new THREE.Vector3(ux0, 0.22, uz0));
    const g = track(new THREE.BufferGeometry().setFromPoints(pts));
    grid.add(new THREE.LineSegments(g, mat));
    grid.visible = false;
    worldGroup.add(grid);
  }

  // ---- camera -----------------------------------------------------------------------------------------------------------------
  const ortho = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, 200);
  const persp = new THREE.PerspectiveCamera(32, W / H, 0.1, 300);
  let camera: THREE.Camera = ortho;
  let lastW = 0, lastH = 0, lastView = '';
  function setView(view: 'floor' | 'cinematic', w: number, h: number) {
    const key = `${view}:${w}x${h}`;
    if (key === lastView) return;
    lastView = key;
    if (view === 'floor') {
      worldGroup.scale.set(1, 1, 1 / COS);
      // match the camera to the actual screen ratio: the floor plane exactly fills the screen height and is centred
      const aspect = w / h;
      const halfH = H / 2, halfW = Math.max(W / 2, halfH * aspect);
      ortho.left = -halfW; ortho.right = halfW; ortho.top = halfH; ortho.bottom = -halfH;
      ortho.position.set(0, 60 * COS, 60 * Math.sin(TILT)); ortho.up.set(0, 1, 0); ortho.lookAt(0, 0, 0); ortho.updateProjectionMatrix();
      camera = ortho;
    } else {
      worldGroup.scale.set(1, 1, 1);
      persp.aspect = w / h;
      const fov = (persp.fov * Math.PI) / 180;
      const dist = Math.max((H * 0.95) / (2 * Math.tan(fov / 2)), (W * 0.62) / (2 * Math.tan(fov / 2) * persp.aspect)) * 1.35;
      const tilt = (52 * Math.PI) / 180;
      persp.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist); persp.up.set(0, 1, 0); persp.lookAt(0, 0, 0); persp.updateProjectionMatrix();
      camera = persp;
    }
  }

  // ---- per-frame --------------------------------------------------------------------------------------------------------------
  let time = 0, pulseTime = 0, lastSuccess = -1, lastCue = -1, cueT = -1, glowDelay = 0;
  let frames = 0, fpsStart = performance.now(), fps = 0;
  const tmpColor = new THREE.Color();

  function spawnParticles(sx: number, sz: number) {
    for (let i = 0; i < 18; i++) {
      const k = spCursor++ % SP;
      const a = rng() * Math.PI * 2, r = rng() * R * 0.8;
      sp.pos.set([sx + Math.cos(a) * r, TOP_Y + 0.15, sz + Math.sin(a) * r], k * 3);
      sp.vel.set([Math.cos(a) * 0.25 * rng(), 0.7 + rng() * 0.7, Math.sin(a) * 0.25 * rng()], k * 3);
      sp.life[k] = 0; sp.size[k] = 7 + rng() * 6;
    }
  }

  function draw(f: ForestFrame, dt: number) {
    const c = f.config;
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    if (w !== lastW || h !== lastH) { renderer.setSize(w, h, false); lastW = w; lastH = h; lastView = ''; }
    setView(c.view, w, h);
    const calm = c.reducedMotion;
    const k = c.intensity / 100;
    time += dt;
    if (!f.frozen) pulseTime += dt;
    const px = (Math.min(window.devicePixelRatio || 1, qp.pr)) * (h / 1080) * 1.4;
    ambientMat.uniforms.uScale.value = px; spMat.uniforms.uScale.value = px;
    grid.visible = c.grid;
    riverMat.uniforms.uTime.value = time;
    riverMat.uniforms.uFlow.value = calm ? 0.08 : 0.35;
    if (dappleTex) { dappleTex.offset.x = calm ? 0 : time * 0.004; dappleTex.offset.y = calm ? 0 : time * 0.0025; }

    // success trigger
    // a scene (re)built mid-session adopts the current counter silently: only NEW accepted steps celebrate
    if (lastSuccess < 0) lastSuccess = f.success.n;
    if (f.success.n !== lastSuccess) {
      const sv = stoneVisuals[f.success.stone];
      if (sv && f.success.n > lastSuccess) {
        sv.succ = 0;
        glowDelay = calm ? 0.2 : 0.7;
        if (!calm) spawnParticles(sv.group.position.x, sv.group.position.z);
      }
      lastSuccess = f.success.n;
    }
    if (f.cue !== lastCue) { if (lastCue >= 0) cueT = 0; lastCue = f.cue; }
    if (cueT >= 0) { cueT += dt; if (cueT > 1.3) cueT = -1; }
    glowDelay = Math.max(0, glowDelay - dt);

    const rate = calm ? 22 : 6;
    const a = 1 - Math.exp(-rate * dt);
    const breath = calm || f.frozen ? 1 : 0.93 + 0.07 * Math.sin(pulseTime * 2.1);
    const cueBoost = cueT >= 0 ? 0.35 * Math.sin(Math.min(1, cueT / 1.3) * Math.PI) : 0;
    const pa = f.previewProgress;
    stoneVisuals.forEach((sv, i) => {
      const st = f.states[i] ?? 'IDLE';
      let target = 0, nextT = 0, digitT = 0;
      if (!f.allIdle) {
        if (f.isMemory && f.phase === 'preview') {
          const inPair = i === f.pairStart || i === f.pairStart + 1;
          digitT = inPair ? 1 : 0;
          const first = i === f.pairStart;
          const lit = pa < 0.45 ? first : pa < 0.9 ? !first : true;
          target = inPair && lit ? 1 : 0;
        } else if (st === 'TARGET' && !f.hideTarget && glowDelay <= 0) target = 1;
        else if (st === 'NEXT' && !f.hideTarget) nextT = 0.32;
      }
      sv.amt += (target - sv.amt) * a;
      sv.nextAmt += (nextT - sv.nextAmt) * a;
      sv.digitAmt += (digitT - sv.digitAmt) * a;
      const act = sv.amt * (breath + cueBoost) * k;
      sv.haloMat.opacity = Math.min(1, act * 0.95);
      sv.ringMat.opacity = Math.min(1, act * 1.0);
      sv.footMat.opacity = Math.min(1, sv.amt * 0.78 * (0.9 + 0.1 * breath + cueBoost)) * k;
      sv.nextMat.opacity = sv.nextAmt * 0.8 * k;
      sv.digitMat.opacity = sv.digitAmt * 0.85 * k;
      sv.halo.visible = sv.haloMat.opacity > 0.01; sv.ring.visible = sv.ringMat.opacity > 0.01; sv.foot.visible = sv.footMat.opacity > 0.01 && !(f.isMemory && f.phase === 'preview'); sv.next.visible = sv.nextMat.opacity > 0.01; sv.digit.visible = sv.digitMat.opacity > 0.01;
      // success: a calm golden bloom, two soft expanding rings, a brief rise of light. Nothing flashes.
      let succGlow = 0;
      if (sv.succ >= 0) {
        sv.succ += dt;
        const t = sv.succ, life = calm ? 1.4 : 1.8;
        const e = clamp01(t / life);
        succGlow = Math.sin(clamp01(t / 0.35) * Math.PI * 0.5) * (1 - ease(clamp01((t - 0.2) / (life - 0.2))));
        sv.bloom.visible = true;
        sv.bloomMat.opacity = (calm ? 0.35 : 0.5) * (1 - e) * (1 - e) * k;
        sv.bloom.scale.setScalar(1 + e * (calm ? 0.2 : 0.9));
        sv.waves.forEach((wv, wi) => {
          const tt = t - wi * 0.28;
          const we = clamp01(tt / 1.3);
          wv.visible = !calm && tt > 0 && we < 1;
          if (wv.visible) { wv.scale.setScalar(0.7 + we * 1.5); sv.waveMats[wi].opacity = (1 - we) * (1 - we) * 0.85 * k; }
        });
        if (t > life) { sv.succ = -1; sv.bloom.visible = false; sv.waves[0].visible = sv.waves[1].visible = false; }
      }
      // the lit stone turns warm gold while its own texture stays visible (a tint, not a wash)
      const warm = Math.min(1, sv.amt * 0.9 + succGlow * 0.6);
      sv.bodyMat.color.setRGB(1 - 0.02 * warm, 1 - 0.2 * warm, 1 - 0.5 * warm);
      sv.bodyMat.emissiveIntensity = Math.max(0, (sv.amt * 0.16 * breath + succGlow * 0.55) * k * (c.highContrast ? 1.3 : 1));
      tmpColor.copy(GOLD); sv.bodyMat.emissive.copy(tmpColor);
    });

    // success particles
    let any = false;
    for (let p = 0; p < SP; p++) {
      if (sp.life[p] < 0) { sp.alpha[p] = 0; continue; }
      sp.life[p] += dt;
      const L = sp.life[p];
      if (L > 1.6) { sp.life[p] = -1; sp.alpha[p] = 0; continue; }
      sp.pos[p * 3] += sp.vel[p * 3] * dt; sp.pos[p * 3 + 1] += sp.vel[p * 3 + 1] * dt; sp.pos[p * 3 + 2] += sp.vel[p * 3 + 2] * dt;
      sp.vel[p * 3 + 1] *= 0.985;
      sp.alpha[p] = (1 - L / 1.6) * Math.min(1, L * 4) * 0.9 * k;
      any = true;
    }
    successPoints.visible = any;
    if (any) { spGeo.attributes.position.needsUpdate = true; spGeo.attributes.aAlpha.needsUpdate = true; spGeo.attributes.aSize.needsUpdate = true; }

    // ambient pollen / fireflies drift slowly (and hold still in reduced-motion mode)
    if (ambient) {
      for (let i = 0; i < ambientN; i++) {
        const sx = amb.seed[i * 3], sy = amb.seed[i * 3 + 1], sz = amb.seed[i * 3 + 2];
        const t = calm ? 0 : time;
        amb.pos[i * 3] = sx + Math.sin(t * 0.21 + i) * 0.6; amb.pos[i * 3 + 1] = sy + Math.sin(t * 0.33 + i * 1.7) * 0.25; amb.pos[i * 3 + 2] = sz + Math.cos(t * 0.17 + i * 0.7) * 0.5;
        amb.alpha[i] = (world === 2 ? 0.45 + 0.45 * Math.sin(t * 0.9 + i * 2.3) ** 2 : 0.5) * k * (calm ? 0.6 : 1);
      }
      ambient.geometry.attributes.position.needsUpdate = true; ambient.geometry.attributes.aAlpha.needsUpdate = true;
    }
    for (const m of glowMats) m.opacity = (calm ? 0.28 : 0.24 + 0.1 * Math.sin(time * 0.8)) * k;

    // butterflies: slow lazy loops
    butterflies.forEach((b) => {
      const t = calm ? b.ph : time * b.sp + b.ph;
      b.g.position.set(b.cx + Math.sin(t * 1.3) * b.ax, 1.3 + Math.sin(t * 2.1) * 0.25, b.cz + Math.sin(t * 0.9 + 1) * b.az);
      b.g.rotation.y = calm ? 0.5 : Math.atan2(Math.cos(t * 1.3) * b.ax * 1.3, Math.cos(t * 0.9 + 1) * b.az * 0.9) - Math.PI / 2;
      const flap = calm ? 0.35 : 0.2 + Math.abs(Math.sin(time * 5.2 + b.ph)) * 0.9;
      b.wings[0].rotation.z = flap; b.wings[1].rotation.z = -flap;
    });

    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - fpsStart >= 1000) { fps = (frames * 1000) / (now - fpsStart); frames = 0; fpsStart = now; }
  }

  function stats() {
    const i = renderer.info;
    return { fps: Math.round(fps * 10) / 10, calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, stones: path.stones.length, world, quality: config.quality, view: camera === ortho ? 'floor' : 'cinematic' };
  }

  /** Screen position (0..1) of a world point (floor units, y down) at height `h`: used by tests and calibration checks. */
  function project(wx: number, wy: number, h = 0) {
    const v = new THREE.Vector3(toX(wx), h, toZ(wy));
    worldGroup.updateMatrixWorld(true);
    v.applyMatrix4(worldGroup.matrixWorld).project(camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    sun.shadow.map?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { draw, stats, project, dispose };
}
