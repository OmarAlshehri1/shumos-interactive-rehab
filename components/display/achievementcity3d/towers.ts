import * as THREE from 'three';
import { Build, box, cone, cyl, facade, facadeCyl, gable, mat, rng } from './kit';
import { groundY } from './terrain';

export const CONCRETE = ['#e4dfd4', '#d9d4c8', '#eae6dc'];
export const GLASS = ['#9cc3df', '#8fb8d6', '#a8cde4', '#7fa6c6'];
export const SAND = ['#eadcc0', '#e6d2b0', '#f0e2c8'];
export const BRICK = ['#cf8f6d', '#c47f5e', '#d79b7a'];
export const PASTEL = ['#f4d9c0', '#f6e7b8', '#cfe3d4', '#d8d6ee', '#f3cbc9'];

/** Rooftop clutter: AC units, a water tank, an antenna. Cheap but it breaks the "empty box" look. */
function roofStuff(b: Build, r: () => number, x: number, y: number, z: number, w: number, d: number, a: number, e: number) {
  const g = mat('#9aa3ab', { rough: 0.6, metal: 0.3 });
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) b.add(box(1.4 + r(), 0.9 + r() * 0.4, 1.2 + r(), g, x + (r() - 0.5) * (w - 2), y, z + (r() - 0.5) * (d - 2)), a, e, 'pop');
  if (r() > 0.5) { const t = cyl(0.9, 0.9, 1.6, 10, mat('#7a6a5a'), x + (r() - 0.5) * (w - 3), y, z + (r() - 0.5) * (d - 3)); b.add(t, a, e, 'pop'); }
  if (r() > 0.4) b.add(cyl(0.08, 0.08, 4 + r() * 3, 5, mat('#c9ced3', { metal: 0.5 }), x, y, z), a + 0.02, e, 'rise');
}

export type TowerStyle = 'slab' | 'stepped' | 'round' | 'crown' | 'twin';
/** A tower rising from a podium. a..e is its slice of the milestone timeline. */
export function tower(b: Build, x: number, z: number, w: number, d: number, h: number, seed: number, style: TowerStyle, a = 0, e = 1, palette = GLASS) {
  const r = rng(seed);
  const gy = groundY(x, z);
  const span = e - a;
  const t = (f: number) => a + span * f;
  const col = palette[Math.floor(r() * palette.length)];
  const var_ = Math.floor(r() * 3);
  const podiumC = CONCRETE[Math.floor(r() * 3)];
  b.add(facade(w + 3, 3.6, d + 3, podiumC, 1, x, gy - 0.6), t(0), t(0.2), 'rise');
  const roofM = mat('#6b7480', { rough: 0.6, metal: 0.2 });
  if (style === 'round') {
    b.add(facadeCyl(w / 2, h, 20, col, var_, x, gy + 2.8), t(0.15), t(0.7), 'rise');
    b.add(cyl(w / 2 + 0.3, w / 2 + 0.3, 0.6, 20, roofM, x, gy + 2.8 + h), t(0.65), t(0.8), 'drop');
    b.add(cone(w / 2 - 1, 5, 20, mat('#cfd8e0', { rough: 0.3, metal: 0.4 }), x, gy + 3.4 + h), t(0.78), t(0.95), 'drop');
  } else if (style === 'stepped') {
    b.add(facade(w, h * 0.62, d, col, var_, x, gy + 2.8), t(0.15), t(0.5), 'rise');
    b.add(facade(w * 0.75, h * 0.28, d * 0.75, col, var_, x, gy + 2.8 + h * 0.62), t(0.45), t(0.7), 'rise');
    b.add(facade(w * 0.5, h * 0.18, d * 0.5, col, var_, x, gy + 2.8 + h * 0.9), t(0.65), t(0.82), 'rise');
    b.add(cyl(0.12, 0.12, h * 0.16, 5, mat('#c9ced3', { metal: 0.6 }), x, gy + 2.8 + h * 1.08), t(0.8), t(0.95), 'rise');
  } else if (style === 'twin') {
    for (const s of [-1, 1]) b.add(facade(w * 0.42, h, d, col, var_, x + s * w * 0.3, gy + 2.8), t(0.15 + (s > 0 ? 0.08 : 0)), t(0.65 + (s > 0 ? 0.08 : 0)), 'rise');
    b.add(facade(w * 0.3, 3, d * 0.7, '#cfd8e0', 2, x, gy + 2.8 + h * 0.72), t(0.72), t(0.9), 'rise');
    b.add(box(w + 0.8, 0.5, d + 0.8, roofM, x, gy + 2.8 + h), t(0.8), t(0.95), 'drop');
  } else if (style === 'crown') {
    b.add(facade(w, h, d, col, var_, x, gy + 2.8), t(0.15), t(0.7), 'rise');
    b.add(cone(Math.max(w, d) * 0.62, h * 0.18, 4, mat('#b9c7d4', { rough: 0.3, metal: 0.5 }), x, gy + 2.8 + h, z, Math.PI / 4), t(0.7), t(0.92), 'drop');
  } else {
    b.add(facade(w, h, d, col, var_, x, gy + 2.8), t(0.15), t(0.7), 'rise');
    b.add(box(w + 0.6, 0.6, d + 0.6, roofM, x, gy + 2.8 + h), t(0.68), t(0.82), 'drop');
    roofStuff(b, r, x, gy + 3.4 + h, z, w, d, t(0.8), t(0.97));
  }
}

/** A mid-rise apartment block with balconies, a parapet roof and an entrance canopy. */
export function apartment(b: Build, x: number, z: number, w: number, d: number, h: number, seed: number, a = 0, e = 1, rot = 0) {
  const r = rng(seed);
  const gy = groundY(x, z);
  const span = e - a, t = (f: number) => a + span * f;
  const col = [...PASTEL, ...BRICK, ...SAND][Math.floor(r() * 11)];
  const pv = (o: THREE.Object3D) => { const g = new THREE.Group(); g.position.set(x, gy, z); g.rotation.y = rot; g.add(o); return g; };
  b.add(pv(box(w + 0.6, 1.6, d + 0.6, mat('#bdb6a8', { rough: 1 }), 0, -0.6, 0)), t(0), t(0.15), 'rise');
  b.add(pv(facade(w, h, d, col, Math.floor(r() * 3), 0, 0.9)), t(0.1), t(0.62), 'rise');
  b.add(pv(box(w + 0.5, 0.7, d + 0.5, mat('#8a8f97', { rough: 0.7 }), 0, 0.9 + h)), t(0.6), t(0.75), 'drop');
  const rail = mat('#f4f1ea', { rough: 0.7 });
  const floors = Math.max(2, Math.round(h / 3.3));
  for (let f = 1; f < floors; f += 1) for (const sx of [-w * 0.28, w * 0.28]) if (r() > 0.4) b.add(pv(box(2.2, 0.15, 1.0, rail, sx, 0.9 + f * (h / floors), d / 2 + 0.4)), t(0.7 + 0.002 * f), t(0.9), 'pop');
  b.add(pv(box(2.6, 0.2, 1.8, mat('#c0563f'), 0, 3.0, d / 2 + 0.7)), t(0.82), t(0.95), 'drop');
  if (r() > 0.55) b.add(pv(gable(w, d, 1.8, mat(['#a8483c', '#6a5a8a', '#4f7096'][Math.floor(r() * 3)]), 0, 0.9 + h + 0.6, 0, 0, 0.3)), t(0.72), t(0.92), 'drop');
  else roofStuff(b, r, x, gy + 1.9 + h, z, w, d, t(0.8), t(0.97));
}
