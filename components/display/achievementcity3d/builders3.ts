import * as THREE from 'three';
import { Build, ball, box, cone, cyl, facade, mat, rng, rod, tree } from './kit';
import { makeRoad } from './roads';
import { groundY } from './terrain';
import { CITY_ROADS } from './layout';
import { tower, type TowerStyle, GLASS, CONCRETE } from './towers';
import { lamp } from './builders2';
import type { Made, Live } from './builders1';

export function towers(): Made {
  const b = new Build('towers', 45, -31, 3.8);
  const spec: [number, number, number, number, number, TowerStyle][] = [[32, -31, 8, 8, 36, 'slab'], [41, -32, 9, 9, 46, 'stepped'], [50, -31, 8, 8, 40, 'crown'], [59, -32, 10, 9, 32, 'twin']];
  spec.forEach(([x, z, w, d, h, s], i) => tower(b, x, z, w, d, h, 300 + i * 11, s, i * 0.18, 0.4 + i * 0.2));
  return { build: b };
}

export function landmark(): Made {
  const b = new Build('landmark', 70, -30, 3.6);
  const gy = groundY(70, -30);
  const white = mat('#f2f4f7', { rough: 0.35, metal: 0.25 });
  b.add(cyl(9, 11, 1.2, 24, mat('#cfd6dd', { rough: 0.9 }), 70, gy - 0.4, -30), 0, 0.15, 'rise');
  for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.283; b.add(rod(new THREE.Vector3(70 + Math.cos(a) * 5, gy, -30 + Math.sin(a) * 5), new THREE.Vector3(70 + Math.cos(a) * 1.4, gy + 46, -30 + Math.sin(a) * 1.4), 0.7, white, 8), 0.1 + i * 0.03, 0.5, 'rise'); }
  b.add(cyl(1.5, 1.7, 62, 14, white, 70, gy, -30), 0.2, 0.6, 'rise');
  const disc = cyl(8.2, 5.4, 3.2, 24, mat('#dfe6ec', { rough: 0.3, metal: 0.4 }), 70, gy + 46, -30);
  b.add(disc, 0.5, 0.75, 'drop');
  b.add(cyl(7, 7, 2.2, 24, mat('#7fb3d6', { rough: 0.05, metal: 0.3, emissive: '#6aa8cc', ei: 0.35 }), 70, gy + 49.2, -30), 0.6, 0.8, 'rise');
  b.add(cyl(8.6, 8.6, 0.5, 24, mat('#c0563f', { rough: 0.5 }), 70, gy + 51.4, -30), 0.7, 0.85, 'drop');
  b.add(cyl(0.18, 0.5, 20, 6, mat('#d9dee3', { metal: 0.6 }), 70, gy + 53, -30), 0.75, 0.95, 'rise');
  b.add(ball(0.7, mat('#ff4b55', { emissive: '#ff4b55', ei: 1.2 }), 70, gy + 72.6, -30, 1), 0.92, 1, 'pop');
  return { build: b };
}

export function stadium(): Made {
  const b = new Build('stadium', 77, -9, 3.4);
  const gy = groundY(77, -9), cx = 77, cz = -9;
  const stand = mat('#d9d3c6', { rough: 0.9 }), seat = mat('#3b7dd8', { rough: 0.8 });
  const bowl = (rx: number, rz: number, y: number, h: number, m: THREE.Material, a: number, e: number, kind: 'rise' | 'drop' = 'rise') => {
    const o = cyl(1, 1, h, 40, m, cx, y, cz); o.scale.set(rx, 1, rz); b.add(o, a, e, kind);
  };
  bowl(14, 11, gy - 0.2, 0.4, mat('#9a948a', { rough: 1 }), 0, 0.15);
  const pitch = box(22, 0.2, 14, mat('#3fae56', { rough: 1 }), cx, gy + 0.1, cz); b.add(pitch, 0.1, 0.35, 'rise');
  b.add(box(22, 0.05, 0.3, mat('#fff'), cx, gy + 0.32, cz), 0.3, 0.4, 'pop');
  const circ = cyl(2.4, 2.4, 0.05, 24, mat('#fff'), cx, gy + 0.3, cz); circ.scale.y = 1; b.add(circ, 0.3, 0.4, 'pop');
  // stands: four tiers around the pitch
  for (let t = 0; t < 3; t++) {
    const rx = 14 - t * 0 + t * 0, h = 2.0 + t * 1.8;
    const wall = cyl(1, 1, h, 40, t % 2 ? seat : stand, cx, gy, cz); wall.scale.set(13.5 + t * 1.3, 1, 10.5 + t * 1.3); b.add(wall, 0.2 + t * 0.1, 0.5 + t * 0.1, 'rise');
    void rx;
  }
  const hole = cyl(1, 1, 7.5, 40, mat('#3fae56', { rough: 1 }), cx, gy + 0.05, cz); hole.scale.set(11.5, 1, 7.6); b.add(hole, 0.45, 0.6, 'rise');
  const roof = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 6, 48).rotateX(Math.PI / 2), mat('#cfd8e0', { rough: 0.4, metal: 0.3 }));
  roof.position.set(cx, gy + 7.2, cz); roof.scale.set(15.5, 2.2, 12.5); roof.castShadow = true; b.add(roof, 0.65, 0.85, 'drop');
  for (let i = 0; i < 4; i++) { const px = cx + (i % 2 ? 1 : -1) * 15, pz = cz + (i < 2 ? -1 : 1) * 11; b.add(cyl(0.2, 0.3, 14, 6, mat('#cfd6dd', { metal: 0.5 }), px, gy, pz), 0.7, 0.9, 'rise'); b.add(box(2.4, 1.2, 0.5, mat('#fffbe8', { emissive: '#fff2b0', ei: 0.8 }), px, gy + 14, pz), 0.85, 1, 'pop'); }
  return { build: b };
}

export const METRO_PATH: [number, number][] = [[36, 6], [50, 6], [64, 6], [76, 4], [84, -6], [84, -20]];
export function metro(): Made {
  const b = new Build('metro', 62, 4, 3.4);
  const road = makeRoad(METRO_PATH, { width: 3.4, color: '#7a828c', edge: '#b9bec6', lift: 0 });
  // elevated viaduct: deck follows the curve at y = 9
  const pts = METRO_PATH.map(([x, z]) => new THREE.Vector3(x, 9, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
  const L = curve.getLength(), n = Math.round(L / 3);
  const deckM = mat('#c9ced4', { rough: 0.6, metal: 0.15 }), pil = mat('#aab2ba', { rough: 0.8 });
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, p = curve.getPointAt(u), tn = curve.getTangentAt(u);
    const seg = box(3.3, 0.9, 3.6, deckM, 0, 0, 0); seg.position.set(p.x, p.y - 0.9, p.z); seg.rotation.y = -Math.atan2(tn.z, tn.x) + Math.PI / 2;
    b.add(seg, u * 0.55, u * 0.55 + 0.15, 'rise');
    const rail = box(0.12, 0.5, 3.6, deckM, 0, 0, 0); void rail;
    if (i % 3 === 1) { const gy = groundY(p.x, p.z); b.add(cyl(0.7, 0.9, p.y - gy - 0.9, 8, pil, p.x, gy, p.z), u * 0.55 - 0.05, u * 0.55 + 0.1, 'rise'); }
  }
  // station with a curved canopy
  const sx = 56, sz = 6;
  b.add(box(18, 0.5, 5, mat('#e4e8ec'), sx, 8.6, sz), 0.5, 0.65, 'rise');
  b.add(box(18, 0.4, 5.6, mat('#3b7dd8', { rough: 0.4 }), sx, 12.6, sz), 0.6, 0.8, 'drop');
  for (const dx of [-8, 0, 8]) b.add(cyl(0.2, 0.2, 4, 6, mat('#cfd6dd', { metal: 0.5 }), sx + dx, 8.9, sz + 2), 0.65, 0.8, 'rise');
  b.add(box(5, 2.4, 2, mat('#9cc7e0', { rough: 0.1, emissive: '#6aa8cc', ei: 0.3 }), sx, groundY(sx, sz), sz + 4), 0.7, 0.9, 'rise');
  void road;
  return { build: b };
}

export function port2(): Made {
  const b = new Build('port2', 86, 40, 3.2);
  const r = rng(29);
  b.add(box(12, 1.8, 26, mat('#a7a49c', { rough: 1 }), 86, -0.4, 39), 0, 0.2, 'rise');
  b.add(box(5, 1.1, 16, mat('#9a948a', { rough: 1 }), 84, -0.1, 56), 0.1, 0.3, 'rise');
  [32, 44].forEach((cz, i) => {
    const c = new THREE.Group(), st = mat('#2f7fd8', { rough: 0.5, metal: 0.25 });
    for (const dz of [-2.8, 2.8]) for (const dx of [-1.6, 1.6]) c.add(box(0.5, 13, 0.5, st, dx, 0, dz));
    c.add(box(4.2, 0.8, 7, st, 0, 13, 0), box(0.6, 0.6, 22, st, 0, 13.6, 0).rotateY(Math.PI / 2), box(2, 2, 2.6, mat('#3b4a5a'), 0, 11.4, 0));
    c.children[c.children.length - 2].position.set(7, 13.6, 0); (c.children[c.children.length - 2] as THREE.Mesh).scale.set(1, 1, 1);
    c.position.set(88, 1.3, cz); b.add(c, 0.3 + i * 0.15, 0.7 + i * 0.1, 'rise');
  });
  const cols = ['#e5484d', '#3b7dd8', '#f2a93b', '#4cc27a', '#8a5ac8', '#c9ced3'];
  for (let i = 0; i < 12; i++) for (let k = 0; k < 1 + Math.floor(r() * 3); k++) b.add(box(2.4, 1.15, 5, mat(cols[Math.floor(r() * 6)], { rough: 0.6 }), 82 + (i % 2) * 2.6, 1.4 + k * 1.15, 28 + Math.floor(i / 2) * 5), 0.4 + i * 0.03 + k * 0.05, 0.65 + i * 0.03 + k * 0.05, 'pop');
  b.add(facade(10, 6, 14, '#d8d3c6', 0, 76, groundY(76, 30) + 0.2, 28), 0.5, 0.8, 'rise');
  return { build: b };
}

export function parks(): Made {
  const b = new Build('parks', 52, 24, 3.4);
  const r = rng(77);
  const gy = groundY(52, 24);
  b.add(cyl(13, 13, 0.3, 40, mat('#74cc55', { rough: 1 }), 52, gy - 0.1, 24), 0, 0.2, 'rise');
  const pond = cyl(5, 5, 0.12, 28, mat('#58c8e8', { rough: 0.05, emissive: '#2a8fb8', ei: 0.3 }), 54, gy + 0.22, 26); pond.scale.set(1.3, 1, 0.9); b.add(pond, 0.1, 0.3, 'rise');
  const rd = makeRoad([[40, 24], [46, 20], [54, 18], [62, 24]], { width: 2, color: '#e4d8bd', lift: 0.2 });
  b.add(rd.group, 0.2, 0.5, 'none'); b.hooks.push((t) => rd.setProgress((t - 0.2) / 0.3));
  for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = 3 + r() * 10; const t = tree(r, i % 5 === 0 ? 'blossom' : i % 7 === 0 ? 'poplar' : 'round', 1.1); t.position.set(52 + Math.cos(a) * d, groundY(52, 24), 24 + Math.sin(a) * d * 0.9); b.add(t, 0.25 + i * 0.025, 0.7 + i * 0.015, 'grow'); }
  // street trees along the main avenues
  for (const road of [CITY_ROADS[1], CITY_ROADS[4]]) {
    const rr = makeRoad(road.pts, { width: road.width, color: '#000' });
    for (let k = 1; k < Math.floor(rr.length / 9); k++) { const p = rr.sample((k * 9) / rr.length); const t = tree(r, 'round', 0.7); t.position.set(p.x, groundY(p.x, p.z), p.z + 4.2); b.add(t, 0.6 + k * 0.01, 0.9, 'grow'); }
  }
  return { build: b };
}

export function bridge2(): Made {
  const b = new Build('bridge2', 18, 46, 3.4);
  const A = new THREE.Vector3(0, 0, 46), B = new THREE.Vector3(36, 0, 46);
  const y0 = 2.3, L = 36;
  const deckM = mat('#4a4f57', { rough: 0.85 }), steel = mat('#eef1f4', { rough: 0.3, metal: 0.3 }), cable = mat('#f3f5f7', { rough: 0.4, metal: 0.3 });
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const x = A.x + (i + 0.5) * (L / segs), s = new THREE.Group();
    s.add(box(L / segs + 0.02, 0.8, 8, mat('#c9c3b6', { rough: 0.9 }), x, -0.6, 46), box(L / segs + 0.02, 0.12, 6, deckM, x, 0.22, 46), box(L / segs + 0.02, 0.5, 0.3, steel, x, 0.2, 49.6), box(L / segs + 0.02, 0.5, 0.3, steel, x, 0.2, 42.4));
    s.position.y = y0; b.add(s, i * 0.03, 0.2 + i * 0.03, 'rise');
  }
  // single tall pylon with fanned stay cables (like a cable-stayed river crossing)
  const px = 22;
  b.add(box(2.2, 20, 2.2, steel, px, y0, 42.2), 0.4, 0.65, 'rise');
  b.add(box(2.2, 20, 2.2, steel, px, y0, 49.8), 0.4, 0.65, 'rise');
  b.add(box(2.2, 1.6, 9.8, steel, px, y0 + 18.4, 46), 0.62, 0.72, 'drop');
  for (let i = 0; i < 8; i++) for (const dir of [-1, 1]) for (const dz of [-3.6, 3.6]) {
    const dx = px + dir * (4 + i * 1.9);
    if (dx < A.x || dx > B.x) continue;
    b.add(rod(new THREE.Vector3(px, y0 + 17.8 - i * 0.7, 46 + dz * 1.2), new THREE.Vector3(dx, y0 + 0.5, 46 + dz), 0.08, cable, 4), 0.72 + i * 0.025, 0.95, 'rise');
  }
  const rd1 = makeRoad([[-8, 46], [0, 46]], { width: 5, color: '#454a52', edge: '#bdb8ad' }), rd2 = makeRoad([[36, 46], [44, 44], [52, 42]], { width: 5, color: '#454a52', edge: '#bdb8ad' });
  for (const rd of [rd1, rd2]) { b.add(rd.group, 0.2, 0.5, 'none'); b.hooks.push((t) => rd.setProgress((t - 0.2) / 0.3)); }
  return { build: b };
}

export function skyline(): Made {
  const b = new Build('skyline', 52, -40, 3.8);
  const styles: TowerStyle[] = ['slab', 'round', 'stepped', 'crown', 'twin', 'slab', 'round'];
  const hs = [34, 52, 44, 58, 38, 48, 30];
  for (let i = 0; i < 7; i++) tower(b, 30 + i * 8.2, -40.5, 7 + (i % 3), 7 + ((i + 1) % 3), hs[i], 600 + i * 17, styles[i], i * 0.1, 0.35 + i * 0.09, i % 2 ? GLASS : [...GLASS, ...CONCRETE]);
  const r = rng(12);
  for (let i = 0; i < 7; i++) tower(b, 33 + i * 7.6, 4 + (i % 2) * 6, 6, 6, 8 + Math.floor(r() * 8), 700 + i * 5, 'slab', 0.45 + i * 0.05, 0.8 + i * 0.03, CONCRETE);
  return { build: b };
}

export function airport2(): Made {
  const b = new Build('airport2', -66, -24, 3.6);
  const gy = groundY(-66, -24);
  const glass = mat('#9cc7e0', { rough: 0.1, metal: 0.3, emissive: '#6aa8cc', ei: 0.25 }), white = mat('#f2f4f7', { rough: 0.4 });
  // long concourse with gates and jet bridges
  b.add(box(5, 4, 34, mat('#e6ebef', { rough: 0.5 }), -70, gy, -28), 0.05, 0.4, 'rise');
  b.add(box(5.6, 0.5, 34.6, mat('#7a8a9a', { metal: 0.3 }), -70, gy + 4, -28), 0.35, 0.55, 'drop');
  b.add(box(2.4, 3.4, 33, glass, -67.2, gy + 0.4, -28), 0.3, 0.5, 'rise');
  for (let i = 0; i < 4; i++) b.add(box(7, 1.8, 1.8, white, -63.5, gy + 2, -39 + i * 7.5), 0.45 + i * 0.05, 0.65 + i * 0.05, 'rise');
  b.add(box(30, 0.22, 14, mat('#555a62', { rough: 1 }), -54, gy - 0.02, -33), 0.1, 0.3, 'rise');
  // parking structure + radar on the tower
  b.add(facade(14, 9, 10, '#d9d6cd', 1, -44, gy + 0.2, -10), 0.5, 0.8, 'rise');
  b.add(box(14.6, 0.5, 10.6, mat('#8a8f97'), -44, gy + 9.2, -10), 0.75, 0.9, 'drop');
  const dish = cyl(2.2, 0.3, 0.5, 14, mat('#e4e8ec', { metal: 0.3 }), -48, gy + 16.5, -17); dish.rotation.x = -0.5; b.add(dish, 0.8, 1, 'pop');
  // widened apron markings
  for (let i = 0; i < 6; i++) b.add(box(0.4, 0.05, 6, mat('#ffd23f'), -76 + i * 6, gy + 0.2, -33), 0.7 + i * 0.03, 0.9, 'pop');
  return { build: b };
}

export const COAST_Z = (x: number) => 56 + 5 * Math.sin(x * 0.06) + 3 * Math.sin(x * 0.17);
export function waterfront(): Made {
  const b = new Build('waterfront', -8, 52, 3.2);
  const pts: [number, number][] = [];
  for (let x = -52; x <= 40; x += 8) pts.push([x, COAST_Z(x) - 5]);
  const walk = makeRoad(pts, { width: 4, color: '#c9a574', edge: '#8a6a44', lift: 0.25 });
  b.add(walk.group, 0, 0.5, 'none'); b.hooks.push((t) => walk.setProgress(t / 0.5));
  const r = rng(31);
  const post = mat('#f4f1ea', { rough: 0.7 });
  for (let k = 1; k < Math.floor(walk.length / 5); k++) {
    const u = (k * 5) / walk.length, p = walk.sample(u), q = walk.sample(Math.min(1, u + 0.01));
    const nx = -(q.z - p.z), nz = q.x - p.x, l = Math.hypot(nx, nz) || 1;
    const sx = p.x + (nx / l) * 2.3, sz = p.z + (nz / l) * 2.3;
    b.add(cyl(0.07, 0.07, 1.0, 5, post, sx, p.y + 0.1, sz), 0.2 + u * 0.4, 0.4 + u * 0.4, 'rise');
    if (k % 3 === 0) lamp(b, p.x - (nx / l) * 2.3, p.z - (nz / l) * 2.3, 0.3 + u * 0.4, 0.5 + u * 0.4);
    if (k % 4 === 2) { const t = tree(r, 'poplar', 0.9); t.position.set(p.x - (nx / l) * 3.6, groundY(p.x, p.z), p.z - (nz / l) * 3.6); b.add(t, 0.4 + u * 0.4, 0.7 + u * 0.3, 'grow'); }
  }
  // lighthouse with a rotating beam
  const lx = -10, lz = COAST_Z(-10) + 1.5;
  b.add(cyl(5, 6, 1.2, 14, mat('#9a948a', { rough: 1 }), lx, -0.3, lz), 0.3, 0.5, 'rise');
  for (let i = 0; i < 4; i++) b.add(cyl(1.6 - i * 0.15, 1.8 - i * 0.15, 3.2, 14, mat(i % 2 ? '#e5484d' : '#fff7ea', { rough: 0.6 }), lx, 0.8 + i * 3.2, lz), 0.4 + i * 0.07, 0.6 + i * 0.07, 'rise');
  b.add(cyl(1.8, 1.8, 1.8, 14, mat('#fff2b0', { emissive: '#ffe080', ei: 1.1, rough: 0.2 }), lx, 13.6, lz), 0.7, 0.85, 'pop');
  b.add(cone(2.2, 1.8, 14, mat('#e5484d'), lx, 15.4, lz), 0.8, 0.95, 'drop');
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 26, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  const pivot = new THREE.Group(); beam.rotation.z = Math.PI / 2; beam.position.x = 14; pivot.add(beam); pivot.position.set(lx, 14.5, lz);
  b.add(pivot, 0.85, 1, 'pop', true);
  const live: Live = { update(dt) { pivot.rotation.y += dt * 0.7; } };
  return { build: b, live };
}

/** Night illumination: extra street lamps, glowing landmarks, string lights on the waterfront. Windows glow from the shared night value. */
export function lights(): Made {
  const b = new Build('lights', 20, 0, 3);
  CITY_ROADS.forEach((d, i) => {
    const rd = makeRoad(d.pts, { width: d.width, color: '#000' });
    for (let k = 0; k < Math.floor(rd.length / 14); k++) {
      const u = (k * 14 + 7) / rd.length, p = rd.sample(u), q = rd.sample(Math.min(1, u + 0.01));
      const nx = -(q.z - p.z), nz = q.x - p.x, l = Math.hypot(nx, nz) || 1, side = k % 2 ? -1 : 1;
      lamp(b, p.x + (nx / l) * side * (d.width / 2 + 1.2), p.z + (nz / l) * side * (d.width / 2 + 1.2), 0.1 + (i / CITY_ROADS.length) * 0.5 + u * 0.2, 0.4 + (i / CITY_ROADS.length) * 0.5 + u * 0.2);
    }
  });
  const warm = mat('#fff0b0', { emissive: '#ffd070', ei: 1.1 });
  for (let i = 0; i < 40; i++) {
    const x = -50 + i * 2.4, z = COAST_Z(x) - 3.4;
    b.add(ball(0.22, i % 3 ? warm : mat('#ffb0d0', { emissive: '#ff8ab8', ei: 1.0 }), x, groundY(x, z) + 3.2 + Math.sin(i) * 0.3, z, 0), 0.2 + i * 0.01, 0.4 + i * 0.01, 'pop');
  }
  // uplights on the landmark tower and the stadium
  for (const [x, z, h] of [[70, -30, 48], [77, -9, 10]] as const) { const c = cone(2.4, h * 0.3, 10, new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending }), x, groundY(x, z), z); b.add(c, 0.5, 0.9, 'grow'); }
  return { build: b };
}
