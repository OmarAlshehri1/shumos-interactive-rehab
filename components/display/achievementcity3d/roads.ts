import * as THREE from 'three';
import { groundY } from './terrain';
import { mat } from './kit';

export interface Road {
  group: THREE.Group;
  /** Reveal 0..1 along the length (roads "extend"). */
  setProgress(u: number): void;
  curve: THREE.CatmullRomCurve3;
  length: number;
  /** Sampled centre line in world space. */
  sample(u: number): THREE.Vector3;
}

function strip(curve: THREE.CatmullRomCurve3, segs: number, half: number, lift: number, flat = true): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const nx = -t.z, nz = t.x;
    const len = Math.hypot(nx, nz) || 1;
    for (const s of [-1, 1]) {
      const x = p.x + (nx / len) * half * s, z = p.z + (nz / len) * half * s;
      pos.push(x, (flat ? groundY(x, z) : groundY(p.x, p.z)) + lift, z);
      nor.push(0, 1, 0);
      uv.push(s < 0 ? 0 : 1, u * curve.getLength() * 0.2);
    }
    if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export interface RoadStyle { width: number; color: string; edge?: string; line?: string; lift?: number }
/** A road draped on the terrain: surface, kerb/edge, optional dashed centre line. Always lies on the ground (pavement on top of grass). */
export function makeRoad(points: [number, number][], style: RoadStyle): Road {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.3);
  const length = curve.getLength();
  const segs = Math.max(4, Math.round(length / 1.6));
  const lift = style.lift ?? 0.16;
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, order = 0) => {
    const mesh = new THREE.Mesh(g, m);
    m.polygonOffset = true; m.polygonOffsetFactor = -2 - order; m.polygonOffsetUnits = -2 - order;
    mesh.receiveShadow = true;
    mesh.renderOrder = order;
    group.add(mesh);
    geos.push(g);
    return mesh;
  };
  if (style.edge) mk(strip(curve, segs, style.width / 2 + 0.55, lift - 0.02), mat(style.edge, { rough: 0.95 }), 0);
  mk(strip(curve, segs, style.width / 2, lift), mat(style.color, { rough: 0.9 }), 1);
  if (style.line) {
    const g = strip(curve, segs, 0.08, lift + 0.02);
    mk(g, mat(style.line, { rough: 0.8 }), 2);
  }
  const total = geos.map((g) => g.index!.count);
  return {
    group, curve, length,
    setProgress(u: number) {
      const k = Math.max(0, Math.min(1, u));
      geos.forEach((g, i) => g.setDrawRange(0, Math.floor((total[i] / 6) * k) * 6));
    },
    sample(u: number) {
      const p = curve.getPointAt(Math.max(0, Math.min(1, u)));
      p.y = groundY(p.x, p.z);
      return p;
    },
  };
}
