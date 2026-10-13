import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundY } from './terrain';

/** Seeded RNG (mulberry32) so every build is identical on every Display and every reload. */
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

/** Shared uniforms: time for swaying leaves, night for window glow. Written once per frame by the scene. */
export const shared = { time: { value: 0 }, night: { value: 0 } };

const cache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, o: { rough?: number; metal?: number; emissive?: string; ei?: number; flat?: boolean; transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const key = JSON.stringify([color, o]);
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.78, metalness: o.metal ?? 0.02, flatShading: o.flat ?? false, transparent: o.transparent ?? false, opacity: o.opacity ?? 1 });
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
    cache.set(key, m);
  }
  return m;
}
export function disposeKit() {
  cache.forEach((m) => m.dispose());
  cache.clear();
  leafMat?.dispose(); leafMat = null;
  facadeCache.forEach((m) => { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); });
  facadeCache.clear();
}

/** Window cell: 2x2 windows on a plain wall, plus a matching emissive map. Corner (0,0) is plain wall (used for roofs / bottoms). */
function cellTextures(variant: number): { map: THREE.CanvasTexture; em: THREE.CanvasTexture } {
  const S = 128;
  const mk = (emissive: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    g.fillStyle = emissive ? '#000' : '#ffffff';
    g.fillRect(0, 0, S, S);
    const r = rng(variant * 91 + 7);
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) {
        const x = i * 64 + 14, y = j * 64 + 14, w = 36, h = 38;
        const lit = r() > 0.35;
        if (emissive) {
          if (lit) { g.fillStyle = r() > 0.5 ? '#ffd88a' : '#ffe9b8'; g.fillRect(x, y, w, h); }
        } else {
          g.fillStyle = '#5c7a98';
          g.fillRect(x - 3, y - 3, w + 6, h + 6);
          const gr = g.createLinearGradient(x, y, x + w, y + h);
          gr.addColorStop(0, '#a9d4ee'); gr.addColorStop(1, '#4f7ea6');
          g.fillStyle = gr; g.fillRect(x, y, w, h);
          g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 3, y + 3, 8, h - 6);
          g.fillStyle = '#e8eef3'; g.fillRect(x - 3, y + h + 1, w + 6, 4);
        }
      }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = emissive ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: mk(false), em: mk(true) };
}
const facadeCache = new Map<string, THREE.MeshStandardMaterial>();
const cellVariants: ReturnType<typeof cellTextures>[] = [];
export function facadeMat(color: string, variant = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${variant % 3}`;
  let m = facadeCache.get(key);
  if (!m) {
    cellVariants[variant % 3] ??= cellTextures(variant % 3);
    const t = cellVariants[variant % 3];
    m = new THREE.MeshStandardMaterial({ color, map: t.map, roughness: 0.7, metalness: 0.05, emissive: new THREE.Color('#ffffff'), emissiveMap: t.em, emissiveIntensity: 1 });
    // glow follows the shared night value without touching each material per frame
    m.onBeforeCompile = (s) => {
      s.uniforms.uNight = shared.night;
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= uNight * 1.35;');
    };
    facadeCache.set(key, m);
  }
  return m;
}

let leafMat: THREE.MeshStandardMaterial | null = null;
export function leaf(color: string): THREE.MeshStandardMaterial {
  const key = 'leaf' + color;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
    m.onBeforeCompile = (s) => {
      s.uniforms.uT = shared.time;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        #endif
        float ph = wp.x * 0.35 + wp.z * 0.27;
        transformed.x += sin(uT * 1.7 + ph) * 0.07 * (0.4 + 0.6 * fract(sin(ph * 12.9) * 43758.5));
        transformed.z += cos(uT * 1.4 + ph * 1.3) * 0.05;`);
    };
    cache.set(key, m);
  }
  return m;
}

// ------------------------- primitives: all have their ORIGIN AT THE BASE so scale-from-ground animates naturally ----
function base<T extends THREE.BufferGeometry>(g: T, h: number): T {
  g.translate(0, h / 2, 0);
  return g;
}
function place(m: THREE.Mesh, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, ry = 0) => place(new THREE.Mesh(base(new THREE.BoxGeometry(w, h, d), h), m), x, y, z, ry);
export const cyl = (rt: number, rb: number, h: number, seg: number, m: THREE.Material, x = 0, y = 0, z = 0) => place(new THREE.Mesh(base(new THREE.CylinderGeometry(rt, rb, h, seg), h), m), x, y, z);
export const cone = (r: number, h: number, seg: number, m: THREE.Material, x = 0, y = 0, z = 0, ry = 0) => place(new THREE.Mesh(base(new THREE.ConeGeometry(r, h, seg), h), m), x, y, z, ry);
export const ball = (r: number, m: THREE.Material, x = 0, y = 0, z = 0, detail = 1) => {
  const g = new THREE.IcosahedronGeometry(r, detail);
  return place(new THREE.Mesh(g, m), x, y + r, z);
};
/** Gabled roof: ridge along X. Origin at the eaves line, base centre. */
export function gable(w: number, d: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, ry = 0, over = 0.35) {
  const hw = w / 2 + over, hd = d / 2 + over;
  const pts = [-hw, 0, hw, 0, 0, h];
  const sh = new THREE.Shape(); sh.moveTo(pts[0], pts[1]); sh.lineTo(pts[2], pts[3]); sh.lineTo(pts[4], pts[5]); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: hd * 2, bevelEnabled: false });
  g.translate(0, 0, -hd);
  return place(new THREE.Mesh(g, m), x, y, z, ry);
}
/** Hip/pyramid roof with a square footprint. */
export const pyramid = (w: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, ry = 0) => {
  const g = new THREE.ConeGeometry(w * 0.72, h, 4);
  g.rotateY(Math.PI / 4);
  return place(new THREE.Mesh(base(g, h), m), x, y, z, ry);
};

/** Windowed box (facade). Side faces repeat the window cell, top/bottom use the plain-wall corner of the cell. */
export function facade(w: number, h: number, d: number, color: string, variant: number, x = 0, y = 0, z = 0, ry = 0) {
  const g = base(new THREE.BoxGeometry(w, h, d), h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const cols = (L: number) => Math.max(1, Math.round(L / 4.4));
  const rows = Math.max(1, Math.round(h / 4));
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const rep = [cols(d), cols(d), 0, 0, cols(w), cols(w)];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (rep[f] === 0) uv.setXY(i, 0.02 + uv.getX(i) * 0.02, 0.02 + uv.getY(i) * 0.02);
      else uv.setXY(i, uv.getX(i) * rep[f], uv.getY(i) * rows);
    }
  return place(new THREE.Mesh(g, facadeMat(color, variant)), x, y, z, ry);
}

// ------------------------------------------------------------------ a milestone under construction -------------------
export type PartKind = 'rise' | 'grow' | 'pop' | 'drop' | 'fade' | 'none';
interface PartInfo { obj: THREE.Object3D; a: number; b: number; kind: PartKind; y0: number; s0: THREE.Vector3; live: boolean }

const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
const easeBack = (u: number) => { const c = 1.7; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };

export class Build {
  readonly group = new THREE.Group();
  readonly anchor = new THREE.Vector3();
  /** Called when t crosses certain thresholds (roads clip, lights, etc). */
  readonly hooks: ((t: number) => void)[] = [];
  private parts: PartInfo[] = [];
  private baked: THREE.Group | null = null;
  t = 0;
  /** What the world wants (0..1). The scene moves `t` towards it at a bounded speed. */
  target = 0;
  constructor(public readonly id: string, x: number, z: number, public readonly dur = 2.4) {
    this.anchor.set(x, groundY(x, z), z);
    this.group.name = id;
    this.group.visible = false;
  }
  /** Adds an object that appears while t is in [a,b]. `live` objects (animated by life systems) are never merged away. */
  add<T extends THREE.Object3D>(obj: T, a = 0, b = 1, kind: PartKind = 'rise', live = false): T {
    this.group.add(obj);
    this.parts.push({ obj, a, b, kind, y0: obj.position.y, s0: obj.scale.clone(), live });
    return obj;
  }
  addAll(objs: THREE.Object3D[], a: number, b: number, kind: PartKind = 'rise', stagger = 0) {
    objs.forEach((o, i) => this.add(o, a + stagger * i, Math.min(1, b + stagger * i), kind));
  }
  apply(t: number) {
    this.t = t;
    this.group.visible = t > 0.001;
    if (this.baked) { this.baked.visible = t >= 1; for (const p of this.parts) if (!p.live) p.obj.visible = t < 1 && t > p.a; }
    if (t >= 1 && !this.baked) { /* baking is scheduled by the scene when idle */ }
    for (const p of this.parts) {
      if (this.baked && t >= 1) { if (p.live) { p.obj.visible = true; p.obj.scale.copy(p.s0); p.obj.position.y = p.y0; } continue; }
      const u = Math.max(0, Math.min(1, (t - p.a) / Math.max(1e-4, p.b - p.a)));
      p.obj.visible = u > 0;
      if (u <= 0) continue;
      const o = p.obj;
      switch (p.kind) {
        case 'rise': o.scale.set(p.s0.x, Math.max(0.001, p.s0.y * easeOut(u)), p.s0.z); break;
        case 'grow': o.scale.copy(p.s0).multiplyScalar(Math.max(0.001, easeOut(u))); break;
        case 'pop': o.scale.copy(p.s0).multiplyScalar(Math.max(0.001, easeBack(u))); break;
        case 'drop': o.position.y = p.y0 + (1 - easeOut(u)) * 9; break;
        case 'fade': break;
        case 'none': break;
      }
    }
    for (const h of this.hooks) h(t);
  }
  /** Merges every non-live part into one mesh per material: a finished building costs a few draw calls. */
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
        const g = m.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        const ng = g.index ? g.toNonIndexed() : g;
        for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
        if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((ng.attributes.position.count) * 2), 2));
        ng.clearGroups();
        const list = byMat.get(m.material) ?? [];
        list.push(ng);
        byMat.set(m.material, list);
      });
    }
    const out = new THREE.Group();
    for (const [material, list] of byMat) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      out.add(mesh);
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

/** Convenience: a tree. Crown colours vary by seed; origin at the base. */
export function tree(r: () => number, kind: 'round' | 'pine' | 'poplar' | 'blossom' = 'round', scale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunk = mat('#7a5638', { rough: 0.9, flat: true });
  const greens = ['#4da83a', '#5cb844', '#3f9a3a', '#6bc24a'];
  const col = kind === 'blossom' ? ['#f6a8c4', '#f4b6cc', '#ffd0a0'][Math.floor(r() * 3)] : kind === 'pine' ? ['#2f7a45', '#3a8a4e'][Math.floor(r() * 2)] : greens[Math.floor(r() * greens.length)];
  const lm = leaf(col);
  if (kind === 'pine') {
    g.add(cyl(0.18, 0.26, 1.4, 6, trunk));
    for (let i = 0; i < 4; i++) g.add(cone(1.5 - i * 0.28, 1.9 - i * 0.1, 7, lm, 0, 0.9 + i * 1.0, 0, r() * 3));
  } else if (kind === 'poplar') {
    g.add(cyl(0.15, 0.22, 1.2, 6, trunk));
    const c = ball(0.9, lm, 0, 1.0); c.scale.set(0.8, 2.0, 0.8); g.add(c);
  } else {
    const h = 1.5 + r() * 0.6;
    g.add(cyl(0.2, 0.3, h, 6, trunk));
    const c1 = ball(1.5 + r() * 0.3, lm, 0, h - 0.3); c1.scale.y = 0.85; g.add(c1);
    const c2 = ball(1.0, lm, 0.8, h + 0.1); g.add(c2);
    const c3 = ball(0.9, lm, -0.7, h + 0.3, 0.3); g.add(c3);
  }
  g.scale.setScalar(scale * (0.85 + r() * 0.35));
  g.rotation.y = r() * 6.28;
  return g;
}
export function bush(r: () => number, color = '#4a9a38'): THREE.Group {
  const g = new THREE.Group();
  const lm = leaf(color);
  g.add(ball(0.7, lm, 0, 0)); g.add(ball(0.5, lm, 0.55, 0, 0.1)); g.add(ball(0.45, lm, -0.5, 0, -0.2));
  g.scale.setScalar(0.8 + r() * 0.5);
  return g;
}
export function flowers(r: () => number, n: number, spread: number, colors = ['#ff7aa8', '#ffd54a', '#ffffff', '#c78bff', '#ff9a4a']): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
    const s = cyl(0.03, 0.03, 0.35, 4, mat('#3f8a3a'), Math.cos(a) * d, 0, Math.sin(a) * d);
    s.castShadow = false;
    g.add(s);
    const f = ball(0.13, mat(colors[Math.floor(r() * colors.length)], { rough: 0.6 }), Math.cos(a) * d, 0.3, Math.sin(a) * d, 0);
    f.castShadow = false;
    g.add(f);
  }
  return g;
}
export const onGround = (o: THREE.Object3D, x: number, z: number, lift = 0) => { o.position.set(x, groundY(x, z) + lift, z); return o; };

/** Windowed cylinder (round towers). */
export function facadeCyl(r: number, h: number, seg: number, color: string, variant: number, x = 0, y = 0, z = 0) {
  const g = base(new THREE.CylinderGeometry(r, r, h, seg), h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const cols = Math.max(2, Math.round((Math.PI * 2 * r) / 4.4));
  const rows = Math.max(1, Math.round(h / 4));
  const side = seg * 2 + 2; // vertices of the side surface: (seg+1) * 2
  for (let i = 0; i < uv.count; i++) {
    if (i < side) uv.setXY(i, uv.getX(i) * cols, uv.getY(i) * rows);
    else uv.setXY(i, 0.02, 0.02);
  }
  return place(new THREE.Mesh(g, facadeMat(color, variant)), x, y, z);
}

/** A cylinder from point a to point b (cables, rails). Origin at a so a 'rise' part grows along its own axis. */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, seg = 5) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.translate(0, len / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  mesh.castShadow = true;
  return mesh;
}
