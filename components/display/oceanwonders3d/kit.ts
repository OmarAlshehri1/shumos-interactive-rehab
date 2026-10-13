import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Seeded RNG (mulberry32): every Display and every reload builds the identical reef. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = () => number;

/** Uniforms written once per frame by the scene and read by every material. */
export const U = { time: { value: 0 }, caus: { value: 1 } };

const CAUSTIC = /* glsl */ `
float caust(vec2 uv, float t){
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 3; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 3.0; c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}`;

export interface MatOpts {
  rough?: number; metal?: number; emissive?: string; ei?: number; flat?: boolean; transparent?: boolean; opacity?: number;
  side?: THREE.Side; map?: THREE.Texture | null; alphaTest?: number;
  /** vertex sway amplitude (needs the `aSway` attribute; see paint()) */
  sway?: number;
  /** body-bend swimmer material */
  bend?: { amp: number; freq: number; k: number; axis: 'x' | 'y'; phase?: number };
  caustics?: number;
  /** glow group: the scene can scale its emissive intensity ("the palace illuminates") */
  glow?: string;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();
const own: THREE.MeshStandardMaterial[] = [];
const glowMats = new Map<string, { m: THREE.MeshStandardMaterial; base: number }[]>();

function hook(m: THREE.MeshStandardMaterial, o: MatOpts) {
  const sway = o.sway ?? 0;
  const bend = o.bend;
  const caus = o.caustics ?? 1;
  m.customProgramCacheKey = () => `ow-${sway > 0 ? 's' : ''}${bend ? 'b' + bend.axis : ''}`;
  m.onBeforeCompile = (s) => {
    s.uniforms.uT = U.time;
    s.uniforms.uCaus = U.caus;
    s.uniforms.uK = { value: caus };
    s.uniforms.uSwayAmp = { value: sway };
    s.uniforms.uBendAmp = { value: bend?.amp ?? 0 };
    s.uniforms.uBendFreq = { value: bend?.freq ?? 1 };
    s.uniforms.uBendK = { value: bend?.k ?? 1 };
    s.uniforms.uPhase = { value: bend?.phase ?? 0 };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aSway;
        attribute float aPhaseI;
        uniform float uT; uniform float uSwayAmp; uniform float uBendAmp; uniform float uBendFreq; uniform float uBendK; uniform float uPhase;
        varying vec3 vWP;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${sway > 0 ? `{
          #ifdef USE_INSTANCING
          vec4 swp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          #else
          vec4 swp = modelMatrix * vec4(transformed, 1.0);
          #endif
          float ph = swp.x * 0.21 + swp.z * 0.17;
          float k = aSway * aSway;
          transformed.x += (sin(uT * 1.1 + ph) * 0.6 + sin(uT * 2.3 + ph * 1.7) * 0.22) * k * uSwayAmp;
          transformed.z += cos(uT * 0.9 + ph * 1.3) * 0.42 * k * uSwayAmp;
        }` : ''}
        ${bend ? `{
          float w = aSway;
          float b = sin(uT * uBendFreq + transformed.z * uBendK + uPhase + aPhaseI * 6.2831) * uBendAmp * (0.12 + w * w * 0.88);
          ${bend.axis === 'y' ? 'transformed.y += b;' : 'transformed.x += b;'}
        }` : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          #ifdef USE_INSTANCING
          vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          #else
          vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
          #endif
        }`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uT; uniform float uCaus; uniform float uK; varying vec3 vWP;
        ${CAUSTIC}`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 wn = inverseTransformDirection(normal, viewMatrix);
          float up = clamp(wn.y * 0.5 + 0.5, 0.0, 1.0);
          float fall = clamp(1.2 - vWP.y * 0.026, 0.0, 1.0) * (1.0 - smoothstep(110.0, 190.0, length(vViewPosition)));
          float cz = fall > 0.01 && up > 0.3 ? caust(vWP.xz * 0.055, uT * 0.45) : 0.0;
          outgoingLight += diffuseColor.rgb * cz * uCaus * uK * up * up * fall * 0.95;
        }
        #include <opaque_fragment>`);
  };
}

export function mat(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const cacheable = !o.bend;
  const key = cacheable ? JSON.stringify([color, { ...o, map: o.map?.uuid ?? null }]) : '';
  let m = cacheable ? cache.get(key) : undefined;
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0.02, flatShading: o.flat ?? false, vertexColors: true,
    transparent: o.transparent ?? false, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, map: o.map ?? null, alphaTest: o.alphaTest ?? 0,
  });
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
  if (o.glow) { const l = glowMats.get(o.glow) ?? []; l.push({ m, base: o.ei ?? 1 }); glowMats.set(o.glow, l); }
  hook(m, o);
  if (cacheable) cache.set(key, m); else own.push(m);
  return m;
}
/** Scales the emissive intensity of every material registered in a glow group. */
export function setGlow(group: string, k: number) {
  glowMats.get(group)?.forEach((e) => { e.m.emissiveIntensity = e.base * k; });
}
export function disposeKit() {
  cache.forEach((m) => { m.map?.dispose(); m.dispose(); });
  own.forEach((m) => m.dispose());
  cache.clear(); own.length = 0; glowMats.clear();
}

// ------------------------------------------------------------------ geometry helpers ------------------------------
export const col = (c: THREE.ColorRepresentation) => new THREE.Color(c);
const tmpC = new THREE.Color();
/** hex lerp helper returning a fresh Color */
export const mix = (a: string, b: string, t: number) => tmpC.set(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))).clone();

type ColorFn = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => THREE.Color;
/** Writes the vertex colours and the sway weight every material expects. `sway` (0..1) is usually a function of height. */
export function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn, sway: number | ((x: number, y: number, z: number) => number) = 0): THREE.BufferGeometry {
  const pos = g.attributes.position;
  if (!g.attributes.normal) g.computeVertexNormals();
  const nor = g.attributes.normal;
  const cols = new Float32Array(pos.count * 3);
  const sw = new Float32Array(pos.count);
  const flat = typeof color === 'function' ? null : new THREE.Color(color);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const c = flat ?? (color as ColorFn)(x, y, z, nor.getX(i), nor.getY(i), nor.getZ(i));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    sw[i] = typeof sway === 'function' ? Math.max(0, Math.min(1, sway(x, y, z))) : sway;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  return g;
}
export function xf(g: THREE.BufferGeometry, p: [number, number, number] = [0, 0, 0], r: [number, number, number] = [0, 0, 0], s: number | [number, number, number] = 1): THREE.BufferGeometry {
  const sc = typeof s === 'number' ? [s, s, s] : s;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...sc));
  g.applyMatrix4(m);
  return g;
}
/** Merges painted geometries into one (non-indexed). `uv` is kept only when a texture needs it. */
export function merge(list: THREE.BufferGeometry[], keepUv = false): THREE.BufferGeometry {
  const prepared = list.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'color', 'aSway'].concat(keepUv ? ['uv'] : []).includes(k)) ng.deleteAttribute(k);
    if (keepUv && !ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
    ng.clearGroups();
    return ng;
  });
  const out = mergeGeometries(prepared, false) ?? new THREE.BufferGeometry();
  list.forEach((g) => g.dispose());
  prepared.forEach((g) => g.dispose());
  return out;
}
export function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
}
/** Smooth value noise for terrain and displacement (deterministic, no dependencies). */
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export function noise2(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function fbm(x: number, y: number, o = 4): number {
  let v = 0, a = 0.5;
  for (let i = 0; i < o; i++) { v += a * noise2(x, y); x = x * 2.03 + 11.3; y = y * 2.03 - 7.1; a *= 0.5; }
  return v;
}
export function noise3(x: number, y: number, z: number): number { return (noise2(x + z * 0.7, y - z * 0.3) + noise2(y * 1.3 + 5.2, z * 1.1 - x * 0.4)) * 0.5; }

// ------------------------------------------------------------------ growth animation ------------------------------
export type PartKind = 'grow' | 'rise' | 'pop' | 'none';
interface PartInfo { obj: THREE.Object3D; a: number; b: number; kind: PartKind; s0: THREE.Vector3; live: boolean }
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
const easeBack = (u: number) => { const c = 1.5; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };

/**
 * One milestone of the ocean. `t` runs 0..1 and is moved towards `target` by the scene at a bounded speed. Parts appear
 * by growing out of the seabed (origin at the base), rising, or popping in. A finished build merges its static parts into
 * a few meshes (cheap to draw); `live` parts (swimming animals) stay separate and are driven by a Live.
 */
export class Build {
  readonly group = new THREE.Group();
  readonly anchor = new THREE.Vector3();
  private parts: PartInfo[] = [];
  private baked: THREE.Group | null = null;
  t = 0;
  target = 0;
  constructor(public readonly id: string, x: number, y: number, z: number, public readonly dur = 2.8) {
    this.anchor.set(x, y, z);
    this.group.name = id;
    this.group.visible = false;
  }
  add<T extends THREE.Object3D>(obj: T, a = 0, b = 1, kind: PartKind = 'grow', live = false): T {
    this.group.add(obj);
    this.parts.push({ obj, a, b, kind, s0: obj.scale.clone(), live });
    return obj;
  }
  apply(t: number) {
    this.t = t;
    this.group.visible = t > 0.001;
    if (this.baked) {
      this.baked.visible = t >= 1;
      for (const p of this.parts) if (!p.live) p.obj.visible = t < 1 && t > p.a;
    }
    for (const p of this.parts) {
      if (this.baked && t >= 1) { if (p.live) { p.obj.visible = true; p.obj.scale.copy(p.s0); } continue; }
      const u = Math.max(0, Math.min(1, (t - p.a) / Math.max(1e-4, p.b - p.a)));
      p.obj.visible = u > 0;
      if (u <= 0) continue;
      const o = p.obj;
      if (p.kind === 'rise') o.scale.set(p.s0.x, Math.max(0.001, p.s0.y * easeOut(u)), p.s0.z);
      else if (p.kind === 'grow') o.scale.copy(p.s0).multiplyScalar(Math.max(0.001, easeOut(u)));
      else if (p.kind === 'pop') o.scale.copy(p.s0).multiplyScalar(Math.max(0.001, easeBack(u)));
    }
  }
  bake() {
    if (this.baked) return;
    this.apply(1);
    this.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of this.parts) {
      if (p.live) continue;
      p.obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
        const material = m.material as THREE.MeshStandardMaterial;
        const g = m.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        const ng = g.index ? g.toNonIndexed() : g;
        const keep = ['position', 'normal', 'color', 'aSway'].concat(material.map ? ['uv'] : []);
        for (const k of Object.keys(ng.attributes)) if (!keep.includes(k)) ng.deleteAttribute(k);
        const n = ng.attributes.position.count;
        if (!ng.attributes.color) ng.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
        if (!ng.attributes.aSway) ng.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(n), 1));
        if (material.map && !ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
        ng.clearGroups();
        const list = byMat.get(material) ?? [];
        list.push(ng);
        byMat.set(material, list);
      });
    }
    const out = new THREE.Group();
    for (const [material, list] of byMat) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh2 = new THREE.Mesh(merged, material);
      mesh2.castShadow = true; mesh2.receiveShadow = true;
      out.add(mesh2);
    }
    this.group.add(out);
    this.baked = out;
    for (const p of this.parts) if (!p.live) p.obj.visible = false;
  }
  get isBaked() { return !!this.baked; }
  dispose() {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry?.dispose(); });
  }
}

export interface Live { update(dt: number, time: number): void }
export interface Made { build: Build; live?: Live; /** world points where gentle bubbles rise forever once built */ vents?: THREE.Vector3[] }
