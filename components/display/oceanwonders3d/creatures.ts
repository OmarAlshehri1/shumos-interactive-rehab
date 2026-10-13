import * as THREE from 'three';
import { M } from './flora';
import { mat, merge, mix, noise2, paint, rng, xf, type Live } from './kit';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const sm = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
const C = (h: string) => new THREE.Color(h);

/** Tube along Z (head at +Z, tail at -Z) with a per-ring elliptical profile. Origin at the centre of the body. */
function tube(len: number, rings: number, seg: number, prof: (s: number) => [number, number, number]): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const s = i / rings, [rx, ry, cy] = prof(s), z = len * (0.5 - s);
    for (let j = 0; j < seg; j++) { const a = (j / seg) * Math.PI * 2; pos.push(rx * Math.cos(a), cy + ry * Math.sin(a), z); }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Flat fin from an (x = towards the tail, y = up) outline, lying in the YZ plane. */
function fin(pts: [number, number][], col: (x: number, y: number) => THREE.Color): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const g = new THREE.ShapeGeometry(sh, 4);
  g.rotateY(Math.PI / 2); // (x,y,0) -> (0,y,-x)
  g.computeVertexNormals();
  return paint(g, (_x, y, z) => col(-z, y), (_x, _y, z) => clamp01(0.5 - z));
}
const sway = (_x: number, _y: number, z: number) => clamp01(0.5 - z);

// ------------------------------------------------------------------------------------------------------- tropical fish
export interface Species { id: string; H: number; T: number; tailH: number; dH: number; body: (s: number, v: number) => THREE.Color; fin: string; finTip?: string; glow?: string }
const band = (s: number, c: number, w: number, edge = 0.022) => { const d = Math.abs(s - c); return d < w / 2 ? 2 : d < w / 2 + edge ? 1 : 0; };
export const SPECIES: Species[] = [
  { id: 'clown', H: 0.21, T: 0.5, tailH: 0.13, dH: 0.12, fin: '#ff7418', finTip: '#1a1010', body: (s, v) => {
    const b = Math.max(band(s, 0.24, 0.1) , band(s, 0.55, 0.08), band(s, 0.82, 0.05));
    const c = b === 2 ? C('#fff7ef') : b === 1 ? C('#1a1010') : C('#ff7418');
    return v < -0.45 && b === 0 ? c.lerp(C('#ffb067'), 0.4) : c;
  } },
  { id: 'tang', H: 0.24, T: 0.38, tailH: 0.17, dH: 0.15, fin: '#1d46c4', finTip: '#ffd21f', body: (s, v) => {
    if (s > 0.86) return C('#ffd21f');
    const dark = v > -0.2 && s > 0.2 && s < 0.82 && (s - 0.2) * 1.05 + (1 - v) * 0.05 < 0.5 + 0.2 * Math.sin(s * 11);
    return dark ? C('#0d1a55') : C('#2b66ff').lerp(C('#5ea0ff'), clamp01(v * 0.5 + 0.2));
  } },
  { id: 'butterfly', H: 0.27, T: 0.34, tailH: 0.11, dH: 0.15, fin: '#ffd32a', body: (s, v) => {
    const b = band(s, 0.17, 0.07, 0.02);
    if (b === 2) return C('#14161d'); if (b === 1) return C('#ffffff');
    if (s > 0.8 && v > 0.1) return C('#14161d');
    return mix('#fff3a6', '#ffcf1f', sm(0.2, 0.75, s));
  } },
  { id: 'angel', H: 0.3, T: 0.3, tailH: 0.1, dH: 0.34, fin: '#2d6cdf', body: (s, v) => (Math.floor(s * 9) % 2 === 0 ? C('#ffd23a') : C('#2d6cdf')).lerp(C('#ffffff'), v < -0.5 ? 0.25 : 0) },
  { id: 'anthias', H: 0.17, T: 0.42, tailH: 0.17, dH: 0.11, fin: '#ffe066', body: (_s, v) => mix('#ffb35c', '#ff5fa0', clamp01(v * 0.5 + 0.55)) },
  { id: 'wrasse', H: 0.16, T: 0.42, tailH: 0.11, dH: 0.08, fin: '#35e0d2', body: (s, v) => (s > 0.3 && s < 0.4 && v > 0.2 ? C('#ffe14a') : mix('#35e0d2', '#8650ff', clamp01(v * 0.6 + 0.45))) },
  { id: 'silver', H: 0.19, T: 0.36, tailH: 0.17, dH: 0.12, fin: '#bfeaff', glow: '#2f5fff', body: (s, v) => mix('#d9f7ff', '#5f8fff', clamp01(0.45 + v * 0.45 + Math.sin(s * 9) * 0.12)) },
  { id: 'chromis', H: 0.15, T: 0.4, tailH: 0.13, dH: 0.1, fin: '#18a98a', body: (_s, v) => mix('#c8ffe9', '#1fd9a4', clamp01(v * 0.5 + 0.55)) },
  { id: 'yellow', H: 0.25, T: 0.3, tailH: 0.12, dH: 0.16, fin: '#ffd000', body: (s, v) => (s > 0.76 && s < 0.82 && v > -0.3 ? C('#ffffff') : mix('#ffd400', '#fff04a', clamp01(v * 0.5 + 0.4))) },
];

const geoCache = new Map<string, THREE.BufferGeometry>();
function fishGeo(sp: Species): THREE.BufferGeometry {
  const hit = geoCache.get(sp.id);
  if (hit) return hit;
  const body = (s: number) => Math.pow(Math.sin(Math.PI * Math.pow(s, 0.7)), 0.7);
  const g = tube(1, 20, 10, (s) => { const ry = sp.H * (0.12 + 0.88 * body(s)); return [ry * sp.T * 2, ry, 0]; });
  paint(g, (_x, _y, z, _nx, ny) => sp.body(clamp01(0.5 - z), ny), sway);
  const tailCol = (x: number, y: number) => mix(sp.fin, sp.finTip ?? sp.fin, clamp01(x / 0.3 * 0.7 + Math.abs(y) * 1.2));
  const tail = fin([[0, 0.05], [0.14, sp.tailH * 1.05], [0.3, sp.tailH], [0.22, 0], [0.3, -sp.tailH], [0.14, -sp.tailH * 1.05], [0, -0.05]], tailCol);
  tail.translate(0, 0, -0.49);
  const dorsal = fin([[0, 0], [0.1, sp.dH], [0.38, sp.dH * 0.75], [0.52, 0]], (x, y) => mix(sp.fin, sp.finTip ?? sp.fin, y / sp.dH * 0.4));
  dorsal.translate(0, sp.H * 0.82, 0.26);
  const parts = [g, tail, dorsal];
  for (const sx of [-1, 1]) {
    const pf = fin([[0, 0], [0.12, -0.02], [0.2, -0.1], [0.03, -0.05]], () => mix(sp.fin, '#ffffff', 0.25));
    pf.rotateZ(sx * 0.9);
    pf.translate(sx * sp.H * sp.T * 1.6, -sp.H * 0.15, 0.12);
    parts.push(pf);
    const eye = new THREE.IcosahedronGeometry(sp.H * 0.26, 1);
    eye.translate(sx * sp.H * sp.T * 1.55, sp.H * 0.18, 0.36);
    parts.push(paint(eye, '#ffffff', sway));
    const pupil = new THREE.IcosahedronGeometry(sp.H * 0.15, 1);
    pupil.translate(sx * sp.H * sp.T * 1.85, sp.H * 0.18, 0.375);
    parts.push(paint(pupil, '#0b0b12', sway));
  }
  const out = merge(parts);
  geoCache.set(sp.id, out);
  return out;
}

let fishMatShared: THREE.MeshStandardMaterial | null = null;
const fishMat = () => (fishMatShared ??= mat('#ffffff', { rough: 0.42, metal: 0.08, side: THREE.DoubleSide, bend: { amp: 0.055, freq: 7.5, k: 9, axis: 'x' } }));
let silverMatShared: THREE.MeshStandardMaterial | null = null;
const silverMat = () => (silverMatShared ??= mat('#ffffff', { rough: 0.25, metal: 0.35, side: THREE.DoubleSide, emissive: '#3a62ff', ei: 0.28, bend: { amp: 0.055, freq: 8, k: 9, axis: 'x' } }));

export interface SchoolOpts {
  species: number[]; count: number; seed: number;
  /** world length of an average fish */
  size: number;
  mode: 'orbit' | 'formation' | 'path';
  center: THREE.Vector3;
  rx?: number; rz?: number; ry?: number; speed?: number;
  /** path mode: leader position as a function of time (loops) */
  path?: (t: number, out: THREE.Vector3) => void;
  /** where the school swims in from while it is being revealed */
  entry?: THREE.Vector3;
  /** formation lattice spacing */
  gap?: number;
  /** reveal progress source (build.t) */
  progress: () => number;
}

/** A school (or a few fish): one InstancedMesh per species, positions computed on the CPU, the body wave on the GPU. */
export class FishSchool implements Live {
  readonly group = new THREE.Group();
  private metas: { sp: number; mesh: THREE.InstancedMesh }[] = [];
  private ph: Float32Array; private spd: Float32Array; private k: Float32Array; private yo: Float32Array; private sc: Float32Array;
  private off: THREE.Vector3[] = [];
  private tmpP = new THREE.Vector3(); private tmpQ = new THREE.Vector3(); private tmpL = new THREE.Vector3();
  private m4 = new THREE.Matrix4(); private fw = new THREE.Vector3(); private rt = new THREE.Vector3(); private up = new THREE.Vector3();
  constructor(private o: SchoolOpts) {
    const r = rng(o.seed);
    const n = o.count, ns = o.species.length;
    this.ph = new Float32Array(n); this.spd = new Float32Array(n); this.k = new Float32Array(n); this.yo = new Float32Array(n); this.sc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.ph[i] = r() * 6.283; this.spd[i] = 0.9 + r() * 0.22; this.k[i] = 0.55 + r() * 0.6; this.yo[i] = (r() - 0.5); this.sc[i] = 0.8 + r() * 0.45;
      const row = Math.floor(i / 2), side = i % 2 ? 1 : -1;
      this.off.push(new THREE.Vector3(side * (row + 1) * (o.gap ?? 1.4) * (0.8 + r() * 0.4), (r() - 0.5) * (o.gap ?? 1.4) * 1.2, -(row + 1) * (o.gap ?? 1.4) * 0.9 + (r() - 0.5)));
    }
    for (let s = 0; s < ns; s++) {
      const sp = SPECIES[o.species[s]];
      const slots = Math.ceil((n - s) / ns);
      const g = fishGeo(sp).clone();
      g.setAttribute('aPhaseI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: slots }, () => r()), 1));
      g.scale(1, 1, 1);
      const mesh = new THREE.InstancedMesh(g, sp.glow ? silverMat() : fishMat(), slots);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      this.metas.push({ sp: o.species[s], mesh });
    }
    this.group.visible = false;
  }
  private pos(i: number, time: number, out: THREE.Vector3) {
    const o = this.o, t = time * (o.speed ?? 0.3) * this.spd[i] + this.ph[i];
    if (o.mode === 'orbit') {
      out.set(o.center.x + Math.cos(t) * (o.rx ?? 8) * this.k[i], o.center.y + this.yo[i] * (o.ry ?? 3) + Math.sin(t * 1.7 + this.ph[i]) * 0.45, o.center.z + Math.sin(t) * (o.rz ?? 6) * this.k[i]);
    } else {
      const lt = time * (o.speed ?? 0.3);
      if (o.mode === 'path' && o.path) o.path(lt, this.tmpL); else this.tmpL.set(o.center.x + Math.cos(lt) * (o.rx ?? 20), o.center.y + Math.sin(lt * 2) * 1.5, o.center.z + Math.sin(lt) * (o.rz ?? 10));
      // heading of the leader
      if (o.mode === 'path' && o.path) o.path(lt + 0.05, this.tmpQ); else this.tmpQ.set(o.center.x + Math.cos(lt + 0.05) * (o.rx ?? 20), o.center.y + Math.sin((lt + 0.05) * 2) * 1.5, o.center.z + Math.sin(lt + 0.05) * (o.rz ?? 10));
      this.fw.subVectors(this.tmpQ, this.tmpL).setY(0).normalize();
      this.rt.set(-this.fw.z, 0, this.fw.x);
      const f = this.off[i];
      const wob = Math.sin(time * 0.8 + this.ph[i] * 2) * 0.35;
      out.copy(this.tmpL).addScaledVector(this.rt, f.x + wob).addScaledVector(this.fw, f.z).add(this.tmpQ.set(0, f.y + Math.sin(time + this.ph[i]) * 0.3, 0));
    }
  }
  update(_dt: number, time: number) {
    const o = this.o, reveal = clamp01(o.progress());
    if (reveal <= 0.001) { this.group.visible = false; return; }
    this.group.visible = true;
    const ns = this.metas.length;
    const shown = Math.min(o.count, Math.ceil(o.count * easeOut(clamp01(reveal * 1.1))));
    const entryK = 1 - easeOut(reveal);
    for (let s = 0; s < ns; s++) this.metas[s].mesh.count = Math.max(0, Math.ceil((shown - s) / ns));
    for (let i = 0; i < shown; i++) {
      this.pos(i, time, this.tmpP);
      const p0x = this.tmpP.x, p0y = this.tmpP.y, p0z = this.tmpP.z;
      this.pos(i, time + 0.12, this.tmpP);
      this.fw.set(this.tmpP.x - p0x, (this.tmpP.y - p0y) * 0.6, this.tmpP.z - p0z).normalize();
      if (o.entry && entryK > 0) { this.tmpP.set(p0x + o.entry.x * entryK * (1 + (i % 3) * 0.15), p0y + o.entry.y * entryK, p0z + o.entry.z * entryK); } else this.tmpP.set(p0x, p0y, p0z);
      this.up.set(0, 1, 0);
      this.rt.crossVectors(this.up, this.fw).normalize();
      this.up.crossVectors(this.fw, this.rt);
      const size = o.size * this.sc[i] * Math.min(1, 0.35 + reveal * 1.2);
      this.m4.makeBasis(this.rt.multiplyScalar(size), this.up.multiplyScalar(size), this.fw.clone().multiplyScalar(size)).setPosition(this.tmpP);
      const mesh = this.metas[i % ns].mesh;
      mesh.setMatrixAt(Math.floor(i / ns), this.m4);
    }
    for (const m of this.metas) m.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.metas.forEach((m) => { m.mesh.geometry.dispose(); m.mesh.dispose(); }); }
}

// ----------------------------------------------------------------------------------------- dolphins, whales (cetaceans)
export interface Cetacean { dorsal: number; ry: number; beak: number; flipper: number; fluke: number; top: string; belly: string; patch?: string; eye: number }
export const DOLPHIN: Cetacean = { dorsal: 1.15, ry: 0.115, beak: 0.1, flipper: 0.15, fluke: 0.17, top: '#5d7f9c', belly: '#e9f2f6', eye: 0.014 };
export const WHALE: Cetacean = { dorsal: 0.42, ry: 0.15, beak: 0, flipper: 0.28, fluke: 0.3, top: '#2a5f9c', belly: '#dceaf3', patch: '#f2f8fb', eye: 0.014 };

let swimMats: THREE.MeshStandardMaterial[] = [];
export function cetaceanGeo(c: Cetacean): THREE.BufferGeometry {
  const prof = (s: number): [number, number, number] => {
    const beak = c.beak > 0 ? (1 - sm(0, c.beak + 0.04, s)) * 0.085 : 0;
    const body = c.ry * (0.34 + 0.66 * sm(0.04, 0.34, s)) * (1 - 0.8 * sm(0.45, 0.94, s) * 0.95);
    const melon = c.beak > 0 ? 0.03 * Math.exp(-Math.pow((s - 0.16) / 0.05, 2)) : 0.02 * Math.exp(-Math.pow((s - 0.12) / 0.07, 2));
    if (c.beak === 0) {
      // whale: a hemispherical head, the widest girth just behind it, then a long taper to the tail stock
      const head = s < 0.3 ? Math.sqrt(Math.max(0, 1 - Math.pow((0.3 - s) / 0.3, 2))) : 1;
      const tail = s > 0.3 ? Math.pow(1 - (s - 0.3) / 0.7, 0.8) : 1;
      const w = Math.max(0.03, c.ry * head * tail * (1 + 0.04 * Math.sin(s * 26)));
      return [w * 1.02, w, -w * 0.05];
    }
    const ry = Math.max(0.018, body + melon - beak * 0.7);
    return [ry * 0.92, ry, -ry * 0.06];
  };
  const g = tube(1, 30, 14, prof);
  paint(g, (_x, y, z, _nx, ny, _nz) => {
    const s = 0.5 - z;
    let v = sm(-0.25, 0.3, ny);
    if (c.patch && s > 0.12 && s < 0.5 && ny < -0.3) v = 0; // belly stays light
    const col = C(c.belly).lerp(C(c.top), v);
    if (c.patch && s < 0.3 && ny > -0.5 && ny < -0.2) col.lerp(C('#243b57'), 0.5); // the smiling mouth line
    return col.multiplyScalar(0.92 + noise2(_x * 20, z * 20) * 0.1);
  }, sway);
  const parts: THREE.BufferGeometry[] = [g];
  const dorsal = fin([[0, 0], [0.04, c.ry * c.dorsal], [0.14, c.ry * c.dorsal * 0.82], [0.22, 0]], () => C(c.top).multiplyScalar(0.85));
  dorsal.translate(0, c.ry * 0.78, 0.0);
  parts.push(dorsal);
  const fl = new THREE.Shape();
  fl.moveTo(0, 0.025); fl.quadraticCurveTo(c.fluke * 0.5, 0.02, c.fluke, 0.115); fl.quadraticCurveTo(c.fluke * 0.55, 0.075, 0, 0.065);
  fl.quadraticCurveTo(-c.fluke * 0.55, 0.075, -c.fluke, 0.115); fl.quadraticCurveTo(-c.fluke * 0.5, 0.02, 0, 0.025);
  const fluke = new THREE.ShapeGeometry(fl, 8);
  fluke.rotateX(-Math.PI / 2);
  fluke.translate(0, 0, -0.49);
  parts.push(paint(fluke, (x) => mix(c.top, c.belly, Math.abs(x) / c.fluke * 0.6), (_x, _y, z) => clamp01(0.5 - z)));
  for (const sx of [-1, 1]) {
    const f = fin([[0, 0], [c.flipper * 0.5, -0.01], [c.flipper, -c.flipper * 0.55], [c.flipper * 0.3, -0.05]], (_x, y) => mix(c.top, c.belly, -y / c.flipper * 0.8));
    f.rotateZ(sx * 0.95);
    f.translate(sx * c.ry * 0.7, -c.ry * 0.5, 0.2);
    parts.push(f);
    const eye = new THREE.IcosahedronGeometry(c.eye * 1.6, 1);
    eye.translate(sx * c.ry * 0.85, -c.ry * 0.12, 0.32 - (c.beak > 0 ? 0.04 : 0));
    parts.push(paint(eye, '#ffffff', sway));
    const pupil = new THREE.IcosahedronGeometry(c.eye, 1);
    pupil.translate(sx * c.ry * 0.93, -c.ry * 0.12, 0.33 - (c.beak > 0 ? 0.04 : 0));
    parts.push(paint(pupil, '#0b0d14', sway));
  }
  return merge(parts);
}

export type SwimPath = (t: number, out: THREE.Vector3) => void;
/** One large animal following a loop. Smooth heading from the path, a gentle roll, and the body wave on the GPU. */
export class Swimmer implements Live {
  readonly group = new THREE.Group();
  private a = new THREE.Vector3(); private b = new THREE.Vector3(); private m: THREE.MeshStandardMaterial;
  private prevYaw = 0;
  constructor(geo: THREE.BufferGeometry, private scale: number, private path: SwimPath, private speed: number, bend: { amp: number; freq: number; k: number }, phase: number, private startAt: () => number, private roll = 0, private hide = true) {
    this.m = mat('#ffffff', { rough: 0.38, metal: 0.04, side: THREE.DoubleSide, bend: { ...bend, axis: 'y', phase } });
    swimMats.push(this.m);
    const mesh = new THREE.Mesh(geo, this.m);
    mesh.scale.setScalar(scale);
    mesh.castShadow = false;
    this.group.add(mesh);
    this.group.visible = false;
  }
  update(_dt: number, time: number) {
    const t = this.startAt();
    if (this.hide) this.group.visible = t > 0.02;
    if (!this.group.visible) return;
    const tt = time * this.speed;
    this.path(tt, this.a);
    this.path(tt + 0.04, this.b);
    this.group.position.copy(this.a);
    this.group.lookAt(this.b);
    const yaw = Math.atan2(this.b.x - this.a.x, this.b.z - this.a.z);
    let dy = yaw - this.prevYaw; if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
    this.prevYaw = yaw;
    this.group.rotateZ(THREE.MathUtils.clamp(-dy * 40, -0.4, 0.4) + this.roll);
    this.group.scale.setScalar(Math.min(1, 0.2 + t * 1.6));
  }
  dispose() { this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }
}

// ------------------------------------------------------------------------------------------------------------- turtle
export class Turtle implements Live {
  readonly group = new THREE.Group();
  private fl: THREE.Group[] = []; private rl: THREE.Group[] = [];
  private a = new THREE.Vector3(); private b = new THREE.Vector3();
  constructor(private scale: number, private path: SwimPath, private speed: number, private progress: () => number) {
    const body = new THREE.Group();
    const shell = new THREE.SphereGeometry(1, 32, 18);
    shell.scale(1.12, 0.52, 1.4);
    const p = shell.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.05) p.setY(i, -0.05 + (y + 0.05) * 0.4); }
    shell.computeVertexNormals();
    paint(shell, (x, y, z, _nx, ny) => {
      const u = x * 2.4, v = z * 2.0;
      const cell = Math.abs(Math.sin(u + Math.sin(v * 1.3) * 1.2) * Math.sin(v * 1.1 + Math.cos(u) * 0.8));
      const edge = sm(0.0, 0.2, cell);
      const top = C('#8a6a2e').lerp(C('#b89048'), noise2(x * 2, z * 2));
      const col = C('#3d2a12').lerp(top, edge);
      if (ny < -0.2) return C('#e8d6a0');
      return col.lerp(C('#4f7a3c'), clamp01(noise2(x * 3 + 4, z * 3) - 0.6) * 1.6);
    }, 0);
    body.add(new THREE.Mesh(shell, M.stone()));
    const rim = new THREE.TorusGeometry(1, 0.07, 6, 36);
    rim.rotateX(Math.PI / 2); rim.scale(1.1, 1, 1.38); rim.translate(0, -0.03, 0);
    body.add(new THREE.Mesh(paint(rim, '#d9c58a', 0), M.stone()));
    const green = '#6f9c58', light = '#a9c98a';
    const head = new THREE.IcosahedronGeometry(0.5, 2); head.scale(0.85, 0.78, 1.25); head.translate(0, 0.08, 1.75);
    const beak = new THREE.ConeGeometry(0.2, 0.4, 8); beak.rotateX(Math.PI / 2); beak.translate(0, 0.0, 2.38);
    const neck = new THREE.CylinderGeometry(0.34, 0.4, 0.8, 10); neck.rotateX(Math.PI / 2); neck.translate(0, 0.0, 1.3);
    const parts = [paint(head, (x, y) => mix(green, light, clamp01(-y + 0.3)), 0), paint(beak, '#8bb066', 0), paint(neck, green, 0)];
    for (const sx of [-1, 1]) {
      const e = new THREE.IcosahedronGeometry(0.1, 1); e.translate(sx * 0.36, 0.2, 2.0);
      parts.push(paint(e, '#101018', 0));
      const hl = new THREE.IcosahedronGeometry(0.035, 0); hl.translate(sx * 0.4, 0.25, 2.06);
      parts.push(paint(hl, '#ffffff', 0));
    }
    const tail = new THREE.ConeGeometry(0.16, 0.7, 6); tail.rotateX(-Math.PI / 2); tail.translate(0, -0.05, -1.7);
    parts.push(paint(tail, green, 0));
    body.add(new THREE.Mesh(merge(parts), M.shell()));
    for (const sx of [-1, 1]) {
      const mk = (len: number, wid: number, z: number, list: THREE.Group[]) => {
        const f = new THREE.IcosahedronGeometry(0.5, 2);
        f.scale(len, 0.1, wid); f.translate(sx * len * 0.5, 0, 0);
        paint(f, (x, y, zz) => mix(green, light, clamp01(Math.abs(x) / len * 0.3 + (y < 0 ? 0.4 : 0))), 0);
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.95, -0.08, z);
        pivot.add(new THREE.Mesh(f, M.shell()));
        body.add(pivot);
        list.push(pivot);
      };
      mk(1.6, 0.55, 0.9, this.fl);
      mk(0.8, 0.35, -1.0, this.rl);
    }
    body.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
    body.scale.setScalar(scale);
    this.group.add(body);
    this.group.visible = false;
  }
  update(_dt: number, time: number) {
    const t = this.progress();
    this.group.visible = t > 0.02;
    if (!this.group.visible) return;
    const tt = time * this.speed;
    this.path(tt, this.a); this.path(tt + 0.05, this.b);
    this.group.position.copy(this.a);
    this.group.lookAt(this.b);
    const flap = Math.sin(time * 1.25);
    this.fl.forEach((p, i) => { const sx = i === 0 ? -1 : 1; p.rotation.z = sx * (flap * 0.55 + 0.1); p.rotation.y = sx * flap * 0.18; });
    this.rl.forEach((p, i) => { const sx = i === 0 ? -1 : 1; p.rotation.z = sx * Math.sin(time * 1.25 + 1.4) * 0.3; });
    this.group.scale.setScalar(Math.min(1, 0.25 + t * 1.5));
  }
  dispose() { this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }
}

// ------------------------------------------------------------------------------------------------------------ octopus
export class Octopus implements Live {
  readonly group = new THREE.Group();
  constructor(private home: THREE.Vector3, private out: THREE.Vector3, private scale: number, private progress: () => number) {
    const head = new THREE.IcosahedronGeometry(1, 3); head.scale(0.95, 1.18, 0.95); head.translate(0, 1.5, 0);
    const cc = (x: number, y: number) => mix('#e8613f', '#ffb28a', clamp01((y - 1.5) * 0.3 + 0.4 + noise2(x * 5, y * 5) * 0.2));
    const parts = [paint(head, (x, y) => cc(x, y), 0)];
    for (const sx of [-1, 1]) {
      const e = new THREE.IcosahedronGeometry(0.34, 2); e.translate(sx * 0.62, 1.55, 0.72);
      const pu = new THREE.IcosahedronGeometry(0.2, 2); pu.translate(sx * 0.66, 1.52, 0.98);
      const hl = new THREE.IcosahedronGeometry(0.07, 1); hl.translate(sx * 0.7, 1.62, 1.14);
      parts.push(paint(e, '#fff8ee', 0), paint(pu, '#14121c', 0), paint(hl, '#ffffff', 0));
    }
    const mouth = new THREE.TorusGeometry(0.2, 0.04, 6, 14, Math.PI); mouth.rotateZ(Math.PI); mouth.translate(0, 1.05, 0.9);
    parts.push(paint(mouth, '#a53a2a', 0));
    this.group.add(new THREE.Mesh(merge(parts), M.coralStill()));
    const tents: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, len = 2.6;
      const t = new THREE.ConeGeometry(0.3, len, 8, 8, true); t.translate(0, -len / 2, 0);
      paint(t, (x, y) => mix('#e8613f', '#ffb28a', clamp01(-y / len)), (_x, y) => clamp01(-y / len));
      xf(t, [Math.cos(a) * 0.55, 0.9, Math.sin(a) * 0.55], [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7]);
      tents.push(t);
    }
    const tm = new THREE.Mesh(merge(tents), mat('#ffffff', { rough: 0.5, sway: 0.9, side: THREE.DoubleSide }));
    this.group.add(tm);
    this.group.scale.setScalar(scale);
    this.group.visible = false;
  }
  update(_dt: number, time: number) {
    const t = this.progress();
    this.group.visible = t > 0.02;
    if (!this.group.visible) return;
    const e = easeOut(t);
    this.group.position.lerpVectors(this.home, this.out, e);
    this.group.position.y += Math.sin(time * 0.9) * 0.18;
    this.group.rotation.y = Math.sin(time * 0.4) * 0.3 - 0.3 * e;
    this.group.scale.setScalar(this.scale * (0.5 + 0.5 * e));
  }
  dispose() { this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }
}

// ----------------------------------------------------------------------------------------------------------- jellyfish
export class Jelly implements Live {
  readonly group = new THREE.Group();
  private bell: THREE.Mesh; private tents: THREE.Mesh;
  constructor(private base: THREE.Vector3, private size: number, color: string, private seed: number, private progress: () => number) {
    const bg = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    paint(bg, (x, y) => mix(color, '#ffffff', clamp01(0.15 + (1 - y) * 0.4)), 0);
    this.bell = new THREE.Mesh(bg, mat('#ffffff', { rough: 0.3, transparent: true, opacity: 0.62, emissive: color, ei: 0.9, side: THREE.DoubleSide, glow: 'jelly', caustics: 0 }));
    const tl: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.28, len = 1.8 + (i % 3) * 0.5;
      const t = new THREE.CylinderGeometry(0.03, 0.05, len, 4, 6, true); t.translate(0, -len / 2, 0);
      paint(t, color, (_x, y) => clamp01(-y / len));
      t.translate(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      tl.push(t);
    }
    this.tents = new THREE.Mesh(merge(tl), mat('#ffffff', { rough: 0.4, transparent: true, opacity: 0.55, emissive: color, ei: 0.8, sway: 1.2, caustics: 0, glow: 'jelly' }));
    this.group.add(this.bell, this.tents);
    this.group.visible = false;
  }
  update(_dt: number, time: number) {
    const t = this.progress();
    this.group.visible = t > 0.02;
    if (!this.group.visible) return;
    const pulse = Math.sin(time * 1.6 + this.seed) * 0.5 + 0.5;
    this.bell.scale.set(1 + pulse * 0.12, 0.8 + (1 - pulse) * 0.18, 1 + pulse * 0.12);
    this.group.position.set(this.base.x + Math.sin(time * 0.15 + this.seed) * 3, this.base.y + Math.sin(time * 0.35 + this.seed * 2) * 1.6 + pulse * 0.3, this.base.z + Math.cos(time * 0.13 + this.seed) * 2.5);
    this.group.scale.setScalar(this.size * Math.min(1, 0.2 + t * 1.5));
  }
  dispose() { this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }
}

export function disposeCreatures() {
  geoCache.forEach((g) => g.dispose()); geoCache.clear();
  swimMats = []; fishMatShared = null; silverMatShared = null;
}
