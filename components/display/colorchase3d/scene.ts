import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLOR_IDS, COLORS, type ColorId } from '@/lib/colorchase3d/colors';
import type { Config, Quality } from '@/lib/colorchase3d/engine';
import type { Layout } from '@/lib/colorchase3d/layout';
import { hashSeed, mulberry32 } from '@/lib/colorchase3d/rng';
import { cobbleTexture, dappleTexture, dashTexture, glowTexture, grassTexture, labelTexture, ringTexture, stoneTexture, symbolTexture, wingTexture, zoneTexture } from './textures';

/**
 * The Lost Colors garden renderer (child Display). Pure presentation: it draws the zones and the restoration it is given.
 *
 * FLOOR VIEW (default, the one meant for real projection): an orthographic camera looking down with a tiny fixed tilt
 * (10 degrees) so trees and the fountain show a little side depth; the ground is stretched by 1/cos(tilt) so ground shapes
 * keep their true proportions (a round zone stays round). The camera NEVER moves. CINEMATIC is an opt-in perspective
 * preview, never the physical floor mode. Nothing in the garden is deep, steep or hole-like: the child walks on a flat floor.
 *
 * THE LOST COLORS: every color of the garden belongs to a group (red flowers, blue water, green foliage, golden light, violet
 * magic). Each group has its own saturation / growth uniform, driven by how many of that color's objectives are done, so
 * the garden itself changes material by material; there is no full-screen color filter.
 */
const TILT = (10 * Math.PI) / 180;
const COS = Math.cos(TILT);
const ZONE_Y = 0.07;

type Group = ColorId | 'neutral';
type Ref = { value: number };

interface WorldStyle {
  name: string;
  sun: string; sunCold: string; sunIntensity: number; sunDir: [number, number]; hemiSky: string; hemiGround: string; hemiIntensity: number; exposure: number; background: string;
  canopy: string[]; trees: number; bushes: number; beds: Record<'red' | 'yellow' | 'purple' | 'blue', number>;
  fountain: 'bird' | 'grand' | 'crystal'; fountainR: number; ponds: number; lanterns: number; crystals: number; glowPlants: number; benches: number; arbor: boolean; columns: number;
  motes: string; moteSize: number;
}

const STYLES: WorldStyle[] = [
  { // The Forgotten Garden: a calm morning garden
    name: 'forgotten', sun: '#fff0c8', sunCold: '#dfe6f0', sunIntensity: 2.6, sunDir: [-0.55, -0.6], hemiSky: '#d9ecff', hemiGround: '#6b8f3f', hemiIntensity: 1.35, exposure: 1.18, background: '#6fae45',
    canopy: ['#6cc058', '#8bd05a', '#58ac52', '#7ac85a'], trees: 10, bushes: 18, beds: { red: 9, yellow: 5, purple: 5, blue: 4 },
    fountain: 'bird', fountainR: 1.7, ponds: 1, lanterns: 4, crystals: 0, glowPlants: 0, benches: 2, arbor: true, columns: 0, motes: '#fff6c8', moteSize: 2.6,
  },
  { // The Sleeping Fountain: a larger garden around a grand water feature
    name: 'fountain', sun: '#ffe8b8', sunCold: '#d6e0ee', sunIntensity: 2.4, sunDir: [-0.5, -0.65], hemiSky: '#c6e6e0', hemiGround: '#46703f', hemiIntensity: 1.3, exposure: 1.16, background: '#4f9440',
    canopy: ['#52a650', '#5cb85a', '#6ac05a', '#46964e'], trees: 11, bushes: 18, beds: { red: 8, yellow: 6, purple: 6, blue: 8 },
    fountain: 'grand', fountainR: 3.0, ponds: 2, lanterns: 6, crystals: 2, glowPlants: 0, benches: 2, arbor: false, columns: 0, motes: '#fff0c0', moteSize: 2.6,
  },
  { // The Enchanted Sanctuary: a magical garden with glowing plants and old stone architecture
    name: 'sanctuary', sun: '#ffd9a6', sunCold: '#cfd6ec', sunIntensity: 2.1, sunDir: [-0.45, -0.7], hemiSky: '#c4c8f4', hemiGround: '#5a7ca0', hemiIntensity: 1.45, exposure: 1.22, background: '#4a8a66',
    canopy: ['#3f9a7e', '#5a8cc0', '#3f9e70', '#7078c8'], trees: 10, bushes: 12, beds: { red: 5, yellow: 5, purple: 9, blue: 7 },
    fountain: 'crystal', fountainR: 2.4, ponds: 1, lanterns: 8, crystals: 8, glowPlants: 36, benches: 0, arbor: true, columns: 6, motes: '#ffe28a', moteSize: 3.6,
  },
];

export interface GardenSpec {
  world: 0 | 1 | 2;
  layout: Layout;
  stage: number;
  seed: number;
  config: Config;
}

export interface GardenFrame {
  /** Color shown in each slot right now (changes only between rounds). */
  zones: readonly ColorId[];
  target: ColorId | null;
  /** Second color of a sequence round, kept as a soft hint when assistance is high. */
  hint: ColorId | null;
  /** Authoritative restoration targets (0..1) and the overall share. */
  restore: Record<ColorId, number>;
  overall: number;
  cue: number;
  success: { n: number; slot: number; color: ColorId };
  /** Control is not connected: calm, nothing highlighted. */
  allIdle: boolean;
  /** Paused / resting: pulses hold still. */
  frozen: boolean;
  config: Config;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function qualityParams(q: Quality) {
  return q === 'high'
    ? { pr: 2, shadow: 2048, aa: true, butterflies: 6, motes: 70, treeScale: 1, detail: 2, flowers: 1, drops: 90, sparks: 60 }
    : q === 'medium'
      ? { pr: 1.5, shadow: 1024, aa: true, butterflies: 4, motes: 36, treeScale: 0.8, detail: 1, flowers: 0.65, drops: 50, sparks: 40 }
      : { pr: 1, shadow: 0, aa: false, butterflies: 0, motes: 0, treeScale: 0.55, detail: 1, flowers: 0.35, drops: 18, sparks: 24 };
}

/** A lumpy blob of merged icospheres (a tree canopy or bush), vertex-shaded lighter on top. */
function blobGeometry(seed: number, lobes: number, detail: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < lobes; i++) {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
    const small = i > 4;
    const s = i === 0 ? 1 : small ? 0.2 + rng() * 0.16 : 0.45 + rng() * 0.4;
    const ox = i === 0 ? 0 : (rng() - 0.5) * (small ? 1.7 : 1.1), oz = i === 0 ? 0 : (rng() - 0.5) * (small ? 1.7 : 1.1), oy = i === 0 ? 0 : small ? 0.15 + rng() * 0.45 : 0.1 + rng() * 0.35;
    g.scale(s, s * 0.78, s);
    g.translate(ox, oy, oz);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const jitter = 1 + Math.sin(pos.getX(k) * 9 + i) * Math.cos(pos.getZ(k) * 8 + i * 2) * 0.07;
      pos.setXYZ(k, pos.getX(k) * jitter, pos.getY(k), pos.getZ(k) * jitter);
    }
    parts.push(g);
  }
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
      const shade = (0.58 + 0.62 * t) * (0.84 + 0.32 * leaf);
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
    uv.set([len / 2.2, 0], i * 4);
    uv.set([len / 2.2, 1], i * 4 + 2);
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const WATER_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WATER_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform float uFlow; uniform float uAlpha; uniform float uSat;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 p = vUv - 0.5;
  float d = length(p) * 2.0;
  float t = uTime * uFlow;
  float n = noise(p * 8.0 + vec2(t * 0.35, t * 0.2)) * 0.6 + noise(p * 17.0 - vec2(t * 0.25, 0.0)) * 0.3;
  float rings = sin(d * 24.0 - t * 5.0) * 0.5 + 0.5;
  vec3 col = mix(uShallow, uDeep, smoothstep(1.0, 0.15, d) * 0.55 + n * 0.25);
  col += (n - 0.4) * 0.12 + rings * 0.05 * uFlow;
  float streak = smoothstep(0.78, 0.96, noise(p * 22.0 + vec2(t * 0.8, 0.0)));
  col += streak * 0.2 * uFlow * vec3(1.0, 1.0, 0.94);
  float foam = smoothstep(0.8, 1.0, d);
  col = mix(col, vec3(0.95, 1.0, 1.0), foam * 0.5);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l * 0.8 + 0.1), col, uSat);
  gl_FragColor = vec4(col, uAlpha * smoothstep(1.0, 0.95, d));
  #include <colorspace_fragment>
}`;

const POINT_VERT = `
attribute float aAlpha; attribute float aSize; attribute vec3 aColor; varying float vAlpha; varying vec3 vColor; uniform float uScale;
void main(){ vAlpha = aAlpha; vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale; gl_Position = projectionMatrix * mv; }`;
const POINT_FRAG = `
precision highp float; varying float vAlpha; varying vec3 vColor;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a *= a; gl_FragColor = vec4(vColor, a * vAlpha);
  #include <colorspace_fragment>
}`;

function pointsMaterial() {
  return new THREE.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: 1 } } });
}

/** Makes a lit material belong to a color group: its saturation (and optionally growth) follow the group's shared uniforms. */
function lostColors<T extends THREE.Material>(mat: T, sat: Ref, grow?: Ref): T {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSat = sat;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSat;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ float l_ = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(vec3(l_ * 0.78 + 0.1), diffuseColor.rgb, uSat); }');
    if (grow) {
      sh.uniforms.uGrow = grow;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uGrow;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= uGrow;');
    }
  };
  mat.customProgramCacheKey = () => (grow ? 'lost-grow' : 'lost');
  return mat;
}

export function createGarden(canvas: HTMLCanvasElement, spec: GardenSpec) {
  const { layout, world, config } = spec;
  const style = STYLES[world];
  const qp = qualityParams(config.quality);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: qp.aa, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qp.pr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = style.exposure;
  renderer.shadowMap.enabled = qp.shadow > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const W = layout.worldW, H = layout.worldH;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(style.background);
  // decor depends only on the world and the zone slots (never on the stage's color order), so a level keeps one garden
  const rng = mulberry32(hashSeed(4100 + world, Math.round(W * 100), layout.slots.length, layout.kind.length));
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => { disposables.push(o); return o; };
  const toX = (x: number) => x - W / 2;
  const toZ = (y: number) => y - H / 2;
  const cloneTex = (t: THREE.CanvasTexture, rx: number, ry: number) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx, ry); return track(c); };

  // ---- color groups ------------------------------------------------------------------------------------------------
  const sat = {} as Record<Group, Ref>;
  const grow = {} as Record<ColorId, Ref>;
  for (const g of [...COLOR_IDS, 'neutral'] as Group[]) sat[g] = { value: 0.15 };
  for (const c of COLOR_IDS) grow[c] = { value: 0.55 };
  const gv = {} as Record<ColorId, number>;
  const pop = {} as Record<ColorId, number>;
  for (const c of COLOR_IDS) { gv[c] = 0; pop[c] = 0; }
  let overallV = 0;
  const anchors = {} as Record<ColorId, { x: number; y: number; z: number }[]>;
  for (const c of COLOR_IDS) anchors[c] = [];

  const crystalMats: { m: THREE.MeshStandardMaterial; k: number }[] = [];
  const counts: Record<string, number> = {};

  // ---- light -----------------------------------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(style.hemiSky, style.hemiGround, style.hemiIntensity);
  scene.add(hemi);
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
    sun.shadow.intensity = 0.5;
  }
  scene.add(sun, sun.target);
  const sunWarm = new THREE.Color(style.sun), sunCool = new THREE.Color(style.sunCold);

  // ---- exclusions: nothing decorative ever sits on a zone ------------------------------------------------------------
  const zoneCircles = layout.slots.map((p) => ({ x: toX(p.x), z: toZ(p.y), r: layout.radius }));
  const occupied: { x: number; z: number; r: number }[] = [];
  const clear = (x: number, z: number, r: number, pad: number) =>
    zoneCircles.every((s) => Math.hypot(s.x - x, s.z - z) >= s.r + r + pad) && occupied.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + r + pad * 0.5);
  const inWorld = (x: number, z: number, m = 0) => Math.abs(x) <= W / 2 + m && Math.abs(z) <= H / 2 + m;

  // ---- ground --------------------------------------------------------------------------------------------------------------
  const groundMat = track(lostColors(new THREE.MeshStandardMaterial({ map: cloneTex(grassTexture(world), (W + 10) / 7, (H + 10) / 7), roughness: 1, metalness: 0 }), sat.green));
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(W + 12, H + 12)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  worldGroup.add(ground);

  // ---- garden path: enters from the left, winds through the zones and leaves to the right -----------------------------
  const sorted = [...zoneCircles].sort((a, b) => a.x - b.x);
  // the path winds through the gaps BETWEEN zones (never under their centres), so it stays visible around them
  const pathPts: THREE.Vector3[] = [new THREE.Vector3(-W / 2 - 3, 0.03, H * 0.3 * (rng() < 0.5 ? -1 : 1))];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], n = sorted[i + 1];
    const mx = (a.x + n.x) / 2, mz = (a.z + n.z) / 2;
    const nxv = -(n.z - a.z), nzv = n.x - a.x, nl = Math.hypot(nxv, nzv) || 1;
    const side = i % 2 ? -1 : 1;
    const off = Math.max(0, (Math.hypot(n.x - a.x, n.z - a.z) / 2) - 0.2) * 0.35;
    pathPts.push(new THREE.Vector3(mx + (nxv / nl) * off * side, 0.03, mz + (nzv / nl) * off * side));
  }
  pathPts.push(new THREE.Vector3(W / 2 + 3, 0.03, -pathPts[0].z * 0.8));
  const pathCurve = new THREE.CatmullRomCurve3(pathPts, false, 'centripetal');
  const pathSamples = pathCurve.getPoints(140);
  const pathMat = track(lostColors(new THREE.MeshStandardMaterial({ map: cloneTex(cobbleTexture(), 1, 1), roughness: 0.95 }), sat.neutral));
  const pathMesh = new THREE.Mesh(track(ribbon(pathSamples, (t) => 1.25 + 0.15 * Math.sin(t * 11 + world))), pathMat);
  pathMesh.receiveShadow = true;
  worldGroup.add(pathMesh);
  const distToPath = (x: number, z: number) => pathSamples.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), Infinity);

  // ---- fountain (the signature of the blue group) and ponds ---------------------------------------------------------
  const stoneTex = cloneTex(stoneTexture(), 2, 1);
  const stoneMat = track(lostColors(new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9, side: THREE.DoubleSide }), sat.neutral));
  const dummy2 = new THREE.Object3D();
  const waterU = { uTime: { value: 0 }, uFlow: { value: 0.15 }, uSat: sat.blue };
  const makeWater = (shallow: string, deep: string, alpha: number) =>
    track(new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false,
      uniforms: { uTime: waterU.uTime, uFlow: waterU.uFlow, uSat: waterU.uSat, uShallow: { value: new THREE.Color(shallow) }, uDeep: { value: new THREE.Color(deep) }, uAlpha: { value: alpha } },
    }));
  const waterMat = makeWater('#8fe3df', '#2f7fd0', 0.92);
  const lathe = (pts: [number, number][], seg = 64) => track(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
  const blockGeo = track(new THREE.BoxGeometry(0.66, 0.2, 0.34));
  const basin = (R: number, wall: number) => {
    const g = lathe([[0, 0.0], [R, 0.0], [R + 0.06, 0.14], [R + 0.1, wall], [R + 0.22, wall + 0.06], [R + 0.22, wall + 0.14], [R - 0.12, wall + 0.14], [R - 0.14, wall - 0.04], [R - 0.2, 0.2], [0, 0.2]], 72);
    const m = new THREE.Mesh(g, stoneMat);
    m.castShadow = true; m.receiveShadow = true;
    // a ring of rim stones: reads as hand-laid masonry even from straight above
    const n = Math.max(10, Math.round((2 * Math.PI * (R + 0.2)) / 0.72));
    const rim = new THREE.InstancedMesh(blockGeo, stoneMat, n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      dummy2.position.set(Math.cos(a) * (R + 0.04), wall + 0.15, Math.sin(a) * (R + 0.04));
      dummy2.rotation.set(0, -a + Math.PI / 2, 0);
      dummy2.scale.set(Math.min(1.05, (R * 2 * Math.PI) / n / 0.7), 1, 1);
      dummy2.updateMatrix();
      rim.setMatrixAt(i, dummy2.matrix);
      rim.setColorAt(i, new THREE.Color().setHSL(0.1, 0.06, 0.62 + (i % 3) * 0.06));
    }
    rim.castShadow = true; rim.receiveShadow = true;
    const grp = new THREE.Group();
    grp.add(m, rim);
    return grp;
  };
  const jets: { x: number; z: number; h: number; spread: number; count: number }[] = [];
  const fountainPos = new THREE.Vector3(0, 0, 0);
  let fountainR = 0;
  {
    const cands: [number, number][] = [[0, 0], [0, -H * 0.3], [0, H * 0.3], [-W * 0.3, 0], [W * 0.3, 0], [-W * 0.34, -H * 0.3], [W * 0.34, -H * 0.3], [-W * 0.34, H * 0.3], [W * 0.34, H * 0.3]];
    let best: { x: number; z: number; free: number } | null = null;
    for (const [x, z] of cands) {
      const free = Math.min(...zoneCircles.map((s) => Math.hypot(s.x - x, s.z - z) - s.r - 0.55));
      if (!best || free > best.free + 0.2) best = { x, z, free };
      if (free >= style.fountainR) { best = { x, z, free }; break; }
    }
    fountainR = Math.min(style.fountainR, best ? best.free : 0);
    if (best && fountainR >= 1.05) {
      fountainPos.set(best.x, 0, best.z);
      occupied.push({ x: best.x, z: best.z, r: fountainR + 0.3 });
      const g = new THREE.Group();
      g.position.copy(fountainPos);
      const R = fountainR;
      g.add(basin(R, 0.46));
      const surface = new THREE.Mesh(track(new THREE.CircleGeometry(R - 0.14, 56)), waterMat);
      surface.rotation.x = -Math.PI / 2; surface.position.y = 0.34; g.add(surface);
      const tiers = style.fountain === 'grand' ? 2 : 1;
      let top = 0.2;
      for (let t = 0; t < tiers; t++) {
        const rr = R * (t === 0 ? 0.36 : 0.2);
        const base = track(new THREE.Mesh(lathe([[0, top], [rr * 0.5, top], [rr * 0.34, top + 0.35], [rr * 0.2, top + 0.7], [rr * 0.24, top + 0.78], [0, top + 0.78]], 32), stoneMat));
        base.castShadow = true; g.add(base);
        const bowl = new THREE.Mesh(lathe([[0, top + 0.7], [rr, top + 0.86], [rr + 0.05, top + 0.94], [rr - 0.08, top + 0.94], [rr * 0.9, top + 0.82], [0, top + 0.78]], 40), stoneMat);
        bowl.castShadow = true; g.add(bowl);
        const bw = new THREE.Mesh(track(new THREE.CircleGeometry(rr - 0.1, 32)), waterMat);
        bw.rotation.x = -Math.PI / 2; bw.position.y = top + 0.9; g.add(bw);
        top += 0.78;
      }
      jets.push({ x: best.x, z: best.z, h: 0.85 + top * 0.5, spread: 0.55, count: 1 });
      if (style.fountain === 'grand') {
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          jets.push({ x: best.x + Math.cos(a) * (R - 0.45), z: best.z + Math.sin(a) * (R - 0.45), h: 0.55, spread: 0.45, count: 0 });
          const nozzle = new THREE.Mesh(track(new THREE.CylinderGeometry(0.07, 0.1, 0.22, 8)), stoneMat);
          nozzle.position.set(Math.cos(a) * (R - 0.45), 0.4, Math.sin(a) * (R - 0.45)); g.add(nozzle);
        }
      }
      if (style.fountain === 'crystal') {
        const cm = track(lostColors(new THREE.MeshStandardMaterial({ color: '#c9b4f0', roughness: 0.25, metalness: 0.0, emissive: new THREE.Color('#8a4ff0'), emissiveIntensity: 0, transparent: true, opacity: 0.95 }), sat.purple));
        crystalMats.push({ m: cm, k: 1.1 });
        for (let k = 0; k < 5; k++) {
          const geo = track(new THREE.OctahedronGeometry(0.34, 0));
          geo.scale(0.6, 2.2 + k * 0.15, 0.6);
          const c = new THREE.Mesh(geo, cm);
          const a = (k / 5) * Math.PI * 2;
          c.position.set(Math.cos(a) * 0.5, top + 0.45, Math.sin(a) * 0.5); c.rotation.set(Math.cos(a) * 0.3, a, Math.sin(a) * 0.3); g.add(c);
        }
      }
      worldGroup.add(g);
      for (let i = 0; i < 5; i++) anchors.blue.push({ x: best.x + (rng() - 0.5) * R, y: 0.6, z: best.z + (rng() - 0.5) * R });
    }
  }
  // ponds: small bodies of water (they keep the blue group visible when the fountain is small)
  const waterBodies: THREE.Mesh[] = [];
  for (let p = 0; p < style.ponds; p++) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const r = 1.0 + rng() * 0.9;
      const x = (rng() - 0.5) * (W - 3), z = (rng() - 0.5) * (H - 3);
      if (Math.abs(x) < W / 2 - r - 0.6 && Math.abs(z) < H / 2 - r - 0.6 && (Math.abs(x) > W * 0.34 || Math.abs(z) > H * 0.34) && clear(x, z, r + 0.3, 0.5) && distToPath(x, z) > r + 0.7) {
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        g.add(basin(r, 0.3));
        const pm = new THREE.Mesh(track(new THREE.CircleGeometry(r - 0.1, 40)), waterMat);
        pm.rotation.x = -Math.PI / 2; pm.position.y = 0.24; g.add(pm);
        worldGroup.add(g);
        occupied.push({ x, z, r: r + 0.3 });
        anchors.blue.push({ x, y: 0.5, z });
        waterBodies.push(pm);
        counts.ponds = (counts.ponds ?? 0) + 1;
        break;
      }
    }
  }
  // fountain droplets
  const drops = style.fountain === 'crystal' ? Math.round(qp.drops * 0.5) : qp.drops;
  const dropGeo = track(new THREE.BufferGeometry());
  const dropArr = { pos: new Float32Array(drops * 3), alpha: new Float32Array(drops), size: new Float32Array(drops), color: new Float32Array(drops * 3) };
  const dropMeta = Array.from({ length: drops }, (_, i) => ({ jet: i % Math.max(1, jets.length), ph: rng(), a: rng() * Math.PI * 2, sp: 0.35 + rng() * 0.2 }));
  for (let i = 0; i < drops; i++) { dropArr.size[i] = 5 + rng() * 4; dropArr.color.set([0.78, 0.93, 1], i * 3); }
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropArr.pos, 3));
  dropGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dropArr.alpha, 1));
  dropGeo.setAttribute('aSize', new THREE.BufferAttribute(dropArr.size, 1));
  dropGeo.setAttribute('aColor', new THREE.BufferAttribute(dropArr.color, 3));
  const dropMat = track(pointsMaterial());
  const dropPoints = new THREE.Points(dropGeo, dropMat);
  dropPoints.frustumCulled = false;
  if (jets.length && drops > 0) worldGroup.add(dropPoints);

  const dummy = new THREE.Object3D();
  const sphere = () => { const g = new THREE.SphereGeometry(1, 8, 6); return g; };
  const bake = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts)!; parts.forEach((p) => p.dispose()); return track(g); };

  // ---- architecture first (arbor, columns, benches): the trees then fill whatever room is left ---------------------------
  // arbor / pergola with violet wisteria
  if (style.arbor) {
    const spots: [number, number, number][] = [[0, -H / 2 + 1.1, 0], [-W * 0.3, -H / 2 + 1.1, 0], [W * 0.3, -H / 2 + 1.1, 0], [0, H / 2 - 1.1, 0], [-W * 0.3, H / 2 - 1.1, 0], [W * 0.3, H / 2 - 1.1, 0], [-W / 2 + 1.1, 0, Math.PI / 2], [W / 2 - 1.1, 0, Math.PI / 2], [-W / 2 + 1.1, -H * 0.28, Math.PI / 2], [W / 2 - 1.1, H * 0.28, Math.PI / 2]];
    const woodMat = track(lostColors(new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.9 }), sat.neutral));
    const colGeo = track(new THREE.BoxGeometry(0.22, 2.4, 0.22).translate(0, 1.2, 0));
    const beamGeo = track(new THREE.BoxGeometry(3.6, 0.2, 0.34).translate(0, 2.45, 0));
    const rafterGeo = track(new THREE.BoxGeometry(0.14, 0.14, 1.6).translate(0, 2.62, 0));
    const wisteria = track(lostColors(new THREE.MeshStandardMaterial({ color: '#9a5ce0', roughness: 0.7 }), sat.purple, grow.purple));
    const clusterGeo = track(sphere().scale(0.12, 0.34, 0.12).translate(0, 2.25, 0));
    let arbors = 0;
    for (const [x, z, rot] of spots) {
      if (!clear(x, z, 1.35, 0.3) || distToPath(x, z) < 1.5) continue;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
      for (const sx of [-1.6, 1.6]) { const c = new THREE.Mesh(colGeo, woodMat); c.position.x = sx; c.castShadow = true; g.add(c); }
      const beam = new THREE.Mesh(beamGeo, woodMat); beam.castShadow = true; g.add(beam);
      for (const sx of [-1.2, -0.4, 0.4, 1.2]) { const r = new THREE.Mesh(rafterGeo, woodMat); r.position.x = sx; g.add(r); }
      const cl = new THREE.InstancedMesh(clusterGeo, wisteria, 16);
      for (let i = 0; i < 16; i++) { dummy.position.set(-1.6 + (i / 15) * 3.2 + (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.4); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.8 + rng() * 0.7); dummy.updateMatrix(); cl.setMatrixAt(i, dummy.matrix); cl.setColorAt(i, new THREE.Color().setHSL(0.74 + (rng() - 0.5) * 0.04, 0.55, 0.62 + rng() * 0.12)); }
      g.add(cl);
      worldGroup.add(g);
      occupied.push({ x, z, r: 1.4 });
      anchors.purple.push({ x, y: 2.2, z });
      if (++arbors >= (style.name === 'sanctuary' ? 2 : 1)) break;
    }
    counts.arbors = arbors;
  }
  // old stone columns (sanctuary)
  if (style.columns > 0) {
    const colG = track(lathe([[0, 0], [0.38, 0], [0.38, 0.18], [0.26, 0.26], [0.24, 2.4], [0.34, 2.5], [0.34, 2.7], [0, 2.7]], 20));
    let placed = 0;
    for (let attempt = 0; attempt < 200 && placed < style.columns; attempt++) {
      const x = (rng() - 0.5) * (W + 1), z = (rng() - 0.5) * (H + 1);
      if (Math.hypot(x / (W / 2), z / (H / 2)) < 0.66 || !clear(x, z, 0.45, 0.6) || distToPath(x, z) < 1.1) continue;
      const c = new THREE.Mesh(colG, stoneMat); c.position.set(x, 0, z); c.rotation.z = (rng() - 0.5) * 0.03; c.castShadow = true; c.receiveShadow = true; worldGroup.add(c);
      occupied.push({ x, z, r: 0.5 });
      placed++;
    }
    counts.columns = placed;
  }
  // benches
  if (style.benches > 0) {
    const wood = track(lostColors(new THREE.MeshStandardMaterial({ color: '#8f6a43', roughness: 0.9 }), sat.neutral));
    const benchGeo = bake([new THREE.BoxGeometry(1.6, 0.1, 0.5).translate(0, 0.5, 0), new THREE.BoxGeometry(1.6, 0.5, 0.08).translate(0, 0.85, -0.22), new THREE.BoxGeometry(0.1, 0.5, 0.45).translate(-0.7, 0.25, 0), new THREE.BoxGeometry(0.1, 0.5, 0.45).translate(0.7, 0.25, 0)]);
    let placed = 0;
    for (let attempt = 0; attempt < 200 && placed < style.benches; attempt++) {
      const x = (rng() - 0.5) * (W + 1), z = (rng() - 0.5) * (H + 1);
      if (Math.hypot(x / (W / 2), z / (H / 2)) < 0.7 || !clear(x, z, 1.0, 0.6) || distToPath(x, z) < 1.5) continue;
      const b = new THREE.Mesh(benchGeo, wood); b.position.set(x, 0, z); b.rotation.y = Math.atan2(-x, -z) + Math.PI; b.castShadow = true; worldGroup.add(b);
      occupied.push({ x, z, r: 1.0 });
      placed++;
    }
  }

  // ---- trees (varied, instanced) and bushes --------------------------------------------------------------------------
  const treeCount = Math.round(style.trees * qp.treeScale);
  const variants = [0, 1, 2, 3].map((v) => track(blobGeometry(7000 + v * 31 + world * 7, 9 + v * 2, qp.detail)));
  const canopyMat = track(lostColors(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }), sat.green, grow.green));
  const trunkGeo = track((() => {
    const parts = [new THREE.CylinderGeometry(0.1, 0.19, 1.5, 8).translate(0, 0.75, 0), new THREE.CylinderGeometry(0.04, 0.07, 0.8, 6).rotateZ(0.7).translate(0.3, 1.25, 0), new THREE.CylinderGeometry(0.04, 0.07, 0.7, 6).rotateZ(-0.8).translate(-0.28, 1.15, 0.05)];
    const g = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    return g;
  })());
  const trunkMat = track(lostColors(new THREE.MeshStandardMaterial({ color: '#6a4a2d', roughness: 1 }), sat.neutral));
  type Inst = { x: number; z: number; s: number; rot: number; v: number; tint: THREE.Color };
  const trees: Inst[] = [];
  const bushes: Inst[] = [];
  for (let attempt = 0; attempt < 500 && trees.length < treeCount; attempt++) {
    const side = Math.floor(rng() * 4);
    const along = rng();
    const s = 1.1 + rng() * 1.5;
    const out = (rng() - 0.25) * s * 0.9;
    const x = side === 0 ? -W / 2 + out - 0.2 : side === 1 ? W / 2 - out + 0.2 : (along - 0.5) * (W + 2);
    const z = side === 2 ? -H / 2 + out - 0.2 : side === 3 ? H / 2 - out + 0.2 : (along - 0.5) * (H + 2);
    if (!clear(x, z, s * 0.95, 0.9) || distToPath(x, z) < s * 0.9 + 0.5) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < (t.s + s) * 0.62)) continue;
    trees.push({ x, z, s, rot: rng() * 6.28, v: Math.floor(rng() * 4), tint: new THREE.Color(style.canopy[Math.floor(rng() * style.canopy.length)]).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.06) });
    anchors.green.push({ x, y: 1.8 * s, z });
  }
  const bushCount = Math.round(style.bushes * qp.treeScale);
  for (let attempt = 0; attempt < 500 && bushes.length < bushCount; attempt++) {
    const s = 0.35 + rng() * 0.45;
    const x = (rng() - 0.5) * (W + 1), z = (rng() - 0.5) * (H + 1);
    if (!clear(x, z, s, 1.1) || distToPath(x, z) < s + 0.9) continue;
    if (Math.hypot(x / (W / 2), z / (H / 2)) < 0.8) continue;
    bushes.push({ x, z, s, rot: rng() * 6.28, v: Math.floor(rng() * 4), tint: new THREE.Color(style.canopy[Math.floor(rng() * style.canopy.length)]).offsetHSL(0, 0, 0.04) });
    if (anchors.green.length < 40) anchors.green.push({ x, y: 0.5, z });
  }
  const placeBlobs = (items: Inst[], yScale: number, yOff: number, cast: boolean) => {
    for (let v = 0; v < 4; v++) {
      const list = items.filter((t) => t.v === v);
      if (!list.length) continue;
      const m = new THREE.InstancedMesh(variants[v], canopyMat, list.length);
      list.forEach((it, i) => {
        dummy.position.set(it.x, yOff + it.s * 0.75 * yScale, it.z);
        dummy.rotation.set(0, it.rot, 0);
        dummy.scale.set(it.s, it.s * yScale, it.s);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        m.setColorAt(i, it.tint);
      });
      m.castShadow = cast; m.receiveShadow = true;
      worldGroup.add(m);
    }
  };
  placeBlobs(trees, 1.0, 0.9, true);
  placeBlobs(bushes, 0.8, 0, true);
  if (trees.length) {
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    trees.forEach((t, i) => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.rot, 0); dummy.scale.setScalar(t.s * 0.9); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); });
    trunks.castShadow = true;
    worldGroup.add(trunks);
  }

  // ---- flowers: four families, each a color group; they grow and brighten as that color returns ----------------------
  const ring = (n: number, dist: number, sx: number, sy: number, sz: number, lift: number, tilt = 0) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const g = sphere();
      g.scale(sx, sy, sz);
      g.rotateZ(tilt);
      g.translate(dist, lift, 0);
      g.rotateY(-a);
      return g;
    });
  const stemGeo = (h: number) => track(new THREE.CylinderGeometry(0.012, 0.022, h, 5).translate(0, h / 2, 0));
  const families: { id: 'red' | 'yellow' | 'purple' | 'blue'; head: THREE.BufferGeometry; centre: THREE.BufferGeometry | null; stem: THREE.BufferGeometry; centreColor: string; tint: string[]; spread: number; scale: [number, number] }[] = [
    { id: 'red', head: bake([...ring(5, 0.07, 0.11, 0.05, 0.1, 0.55), ...ring(5, 0.035, 0.08, 0.05, 0.075, 0.6)]), centre: bake([sphere().scale(0.045, 0.04, 0.045).translate(0, 0.63, 0)]), stem: stemGeo(0.56), centreColor: '#ffcf3a', tint: ['#e63946', '#d62a3a', '#f04a56'], spread: 1.1, scale: [1.7, 2.5] },
    { id: 'yellow', head: bake(ring(12, 0.16, 0.2, 0.03, 0.065, 0.95)), centre: bake([sphere().scale(0.15, 0.05, 0.15).translate(0, 0.97, 0)]), stem: stemGeo(0.95), centreColor: '#5a3a1c', tint: ['#f7b500', '#ffc42b', '#eeaa00'], spread: 1.3, scale: [1.5, 2.2] },
    { id: 'purple', head: bake(Array.from({ length: 9 }, (_, i) => sphere().scale(0.07 - i * 0.004, 0.07, 0.07 - i * 0.004).translate(((i % 2) - 0.5) * 0.04, 0.4 + i * 0.07, ((i % 3) - 1) * 0.03))), centre: null, stem: stemGeo(0.6), centreColor: '#ffffff', tint: ['#8e44d8', '#a35ae6', '#7a34c4'], spread: 0.9, scale: [1.6, 2.4] },
    { id: 'blue', head: bake(ring(6, 0.07, 0.1, 0.04, 0.05, 0.5, 0.35)), centre: bake([sphere().scale(0.035, 0.035, 0.035).translate(0, 0.52, 0)]), stem: stemGeo(0.5), centreColor: '#ffffff', tint: ['#2f78f0', '#4a8cff', '#2563d6'], spread: 1.0, scale: [1.7, 2.4] },
  ];
  const stemMat = track(lostColors(new THREE.MeshStandardMaterial({ color: '#4f8a3a', roughness: 0.9 }), sat.green, grow.green));
  for (const fam of families) {
    const beds = Math.max(1, Math.round(style.beds[fam.id] * qp.flowers));
    const perBed = fam.id === 'yellow' ? 9 : 16;
    const items: { x: number; z: number; s: number; rot: number; c: THREE.Color }[] = [];
    for (let b = 0; b < beds; b++) {
      let placed = false;
      for (let attempt = 0; attempt < 60 && !placed; attempt++) {
        const bx = (rng() - 0.5) * (W + 1), bz = (rng() - 0.5) * (H + 1);
        const br = 0.7 + rng() * 0.7 * fam.spread;
        if (!clear(bx, bz, br, 0.55) || distToPath(bx, bz) < br + 0.75) continue;
        if (fam.id === 'blue' && fountainR > 0 && Math.hypot(bx - fountainPos.x, bz - fountainPos.z) > fountainR + 4.5 && rng() < 0.7) continue;
        placed = true;
        anchors[fam.id].push({ x: bx, y: 0.6, z: bz });
        for (let k = 0; k < perBed; k++) {
          const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * br;
          const x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d;
          if (!clear(x, z, 0.1, 0.45) || distToPath(x, z) < 0.8) continue;
          items.push({ x, z, s: lerp(fam.scale[0], fam.scale[1], rng()), rot: rng() * 6.28, c: new THREE.Color(fam.tint[Math.floor(rng() * fam.tint.length)]) });
        }
        // the bed is reserved only AFTER its own flowers are placed, so beds never overlap each other
        occupied.push({ x: bx, z: bz, r: br * 0.8 });
      }
    }
    counts[`flowers-${fam.id}`] = items.length;
    if (!items.length) continue;
    const headMat = track(lostColors(new THREE.MeshStandardMaterial({ roughness: 0.65 }), sat[fam.id], grow[fam.id]));
    const stems = new THREE.InstancedMesh(fam.stem, stemMat, items.length);
    const heads = new THREE.InstancedMesh(fam.head, headMat, items.length);
    const centres = fam.centre ? new THREE.InstancedMesh(fam.centre, track(lostColors(new THREE.MeshStandardMaterial({ color: fam.centreColor, roughness: 0.6 }), sat[fam.id], grow[fam.id])), items.length) : null;
    items.forEach((it, i) => {
      dummy.position.set(it.x, 0, it.z); dummy.rotation.set((rng() - 0.5) * 0.12, it.rot, (rng() - 0.5) * 0.12); dummy.scale.setScalar(it.s); dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix); heads.setMatrixAt(i, dummy.matrix); heads.setColorAt(i, it.c); centres?.setMatrixAt(i, dummy.matrix);
    });
    stems.castShadow = heads.castShadow = true;
    worldGroup.add(stems, heads);
    if (centres) worldGroup.add(centres);
  }

  // ---- props: lanterns (gold), sun pools (gold), crystals + glowing plants (violet / blue), arbor, benches, columns, rocks ---
  const glowMats: { m: THREE.MeshBasicMaterial; group: ColorId; k: number; pulse: number }[] = [];
  const addGlow = (x: number, z: number, size: number, color: string, group: ColorId, k: number, y = 0.1) => {
    const m = track(new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const geo = track(new THREE.PlaneGeometry(size, size)); geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); worldGroup.add(mesh);
    glowMats.push({ m, group, k, pulse: rng() * 6 });
  };
  const lanternGlass: { m: THREE.MeshStandardMaterial }[] = [];
  {
    const postGeo = track(new THREE.CylinderGeometry(0.05, 0.07, 1.55, 8).translate(0, 0.78, 0));
    const postMat = track(lostColors(new THREE.MeshStandardMaterial({ color: '#7b6a58', roughness: 0.6, metalness: 0.2 }), sat.neutral));
    const glassMat = track(lostColors(new THREE.MeshStandardMaterial({ color: '#fff2c4', roughness: 0.3, emissive: new THREE.Color('#ffc24a'), emissiveIntensity: 0 }), sat.yellow));
    lanternGlass.push({ m: glassMat });
    const glassGeo = track(new THREE.SphereGeometry(0.26, 14, 10).translate(0, 1.7, 0));
    let placed = 0;
    for (let attempt = 0; attempt < 200 && placed < style.lanterns; attempt++) {
      const x = (rng() - 0.5) * (W + 1), z = (rng() - 0.5) * (H + 1);
      if (!clear(x, z, 0.3, 0.8) || distToPath(x, z) < 1.1 || (distToPath(x, z) > 2.6 && rng() < 0.7)) continue;
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const p = new THREE.Mesh(postGeo, postMat); p.castShadow = true;
      g.add(p, new THREE.Mesh(glassGeo, glassMat));
      worldGroup.add(g);
      occupied.push({ x, z, r: 0.35 });
      anchors.yellow.push({ x, y: 1.7, z });
      addGlow(x, z, 3.2, '#ffcc66', 'yellow', 0.34, 0.08);
      placed++;
    }
    // soft pools of golden sunlight on the lawn
    for (let i = 0; i < 4; i++) {
      const x = (rng() - 0.5) * W * 0.9, z = (rng() - 0.5) * H * 0.9;
      addGlow(x, z, 5 + rng() * 3, '#ffd37a', 'yellow', 0.22, 0.05);
      anchors.yellow.push({ x, y: 0.5, z });
    }
  }
  if (style.crystals > 0) {
    const cm = track(lostColors(new THREE.MeshStandardMaterial({ color: '#c9b4f0', roughness: 0.25, metalness: 0.0, emissive: new THREE.Color('#8a4ff0'), emissiveIntensity: 0, transparent: true, opacity: 0.95 }), sat.purple));
    crystalMats.push({ m: cm, k: 1 });
    const geo = track(new THREE.OctahedronGeometry(0.3, 0)); geo.scale(0.55, 2.0, 0.55); geo.translate(0, 0.5, 0);
    let placed = 0;
    for (let attempt = 0; attempt < 200 && placed < style.crystals; attempt++) {
      const x = (rng() - 0.5) * (W + 1), z = (rng() - 0.5) * (H + 1);
      if (!clear(x, z, 0.6, 0.8) || distToPath(x, z) < 1.3) continue;
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const n = 3 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) { const m = new THREE.Mesh(geo, cm); const a = rng() * 6.28, d = k === 0 ? 0 : 0.28 + rng() * 0.16; m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); m.rotation.set((rng() - 0.5) * 0.45, rng() * 6, (rng() - 0.5) * 0.45); m.scale.setScalar(k === 0 ? 1.25 : 0.7 + rng() * 0.4); g.add(m); }
      worldGroup.add(g);
      occupied.push({ x, z, r: 0.6 });
      anchors.purple.push({ x, y: 0.9, z });
      addGlow(x, z, 2.6, '#b07cff', 'purple', 0.4, 0.08);
      placed++;
    }
  }
  const plantMats: THREE.MeshStandardMaterial[] = [];
  if (style.glowPlants > 0 && qp.flowers > 0.5) {
    // luminous bluebells: a thin stem, a glowing bell and two leaves, with a soft pool of light that returns with the blue
    const bulbMat = track(lostColors(new THREE.MeshStandardMaterial({ color: '#8fdcff', emissive: new THREE.Color('#3fb8ff'), emissiveIntensity: 0, roughness: 0.5 }), sat.blue, grow.blue));
    plantMats.push(bulbMat);
    const bulbGeo = bake([sphere().scale(0.075, 0.1, 0.075).translate(0, 0.42, 0), new THREE.CylinderGeometry(0.012, 0.02, 0.4, 5).translate(0, 0.2, 0)]);
    const leafGeo = bake([new THREE.ConeGeometry(0.05, 0.3, 4).rotateZ(1.0).translate(0.1, 0.1, 0), new THREE.ConeGeometry(0.05, 0.3, 4).rotateZ(-1.0).translate(-0.1, 0.1, 0)]);
    const leafMat = track(lostColors(new THREE.MeshStandardMaterial({ color: '#4f9a52', roughness: 0.9 }), sat.green, grow.green));
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, style.glowPlants);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, style.glowPlants);
    const poolGeo = track(new THREE.PlaneGeometry(1, 1)); poolGeo.rotateX(-Math.PI / 2);
    const poolMat = track(new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#69d4ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    glowMats.push({ m: poolMat, group: 'blue', k: 0.32, pulse: 0 });
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, style.glowPlants);
    let placed = 0;
    for (let i = 0; i < 500 && placed < style.glowPlants; i++) {
      const x = (rng() - 0.5) * W, z = (rng() - 0.5) * H;
      if (!clear(x, z, 0.2, 0.5) || distToPath(x, z) < 0.9) continue;
      const k = 1.5 + rng() * 1.1;
      dummy.position.set(x, 0, z); dummy.rotation.set(0, rng() * 6, 0); dummy.scale.setScalar(k); dummy.updateMatrix(); bulbs.setMatrixAt(placed, dummy.matrix); leaves.setMatrixAt(placed, dummy.matrix);
      dummy.position.set(x, 0.06, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1.3 + rng() * 0.9); dummy.updateMatrix(); pools.setMatrixAt(placed, dummy.matrix);
      if (placed % 3 === 0) anchors.blue.push({ x, y: 0.4, z });
      placed++;
    }
    bulbs.count = leaves.count = pools.count = placed;
    counts.glowPlants = placed;
    worldGroup.add(bulbs, leaves, pools);
  }
  // rocks and pebbles along the path
  {
    const rockGeo = track((() => { const g0 = new THREE.IcosahedronGeometry(1, 1); g0.deleteAttribute('normal'); g0.deleteAttribute('uv'); const g1 = mergeVertices(g0, 1e-4); const pos = g1.attributes.position; for (let i = 0; i < pos.count; i++) { const j = 1 + Math.sin(pos.getX(i) * 5) * Math.cos(pos.getY(i) * 4 + pos.getZ(i) * 3) * 0.14; pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j, pos.getZ(i) * j); } g1.computeVertexNormals(); return g1; })());
    const rockMat = track(lostColors(new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 }), sat.neutral));
    const n = Math.round(46 * qp.treeScale);
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, n);
    let placed = 0;
    for (let i = 0; i < n * 4 && placed < n; i++) {
      const p = pathSamples[Math.floor(rng() * pathSamples.length)];
      const side = rng() < 0.5 ? -1 : 1;
      const x = p.x + (rng() - 0.5) * 0.6, z = p.z + side * (0.9 + rng() * 0.5);
      if (!inWorld(x, z, 0.6)) continue;
      const s = 0.07 + rng() * 0.16;
      if (!clear(x, z, s, 0.4)) continue;
      dummy.position.set(x, s * 0.35, z); dummy.rotation.set(0, rng() * 6, 0); dummy.scale.set(s * 1.4, s * 0.8, s); dummy.updateMatrix();
      rocks.setMatrixAt(placed, dummy.matrix); rocks.setColorAt(placed, new THREE.Color().setHSL(0.09, 0.06, 0.42 + rng() * 0.25)); placed++;
    }
    rocks.count = placed; rocks.castShadow = true; rocks.receiveShadow = true;
    worldGroup.add(rocks);
  }

  // ---- dappled light ------------------------------------------------------------------------------------------------------
  let dappleTex: THREE.CanvasTexture | null = null;
  if (config.quality !== 'low') {
    dappleTex = cloneTex(dappleTexture(), (W + 10) / 12, (H + 10) / 12);
    const dm = track(new THREE.MeshBasicMaterial({ map: dappleTex, transparent: true, opacity: world === 2 ? 0.14 : 0.22, depthWrite: false }));
    const d = new THREE.Mesh(track(new THREE.PlaneGeometry(W + 10, H + 10)), dm);
    d.rotation.x = -Math.PI / 2; d.position.y = 0.09; worldGroup.add(d);
  }

  // ---- the color zones ----------------------------------------------------------------------------------------------------------
  const R = layout.radius;
  const discGeo = track(new THREE.CircleGeometry(R, 72)); discGeo.rotateX(-Math.PI / 2);
  const rimGeo = track(new THREE.RingGeometry(R * 0.945, R * 1.0, 96)); rimGeo.rotateX(-Math.PI / 2);
  const rimInGeo = track(new THREE.RingGeometry(R * 0.86, R * 0.945, 96)); rimInGeo.rotateX(-Math.PI / 2);
  const hcGeo = track(new THREE.RingGeometry(R * 1.0, R * 1.07, 96)); hcGeo.rotateX(-Math.PI / 2);
  const haloGeo = track(new THREE.PlaneGeometry(R * 2.9, R * 2.9)); haloGeo.rotateX(-Math.PI / 2);
  const dashGeo = track(new THREE.PlaneGeometry(R * 2.14, R * 2.14)); dashGeo.rotateX(-Math.PI / 2);
  const symGeo = track(new THREE.PlaneGeometry(R * 1.12, R * 1.12)); symGeo.rotateX(-Math.PI / 2);
  const labelGeo = track(new THREE.PlaneGeometry(R * 1.36, R * 0.425)); labelGeo.rotateX(-Math.PI / 2);
  const shadowGeo = track(new THREE.PlaneGeometry(R * 2.5, R * 2.5)); shadowGeo.rotateX(-Math.PI / 2);
  const basic = (map: THREE.Texture | null, color: string, blending: THREE.Blending = THREE.NormalBlending, side: THREE.Side = THREE.FrontSide) =>
    track(new THREE.MeshBasicMaterial({ map, color: new THREE.Color(color), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending, side }));
  const lightOf = (hex: string) => new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.45);
  interface ZoneVisual {
    group: THREE.Group;
    color: ColorId;
    pending: ColorId | null;
    swapT: number;
    amt: number; hintAmt: number; dim: number; succ: number;
    disc: THREE.Mesh; rim: THREE.Mesh; rimIn: THREE.Mesh; hc: THREE.Mesh; halo: THREE.Mesh; dash: THREE.Mesh; sym: THREE.Mesh; label: THREE.Mesh; bloom: THREE.Mesh;
    m: Record<'disc' | 'rim' | 'rimIn' | 'hc' | 'halo' | 'dash' | 'sym' | 'label' | 'bloom' | 'shadow', THREE.MeshBasicMaterial>;
  }
  const zones: ZoneVisual[] = layout.slots.map((p, i) => {
    const group = new THREE.Group();
    group.position.set(toX(p.x), ZONE_Y, toZ(p.y));
    const m = {
      shadow: track(new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#102010', transparent: true, opacity: 0.32, depthWrite: false })),
      disc: basic(zoneTexture(), '#ffffff'),
      rim: basic(null, '#ffffff'),
      rimIn: basic(null, '#ffffff'),
      hc: basic(null, '#000000'),
      halo: basic(ringTexture(), '#ffffff', THREE.AdditiveBlending),
      dash: basic(dashTexture(), '#ffffff'),
      sym: basic(null, '#ffffff'),
      label: basic(null, '#ffffff'),
      bloom: basic(glowTexture(), '#ffffff', THREE.AdditiveBlending),
    };
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, z = 0) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(0, y, z); group.add(mesh); return mesh; };
    const shadow = mk(shadowGeo, m.shadow, -0.04);
    void shadow;
    const hc = mk(hcGeo, m.hc, 0.002);
    const disc = mk(discGeo, m.disc, 0.0);
    const rimIn = mk(rimInGeo, m.rimIn, 0.006);
    const rim = mk(rimGeo, m.rim, 0.008);
    const halo = mk(haloGeo, m.halo, 0.02);
    const dash = mk(dashGeo, m.dash, 0.014);
    const sym = mk(symGeo, m.sym, 0.016, -R * 0.1);
    const label = mk(labelGeo, m.label, 0.018, R * 0.56);
    const bloom = mk(haloGeo, m.bloom, 0.03);
    bloom.visible = false;
    worldGroup.add(group);
    const c = COLOR_IDS[i % COLOR_IDS.length];
    return { group, color: c, pending: null, swapT: -1, amt: 0, hintAmt: 0, dim: 1, succ: -1, disc, rim, rimIn, hc, halo, dash, sym, label, bloom, m };
  });
  const applyColor = (z: ZoneVisual, c: ColorId) => {
    z.color = c;
    const hex = COLORS[c].hex;
    z.m.disc.color.set(hex);
    z.m.rim.color.copy(lightOf(hex));
    z.m.rimIn.color.set(COLORS[c].deep);
    z.m.halo.color.copy(lightOf(hex));
    z.m.dash.color.set('#ffffff');
    z.m.bloom.color.set(hex);
    z.m.sym.map = symbolTexture(c);
    z.m.label.map = labelTexture(c);
    z.m.sym.needsUpdate = z.m.label.needsUpdate = true;
  };
  let initialised = false;

  // ---- ripples of returning color, sparkles, ambient motes ---------------------------------------------------------------------
  const ripples = Array.from({ length: 3 }, () => {
    const m = basic(ringTexture(), '#ffffff', THREE.AdditiveBlending);
    const geo = track(new THREE.PlaneGeometry(1, 1)); geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, m); mesh.visible = false; mesh.position.y = 0.11; worldGroup.add(mesh);
    return { mesh, m, t: -1, max: 1 };
  });
  let rippleCursor = 0;
  const SP = qp.sparks;
  const sp = { pos: new Float32Array(SP * 3), alpha: new Float32Array(SP), size: new Float32Array(SP), color: new Float32Array(SP * 3), vel: new Float32Array(SP * 3), life: new Float32Array(SP).fill(-1) };
  const spGeo = track(new THREE.BufferGeometry());
  spGeo.setAttribute('position', new THREE.BufferAttribute(sp.pos, 3)); spGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sp.alpha, 1)); spGeo.setAttribute('aSize', new THREE.BufferAttribute(sp.size, 1)); spGeo.setAttribute('aColor', new THREE.BufferAttribute(sp.color, 3));
  const spMat = track(pointsMaterial());
  const sparkPoints = new THREE.Points(spGeo, spMat); sparkPoints.frustumCulled = false; worldGroup.add(sparkPoints);
  let spCursor = 0;
  const ambientN = qp.motes;
  let ambient: THREE.Points | null = null;
  const amb = { pos: new Float32Array(ambientN * 3), alpha: new Float32Array(ambientN), size: new Float32Array(ambientN), color: new Float32Array(ambientN * 3), seed: new Float32Array(ambientN * 3) };
  if (ambientN > 0) {
    const mc = new THREE.Color(style.motes);
    for (let i = 0; i < ambientN; i++) { amb.seed.set([rng() * W - W / 2, 0.4 + rng() * 2.2, rng() * H - H / 2], i * 3); amb.size[i] = style.moteSize * (0.6 + rng() * 0.8); amb.color.set([mc.r, mc.g, mc.b], i * 3); }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(amb.pos, 3)); g.setAttribute('aAlpha', new THREE.BufferAttribute(amb.alpha, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(amb.size, 1)); g.setAttribute('aColor', new THREE.BufferAttribute(amb.color, 3));
    ambient = new THREE.Points(g, track(pointsMaterial())); ambient.frustumCulled = false; worldGroup.add(ambient);
  }

  // ---- butterflies: each belongs to a color and fades from gray to its color as that color returns ------------------------------
  const butterflies: { g: THREE.Group; wings: THREE.Mesh[]; mat: THREE.MeshStandardMaterial; color: ColorId; ph: number; ax: number; az: number; sp: number; cx: number; cz: number }[] = [];
  if (qp.butterflies > 0) {
    const wingGeo = track(new THREE.PlaneGeometry(0.42, 0.42)); wingGeo.rotateX(-Math.PI / 2); wingGeo.translate(0.21, 0, 0);
    const bodyGeo = track(new THREE.CapsuleGeometry(0.025, 0.2, 3, 6)); bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = track(new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.8 }));
    for (let i = 0; i < qp.butterflies; i++) {
      const color = COLOR_IDS[(i + 3) % COLOR_IDS.length];
      const mat = track(new THREE.MeshStandardMaterial({ map: wingTexture(), color: '#aaaaaa', roughness: 0.6, side: THREE.DoubleSide, transparent: true, alphaTest: 0.2, emissive: new THREE.Color('#888888'), emissiveIntensity: 0.12 }));
      const g = new THREE.Group();
      const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
      r.scale.x = -1; l.castShadow = r.castShadow = true;
      g.add(l, r, new THREE.Mesh(bodyGeo, bodyMat)); g.scale.setScalar(0.95 + rng() * 0.5);
      worldGroup.add(g);
      butterflies.push({ g, wings: [l, r], mat, color, ph: rng() * 6, ax: 2 + rng() * 5, az: 1.2 + rng() * 2.6, sp: 0.12 + rng() * 0.12, cx: (rng() - 0.5) * W * 0.8, cz: (rng() - 0.5) * H * 0.8 });
    }
  }

  // ---- calibration grid ----------------------------------------------------------------------------------------------------------
  const grid = new THREE.Group();
  {
    const mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 }); track(mat);
    const pts: THREE.Vector3[] = [];
    const cm = config.floorWidthCm > 0 ? config.floorWidthCm / W : 0;
    const step = cm > 0 ? 50 / cm : W / 16;
    for (let x = 0; x <= W / 2 + 1e-6; x += step) for (const sx of x === 0 ? [1] : [1, -1]) pts.push(new THREE.Vector3(sx * x, 0.2, -H / 2), new THREE.Vector3(sx * x, 0.2, H / 2));
    for (let z = 0; z <= H / 2 + 1e-6; z += step) for (const sz of z === 0 ? [1] : [1, -1]) pts.push(new THREE.Vector3(-W / 2, 0.2, sz * z), new THREE.Vector3(W / 2, 0.2, sz * z));
    const u = layout.usable;
    const ux0 = toX(u.x0), ux1 = toX(u.x1), uz0 = toZ(u.y0), uz1 = toZ(u.y1);
    pts.push(new THREE.Vector3(ux0, 0.22, uz0), new THREE.Vector3(ux1, 0.22, uz0), new THREE.Vector3(ux1, 0.22, uz0), new THREE.Vector3(ux1, 0.22, uz1), new THREE.Vector3(ux1, 0.22, uz1), new THREE.Vector3(ux0, 0.22, uz1), new THREE.Vector3(ux0, 0.22, uz1), new THREE.Vector3(ux0, 0.22, uz0));
    grid.add(new THREE.LineSegments(track(new THREE.BufferGeometry().setFromPoints(pts)), mat));
    grid.visible = false;
    worldGroup.add(grid);
  }

  // ---- camera ------------------------------------------------------------------------------------------------------------------------
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

  // ---- per frame ----------------------------------------------------------------------------------------------------------------------
  let time = 0, pulseTime = 0, lastSuccess = -1, lastCue = -1, cueT = -1;
  let frames = 0, fpsStart = performance.now(), fps = 0;
  const tmpColor = new THREE.Color();
  const gray = new THREE.Color('#9a9a9a');

  function spawnSparks(c: ColorId, count: number) {
    const list = anchors[c].length ? anchors[c] : [{ x: 0, y: 0.5, z: 0 }];
    const base = new THREE.Color(COLORS[c].hex).lerp(new THREE.Color('#ffffff'), 0.35);
    for (let i = 0; i < count; i++) {
      const k = spCursor++ % SP;
      const a = list[Math.floor(rng() * list.length)];
      sp.pos.set([a.x + (rng() - 0.5) * 1.2, a.y * 0.6 + rng() * 0.4, a.z + (rng() - 0.5) * 1.2], k * 3);
      sp.vel.set([(rng() - 0.5) * 0.25, 0.35 + rng() * 0.45, (rng() - 0.5) * 0.25], k * 3);
      sp.color.set([base.r, base.g, base.b], k * 3);
      sp.life[k] = 0; sp.size[k] = 6 + rng() * 6;
    }
  }
  function startRipple(slot: number, c: ColorId) {
    const r = ripples[rippleCursor++ % ripples.length];
    const z = zones[slot];
    r.mesh.position.x = z.group.position.x; r.mesh.position.z = z.group.position.z;
    r.m.color.set(COLORS[c].hex).lerp(new THREE.Color('#ffffff'), 0.3);
    r.t = 0; r.max = Math.max(W, H) * 0.95;
    r.mesh.visible = true;
  }

  function draw(f: GardenFrame, dt: number) {
    const c = f.config;
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    if (w !== lastW || h !== lastH) { renderer.setSize(w, h, false); lastW = w; lastH = h; lastView = ''; }
    setView(c.view, w, h);
    const calm = c.reducedMotion;
    const k = c.intensity / 100;
    time += dt;
    if (!f.frozen) pulseTime += dt;
    const px = Math.min(window.devicePixelRatio || 1, qp.pr) * (h / 1080) * 1.4;
    spMat.uniforms.uScale.value = px; dropMat.uniforms.uScale.value = px;
    if (ambient) (ambient.material as THREE.ShaderMaterial).uniforms.uScale.value = px;
    grid.visible = c.grid;
    if (dappleTex) { dappleTex.offset.x = calm ? 0 : time * 0.004; dappleTex.offset.y = calm ? 0 : time * 0.0025; }

    // ---- zones: assignment, swap between rounds, highlight ------------------------------------------------------------
    const a = 1 - Math.exp(-(calm ? 22 : 6) * dt);
    if (!initialised) {
      zones.forEach((z, i) => applyColor(z, f.zones[i] ?? z.color));
      // a scene (re)built mid-stage (reload, Display opened late) shows the restored garden at once; only NEW progress animates
      for (const col of COLOR_IDS) gv[col] = f.restore[col];
      overallV = f.overall;
      initialised = true;
    }
    if (lastSuccess < 0) lastSuccess = f.success.n;
    if (f.success.n !== lastSuccess) {
      if (f.success.n > lastSuccess) {
        const z = zones[f.success.slot];
        if (z) { z.succ = 0; z.bloom.visible = true; }
        if (!calm) startRipple(f.success.slot, f.success.color);
        spawnSparks(f.success.color, calm ? 10 : 26);
        pop[f.success.color] = 1;
      }
      lastSuccess = f.success.n;
    }
    if (f.cue !== lastCue) { if (lastCue >= 0) cueT = 0; lastCue = f.cue; }
    if (cueT >= 0) { cueT += dt; if (cueT > 1.3) cueT = -1; }
    const breath = calm || f.frozen ? 1 : 0.5 + 0.5 * Math.sin(pulseTime * 2.2);
    const cueBoost = cueT >= 0 ? 0.35 * Math.sin(Math.min(1, cueT / 1.3) * Math.PI) : 0;
    zones.forEach((z, i) => {
      const want = f.zones[i] ?? z.color;
      if (want !== z.color && z.pending === null && z.swapT < 0) { z.pending = want; z.swapT = 0; }
      let swapScale = 1, swapAlpha = 1;
      if (z.swapT >= 0) {
        z.swapT += dt;
        const dur = calm ? 0.01 : 0.34;
        if (z.swapT < dur) { const e = ease(z.swapT / dur); swapScale = 1 - 0.18 * e; swapAlpha = 1 - e; }
        else {
          if (z.pending) { applyColor(z, z.pending); z.pending = null; }
          const e = ease(clamp01((z.swapT - dur) / (calm ? 0.01 : 0.4)));
          swapScale = 0.82 + 0.18 * e; swapAlpha = e;
          if (z.swapT > dur + (calm ? 0.01 : 0.4)) z.swapT = -1;
        }
      }
      const isTarget = !f.allIdle && f.target === z.color;
      const isHint = !f.allIdle && f.hint === z.color && c.assist === 'high';
      z.amt += ((isTarget ? 1 : 0) - z.amt) * a;
      z.hintAmt += ((isHint && !isTarget ? 1 : 0) - z.hintAmt) * a;
      const dimTarget = c.assist === 'high' && !f.allIdle && f.target && !isTarget && !isHint ? 0.5 : 1;
      z.dim += (dimTarget - z.dim) * a;
      const act = z.amt * (0.82 + 0.18 * breath + cueBoost) * k;
      let succGlow = 0;
      if (z.succ >= 0) {
        z.succ += dt;
        const life = calm ? 1.4 : 2.0;
        const e = clamp01(z.succ / life);
        succGlow = Math.sin(clamp01(z.succ / 0.4) * Math.PI * 0.5) * (1 - ease(clamp01((z.succ - 0.25) / (life - 0.25))));
        z.bloom.scale.setScalar(1 + e * (calm ? 0.1 : 0.55));
        z.m.bloom.opacity = (calm ? 0.4 : 0.6) * (1 - e) * (1 - e) * k;
        if (z.succ > life) { z.succ = -1; z.bloom.visible = false; }
      }
      const s = swapScale * (1 + (calm ? 0 : 0.035) * z.amt * breath + cueBoost * 0.05 + succGlow * 0.04);
      z.group.scale.set(s, 1, s);
      const hc = c.highContrast;
      const base = swapAlpha * z.dim;
      z.m.disc.opacity = Math.min(1, (hc ? 0.97 : 0.88) * base);
      z.m.rim.opacity = Math.min(1, (0.8 + 0.2 * z.amt) * base);
      z.m.rimIn.opacity = (hc ? 0.9 : 0.55) * base;
      z.m.hc.opacity = hc ? 0.95 * base : 0;
      z.m.shadow.opacity = 0.3 * swapAlpha;
      z.m.sym.opacity = c.symbols ? base : 0;
      z.m.label.opacity = c.symbols ? base : 0;
      z.m.halo.opacity = Math.min(1, act * 0.9 + z.hintAmt * 0.3) * swapAlpha;
      z.m.dash.opacity = Math.min(1, z.amt * 0.9 + z.hintAmt * 0.5 + 0.18) * base;
      z.dash.rotation.y = calm ? 0 : pulseTime * 0.25;
      z.halo.visible = z.m.halo.opacity > 0.01;
      // the target's surface brightens a little: a tint toward white, never a wash
      tmpColor.set(COLORS[z.color].hex).lerp(new THREE.Color('#ffffff'), 0.2 * z.amt * k + 0.18 * succGlow);
      z.m.disc.color.copy(tmpColor);
    });

    // ---- the lost colors return -------------------------------------------------------------------------------------------
    const rate = calm ? 5 : 1.5;
    const ra = 1 - Math.exp(-rate * dt);
    const pa = 1 - Math.exp(-2.5 * dt);
    for (const col of COLOR_IDS) {
      const target = f.allIdle ? gv[col] : f.restore[col];
      gv[col] += (target - gv[col]) * ra;
      pop[col] = Math.max(0, pop[col] - dt * 0.7);
      const g = gv[col];
      sat[col].value = lerp(0.14, 1, ease(clamp01(g)));
      grow[col].value = lerp(0.58, 1, ease(clamp01(g))) + (calm ? 0 : 0.07 * Math.sin(Math.min(1, pop[col]) * Math.PI) * (pop[col] > 0 ? 1 : 0));
    }
    void pa;
    overallV += ((f.allIdle ? overallV : f.overall) - overallV) * ra;
    sat.neutral.value = lerp(0.5, 1, ease(clamp01(overallV)));
    // sunlight warms as the garden returns
    sun.color.copy(sunCool).lerp(sunWarm, ease(clamp01(overallV * 0.7 + gv.yellow * 0.3)));
    sun.intensity = style.sunIntensity * lerp(0.82, 1, ease(clamp01(overallV)));
    hemi.intensity = style.hemiIntensity * lerp(0.95, 1, ease(clamp01(overallV)));

    // blue: water starts to flow, the fountain wakes and its jets rise
    waterU.uTime.value = time;
    waterU.uFlow.value = (calm ? 0.05 : 0.12) + (calm ? 0.2 : 0.9) * ease(clamp01(gv.blue));
    const jetK = ease(clamp01((gv.blue - 0.05) / 0.95));
    for (let i = 0; i < drops; i++) {
      const dm = dropMeta[i];
      const jet = jets[dm.jet];
      if (!jet) { dropArr.alpha[i] = 0; continue; }
      const t = calm ? (dm.ph * 0.9 + 0.05) : (time * dm.sp + dm.ph) % 1;
      const hgt = jet.h * jetK * 4 * t * (1 - t) * (jet.count ? 1.6 : 1);
      const rad = jet.spread * jetK * t * (jet.count ? 0.8 : 1.6);
      dropArr.pos[i * 3] = jet.x + Math.cos(dm.a) * rad;
      dropArr.pos[i * 3 + 1] = 0.5 + (jet.count ? 0.9 : 0.35) + hgt;
      dropArr.pos[i * 3 + 2] = jet.z + Math.sin(dm.a) * rad;
      dropArr.alpha[i] = 0.9 * jetK * Math.sin(t * Math.PI) * k;
    }
    if (jets.length && drops > 0) { dropGeo.attributes.position.needsUpdate = true; dropGeo.attributes.aAlpha.needsUpdate = true; }

    // gold + violet: lanterns light up, sun pools and crystals glow
    for (const l of lanternGlass) l.m.emissiveIntensity = 1.5 * ease(clamp01(gv.yellow)) * k;
    for (const cm of crystalMats) cm.m.emissiveIntensity = 1.1 * ease(clamp01(gv.purple)) * cm.k * k;
    for (const pm of plantMats) pm.emissiveIntensity = (calm ? 1.0 : 0.85 + 0.25 * Math.sin(time * 0.8)) * ease(clamp01(gv.blue)) * k;
    for (const gm of glowMats) {
      const base = ease(clamp01(gv[gm.group]));
      gm.m.opacity = gm.k * base * k * (calm ? 1 : 0.88 + 0.12 * Math.sin(time * 0.9 + gm.pulse));
    }

    // ripple of returning color
    for (const r of ripples) {
      if (r.t < 0) continue;
      r.t += dt;
      const life = 2.6;
      const e = clamp01(r.t / life);
      r.mesh.scale.setScalar(Math.max(0.01, e * r.max));
      r.m.opacity = 0.55 * (1 - e) * (1 - e) * k;
      if (r.t > life) { r.t = -1; r.mesh.visible = false; }
    }
    // sparkles
    let any = false;
    for (let p = 0; p < SP; p++) {
      if (sp.life[p] < 0) { sp.alpha[p] = 0; continue; }
      sp.life[p] += dt;
      const L = sp.life[p];
      if (L > 2.2) { sp.life[p] = -1; sp.alpha[p] = 0; continue; }
      sp.pos[p * 3] += sp.vel[p * 3] * dt; sp.pos[p * 3 + 1] += sp.vel[p * 3 + 1] * dt; sp.pos[p * 3 + 2] += sp.vel[p * 3 + 2] * dt;
      sp.alpha[p] = (1 - L / 2.2) * Math.min(1, L * 3) * 0.8 * k;
      any = true;
    }
    sparkPoints.visible = any;
    if (any) { spGeo.attributes.position.needsUpdate = true; spGeo.attributes.aAlpha.needsUpdate = true; spGeo.attributes.aSize.needsUpdate = true; spGeo.attributes.aColor.needsUpdate = true; }

    // ambient motes drift slowly (and hold still in reduced-motion mode)
    if (ambient) {
      for (let i = 0; i < ambientN; i++) {
        const sx = amb.seed[i * 3], sy = amb.seed[i * 3 + 1], sz = amb.seed[i * 3 + 2];
        const t = calm ? 0 : time;
        amb.pos[i * 3] = sx + Math.sin(t * 0.21 + i) * 0.6; amb.pos[i * 3 + 1] = sy + Math.sin(t * 0.33 + i * 1.7) * 0.25; amb.pos[i * 3 + 2] = sz + Math.cos(t * 0.17 + i * 0.7) * 0.5;
        amb.alpha[i] = (world === 2 ? 0.45 + 0.45 * Math.sin(t * 0.9 + i * 2.3) ** 2 : 0.5) * k * (calm ? 0.6 : 1) * (0.35 + 0.65 * overallV);
      }
      ambient.geometry.attributes.position.needsUpdate = true; ambient.geometry.attributes.aAlpha.needsUpdate = true;
    }

    // butterflies: lazy loops; gray until their own color returns
    butterflies.forEach((b) => {
      const t = calm ? b.ph : time * b.sp + b.ph;
      b.g.position.set(b.cx + Math.sin(t * 1.3) * b.ax, 1.3 + Math.sin(t * 2.1) * 0.25, b.cz + Math.sin(t * 0.9 + 1) * b.az);
      b.g.rotation.y = calm ? 0.5 : Math.atan2(Math.cos(t * 1.3) * b.ax * 1.3, Math.cos(t * 0.9 + 1) * b.az * 0.9) - Math.PI / 2;
      const flap = calm ? 0.35 : 0.2 + Math.abs(Math.sin(time * 5.2 + b.ph)) * 0.9;
      b.wings[0].rotation.z = flap; b.wings[1].rotation.z = -flap;
      tmpColor.copy(gray).lerp(new THREE.Color(COLORS[b.color].hex), ease(clamp01(gv[b.color])));
      b.mat.color.copy(tmpColor);
      b.mat.emissive.copy(tmpColor);
    });

    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - fpsStart >= 1000) { fps = (frames * 1000) / (now - fpsStart); frames = 0; fpsStart = now; }
  }

  function stats() {
    const i = renderer.info;
    return {
      fps: Math.round(fps * 10) / 10, calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures,
      zones: layout.slots.length, world, quality: config.quality, view: camera === ortho ? 'floor' : 'cinematic',
      decor: { trees: trees.length, bushes: bushes.length, ...counts, fountain: Math.round(fountainR * 10) / 10 }, restored: Object.fromEntries(COLOR_IDS.map((c) => [c, Math.round(gv[c] * 100) / 100])), saturation: Object.fromEntries(COLOR_IDS.map((c) => [c, Math.round(sat[c].value * 100) / 100])),
    };
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
