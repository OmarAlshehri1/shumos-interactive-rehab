import * as THREE from 'three';
import { Build, ball, box, cone, cyl, facade, gable, mat, rng, tree, flowers } from './kit';
import { makeRoad } from './roads';
import { groundY } from './terrain';
import { CITY_ROADS } from './layout';
import { apartment, BRICK, CONCRETE, PASTEL, SAND } from './towers';
import { house, type Made, type Live } from './builders1';

const ASPHALT = { color: '#454a52', edge: '#bdb8ad', line: '#f3e7b0' };

export function lamp(b: Build, x: number, z: number, a: number, e: number) {
  const g = new THREE.Group();
  g.add(cyl(0.09, 0.12, 4.2, 6, mat('#3b3f46', { metal: 0.4 })), box(1.1, 0.14, 0.3, mat('#3b3f46'), 0.4, 4.1, 0), box(0.5, 0.12, 0.28, mat('#fff3c0', { emissive: '#ffd070', ei: 0.7 }), 0.7, 4.0, 0));
  g.position.set(x, groundY(x, z), z);
  b.add(g, a, e, 'pop');
}

export function roads(): Made {
  const b = new Build('roads', 20, 0, 3.4);
  const list = CITY_ROADS;
  const rds = list.map((d, i) => {
    const road = makeRoad(d.pts, { width: d.width, ...ASPHALT });
    const a = (i / list.length) * 0.8, e = a + 0.2;
    b.add(road.group, a, e, 'none');
    b.hooks.push((t) => road.setProgress((t - a) / (e - a)));
    // lamps along each road, popping in behind the extending asphalt
    for (let k = 1; k < Math.floor(road.length / 14); k++) {
      const u = (k * 14) / road.length, p = road.sample(u), q = road.sample(Math.min(1, u + 0.01));
      const nx = -(q.z - p.z), nz = q.x - p.x, l = Math.hypot(nx, nz) || 1, side = k % 2 ? 1 : -1;
      lamp(b, p.x + (nx / l) * side * (d.width / 2 + 1.2), p.z + (nz / l) * side * (d.width / 2 + 1.2), e - 0.05 + u * 0.1, Math.min(1, e + u * 0.1));
    }
    return road;
  });
  return { build: b, roads: rds };
}

export function apartments(): Made {
  const b = new Build('apartments', -18, -32);
  const spec: [number, number, number, number, number][] = [[-38, -33, 9, 8, 15], [-27, -33, 8, 8, 20], [-16, -34, 10, 8, 13], [-5, -33, 8, 8, 24], [5, -33, 9, 8, 17], [35, -13, 9, 9, 16], [35, -3, 9, 8, 21]];
  spec.forEach(([x, z, w, d, h], i) => apartment(b, x, z, w, d, h, 100 + i * 7, i * 0.1, 0.35 + i * 0.1));
  return { build: b };
}

export function school(): Made {
  const b = new Build('school', -32, -17);
  const gy = groundY(-32, -17);
  const wall = '#f3d9a0', roof = mat('#b84a3a');
  b.add(box(26, 0.3, 14, mat('#c9c3b6', { rough: 1 }), -32, gy - 0.05, -17), 0, 0.15, 'rise');
  b.add(facade(18, 7, 8, wall, 1, -35, gy + 0.2, -19), 0.1, 0.45, 'rise');
  b.add(facade(8, 7, 14, wall, 2, -22, gy + 0.2, -17), 0.2, 0.55, 'rise');
  b.add(gable(18, 8, 2.6, roof, -35, gy + 7.2, -19, 0, 0.5), 0.5, 0.75, 'drop');
  b.add(gable(14, 8, 2.6, roof, -22, gy + 7.2, -17, Math.PI / 2, 0.5), 0.55, 0.8, 'drop');
  // clock tower on the entrance
  b.add(box(3.4, 6, 3.4, mat('#f0e2c0'), -35, gy + 7.2, -14.4), 0.6, 0.8, 'rise');
  const clock = ball(1.1, mat('#fffaf0', { rough: 0.3 }), -35, gy + 11.4, -14.4, 1); clock.scale.set(1, 1, 0.3); b.add(clock, 0.78, 0.9, 'pop');
  b.add(cone(2.6, 3, 4, mat('#b84a3a'), -35, gy + 13.2, -14.4, Math.PI / 4), 0.82, 0.95, 'drop');
  // yard: sports court + flagpole + trees
  b.add(box(10, 0.1, 6, mat('#3f8a5a', { rough: 0.9 }), -42, gy + 0.05, -9), 0.7, 0.85, 'rise');
  b.add(box(10, 0.12, 0.2, mat('#fff'), -42, gy + 0.16, -9), 0.8, 0.9, 'rise');
  b.add(cyl(0.1, 0.12, 8, 6, mat('#cfd6dd', { metal: 0.5 }), -28, gy, -10), 0.75, 0.9, 'rise');
  b.add(box(1.6, 1, 0.05, mat('#e5484d'), -27.2, gy + 6.8, -10), 0.9, 1, 'pop');
  const r = rng(9);
  for (let i = 0; i < 4; i++) { const t = tree(r, 'round', 0.9); t.position.set(-46 + i * 4, groundY(-46, -22), -23); b.add(t, 0.8 + i * 0.04, 1, 'grow'); }
  return { build: b };
}

export function hospital(): Made {
  const b = new Build('hospital', -4, -16);
  const gy = groundY(-4, -16);
  b.add(box(24, 0.3, 16, mat('#d7d2c6', { rough: 1 }), -4, gy - 0.05, -16), 0, 0.15, 'rise');
  b.add(facade(16, 14, 9, '#f2f5f7', 0, -4, gy + 0.2, -17), 0.1, 0.55, 'rise');
  b.add(facade(7, 9, 13, '#e6eef3', 1, 6, gy + 0.2, -15), 0.25, 0.65, 'rise');
  b.add(box(16.6, 0.6, 9.6, mat('#9aa7b3'), -4, gy + 14.2, -17), 0.55, 0.7, 'drop');
  // red cross sign and helipad on the roof
  const cross = new THREE.Group(); cross.add(box(3.4, 0.4, 0.8, mat('#e5484d', { emissive: '#e5484d', ei: 0.3 }), 0, 0, 0), box(0.8, 0.4, 3.4, mat('#e5484d', { emissive: '#e5484d', ei: 0.3 }), 0, 0, 0));
  const sign = box(4.2, 4.2, 0.3, mat('#fff'), 0, 0, 0); const board = new THREE.Group(); board.add(sign); const cr = cross.clone(); cr.rotation.x = Math.PI / 2; cr.position.set(0, 2.1, 0.2); board.add(cr);
  board.position.set(-4, gy + 8.6, -12.4); b.add(board, 0.7, 0.85, 'pop');
  const pad = cyl(2.8, 2.8, 0.25, 20, mat('#4a5058'), 6, gy + 9.2, -15); b.add(pad, 0.7, 0.85, 'drop');
  b.add(box(2.4, 0.05, 0.5, mat('#fff'), 6, gy + 9.5, -15), 0.8, 0.9, 'pop');
  // ambulance bay
  const amb = new THREE.Group(); amb.add(box(3.6, 1.6, 1.8, mat('#fff'), 0, 0.3, 0), box(1.2, 1.1, 1.8, mat('#fff'), 1.8, 0.3, 0), box(3.6, 0.3, 1.82, mat('#e5484d'), 0, 0.9, 0));
  amb.position.set(-8, gy + 0.2, -9); b.add(amb, 0.8, 0.95, 'pop');
  return { build: b };
}

export function mall(): Made {
  const b = new Build('mall', 50, -12);
  const gy = groundY(50, -12);
  b.add(box(30, 0.3, 22, mat('#8a8f97', { rough: 1 }), 50, gy - 0.05, -12), 0, 0.15, 'rise');
  b.add(facade(22, 8, 11, '#e9d8b8', 2, 50, gy + 0.2, -16), 0.1, 0.5, 'rise');
  b.add(box(22.6, 0.6, 11.6, mat('#7a828c'), 50, gy + 8.2, -16), 0.5, 0.65, 'drop');
  // glass entrance atrium with a coloured sign
  b.add(box(9, 7, 4, mat('#9cc7e0', { rough: 0.1, metal: 0.3, emissive: '#6aa8cc', ei: 0.15 }), 50, gy + 0.2, -9.5), 0.4, 0.7, 'rise');
  b.add(box(9.6, 0.5, 4.6, mat('#e5484d'), 50, gy + 7.2, -9.5), 0.65, 0.8, 'drop');
  b.add(box(6.4, 1.6, 0.3, mat('#ffd23f', { emissive: '#ffd23f', ei: 0.25 }), 50, gy + 8.4, -7.2), 0.75, 0.9, 'pop');
  const cols = ['#e5484d', '#3b7dd8', '#f2a93b', '#4cc27a', '#fff', '#8a8f97'];
  const r = rng(3);
  for (let i = 0; i < 14; i++) { const c = new THREE.Group(); c.add(box(2.0, 0.7, 1.0, mat(cols[Math.floor(r() * 6)], { rough: 0.5 }), 0, 0.2, 0), box(1.1, 0.55, 0.95, mat('#9cc7e0', { rough: 0.2 }), 0, 0.85, 0)); c.position.set(37 + (i % 7) * 3.6, gy + 0.1, -4 + Math.floor(i / 7) * 3.6); b.add(c, 0.6 + i * 0.02, 0.85, 'pop'); }
  for (let i = 0; i < 5; i++) { const t = tree(r, 'round', 0.7); t.position.set(37 + i * 6, gy, -0.5 + 6.5); b.add(t, 0.8, 1, 'grow'); }
  return { build: b };
}

export function park(): Made {
  const b = new Build('park', 34, 28, 3);
  const r = rng(61);
  const gy = groundY(34, 28);
  b.add(cyl(11, 11, 0.3, 36, mat('#7bd05a', { rough: 1 }), 34, gy - 0.1, 28), 0, 0.2, 'rise');
  const pond = cyl(4.2, 4.2, 0.12, 28, mat('#58c8e8', { rough: 0.05, metal: 0.1, emissive: '#2a8fb8', ei: 0.3 }), 36, gy + 0.22, 30); pond.scale.set(1.4, 1, 1); b.add(pond, 0.15, 0.4, 'rise');
  const path = makeRoad([[24, 28], [30, 24], [36, 22], [42, 26], [44, 32]], { width: 1.8, color: '#e4d8bd', lift: 0.2 });
  b.add(path.group, 0.2, 0.6, 'none'); b.hooks.push((t) => path.setProgress((t - 0.2) / 0.4));
  for (let i = 0; i < 16; i++) { const a = r() * 6.28, d = 5 + r() * 5; const t = tree(r, i % 4 === 0 ? 'blossom' : 'round', 1.05); t.position.set(34 + Math.cos(a) * d, groundY(34, 28), 28 + Math.sin(a) * d * 0.9); b.add(t, 0.3 + i * 0.03, 0.75 + i * 0.02, 'grow'); }
  const gaz = new THREE.Group(); gaz.add(cyl(2.2, 2.2, 0.3, 8, mat('#e8e0d0')), ...[0, 1, 2, 3, 4, 5].map((i) => cyl(0.1, 0.1, 2.6, 5, mat('#f6f1e6'), Math.cos((i / 6) * 6.28) * 1.9, 0.3, Math.sin((i / 6) * 6.28) * 1.9)), cone(2.8, 1.6, 8, mat('#c0563f'), 0, 2.9, 0));
  gaz.position.set(30, gy, 32); b.add(gaz, 0.7, 0.95, 'rise');
  for (let i = 0; i < 6; i++) { const f = flowers(r, 14, 1.4); f.position.set(26 + i * 3.4, gy, 22 + (i % 2) * 14); b.add(f, 0.75 + i * 0.03, 1, 'grow'); }
  return { build: b };
}

/** Arched bridge from the village bank to downtown; the deck assembles segment by segment. */
export function bridge(): Made {
  const b = new Build('bridge', 25, 10, 3.2);
  const A = new THREE.Vector3(10, 0, 11), B = new THREE.Vector3(40, 0, 9.4);
  const L = A.distanceTo(B), ang = -Math.atan2(B.z - A.z, B.x - A.x), mid = A.clone().add(B).multiplyScalar(0.5);
  const y0 = 2.2;
  const pv = (o: THREE.Object3D) => { const g = new THREE.Group(); g.position.set(mid.x, y0, mid.z); g.rotation.y = ang; g.add(o); return g; };
  const deckM = mat('#4a4f57', { rough: 0.85 }), steel = mat('#d9dee3', { rough: 0.4, metal: 0.4 }), red = mat('#d94a3a', { rough: 0.5, metal: 0.2 });
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const x = -L / 2 + (i + 0.5) * (L / segs);
    const s = new THREE.Group();
    s.add(box(L / segs + 0.02, 0.9, 8, mat('#b9b3a6', { rough: 0.9 }), x, -0.7, 0), box(L / segs + 0.02, 0.12, 5.6, deckM, x, 0.22, 0), box(L / segs + 0.02, 0.6, 0.35, steel, x, 0.2, 3.9), box(L / segs + 0.02, 0.6, 0.35, steel, x, 0.2, -3.9));
    b.add(pv(s), i * 0.04, 0.2 + i * 0.04, 'rise');
  }
  // steel arches with hangers
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push(new THREE.Vector3(-L / 2 + 2 + u * (L - 4), 0.6 + Math.sin(u * Math.PI) * 8.5, side * 3.9)); }
    const arch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.38, 8), red);
    arch.castShadow = true;
    b.add(pv(arch), 0.55, 0.8, 'pop');
    for (let i = 1; i < 16; i += 1) { const p = pts[i]; const hgt = p.y - 0.4; b.add(pv(cyl(0.07, 0.07, hgt, 4, steel, p.x, 0.4, side * 3.9)), 0.7 + i * 0.012, 0.9, 'rise'); }
  }
  // abutment towers
  for (const sx of [-1, 1]) b.add(pv(box(2.2, 3, 8.6, mat('#c9c3b6'), sx * (L / 2 - 1), -1.6, 0)), 0.1, 0.3, 'rise');
  return { build: b };
}

export function port(): Made {
  const b = new Build('port', 66, 44, 3.2);
  const r = rng(17);
  const gy = groundY(66, 40);
  b.add(box(44, 1.8, 12, mat('#a7a49c', { rough: 1 }), 66, -0.4, 47), 0, 0.2, 'rise');
  for (const px of [54, 72]) b.add(box(5, 1.1, 14, mat('#9a948a', { rough: 1 }), px, -0.1, 59), 0.15, 0.35, 'rise');
  b.add(box(30, 0.2, 12, mat('#6e7279', { rough: 1 }), 66, gy + 0.05, 36), 0.1, 0.25, 'rise');
  const cols = ['#e5484d', '#3b7dd8', '#f2a93b', '#4cc27a', '#c9ced3', '#8a5ac8'];
  for (let i = 0; i < 22; i++) {
    const x = 52 + (i % 11) * 2.9, z = 34.5 + Math.floor(i / 11) * 2.8, st = 1 + Math.floor(r() * 3);
    for (let k = 0; k < st; k++) b.add(box(2.6, 1.15, 2.4, mat(cols[Math.floor(r() * 6)], { rough: 0.6 }), x, gy + 0.2 + k * 1.15, z), 0.3 + i * 0.015 + k * 0.05, 0.55 + i * 0.015 + k * 0.05, 'pop');
  }
  // gantry cranes at the quay edge
  [58, 76].forEach((cx, i) => {
    const c = new THREE.Group(), st = mat('#e8523a', { rough: 0.5, metal: 0.25 });
    for (const dx of [-3, 3]) for (const dz of [-1.6, 1.6]) c.add(box(0.5, 13, 0.5, st, dx, 0, dz));
    c.add(box(7, 0.8, 4.2, st, 0, 13, 0), box(0.6, 0.6, 22, st, -2.4, 13.6, 7), box(0.6, 0.6, 22, st, 2.4, 13.6, 7), box(2.6, 2, 2.6, mat('#3b4a5a'), 0, 11.4, 0));
    c.position.set(cx, 1.3, 51.5); b.add(c, 0.4 + i * 0.12, 0.8 + i * 0.1, 'rise');
  });
  b.add(facade(18, 6, 8, '#d8d3c6', 0, 78, gy + 0.2, 33), 0.55, 0.8, 'rise');
  b.add(gable(18, 8, 2, mat('#7a828c'), 78, gy + 6.2, 33, 0, 0.4), 0.78, 0.95, 'drop');
  return { build: b };
}

export function districts(): Made {
  const b = new Build('districts', -88, 14, 3.6);
  const r = rng(808);
  let n = 0;
  for (const z of [3, 25]) for (let i = 0; i < 6; i++) {
    const x = -104 + i * 8.6;
    const k = (n % 3) as 0 | 1 | 2;
    house(b, x, z, z < 14 ? 0 : Math.PI, 500 + n * 13, k === 2 ? 0 : k, (n / 12) * 0.7, 0.3 + (n / 12) * 0.7);
    n++;
  }
  for (let i = 0; i < 4; i++) apartment(b, -100 + i * 11, 36, 8, 7, 12 + Math.floor(r() * 8), 900 + i, 0.5 + i * 0.1, 0.85 + i * 0.05, Math.PI);
  const rd = makeRoad([[-60, 14], [-74, 14], [-88, 14], [-102, 14]], { width: 5, ...ASPHALT });
  void rd;
  for (let i = 0; i < 10; i++) { const t = tree(r, 'round', 1); t.position.set(-106 + i * 5, groundY(-106, 14), 14 + (i % 2 ? 4 : -4)); b.add(t, 0.2 + i * 0.05, 0.6 + i * 0.05, 'grow'); }
  return { build: b };
}

export function airport(): Made {
  const b = new Build('airport', -70, -26, 3.6);
  const gy = groundY(-70, -26);
  const asphalt = mat('#3d4148', { rough: 0.95 });
  // runway + taxiway + markings
  const rw = box(66, 0.25, 7, asphalt, -71, gy - 0.02, -36);
  b.add(rw, 0, 0.3, 'rise');
  b.add(box(66, 0.25, 3.4, asphalt, -71, gy - 0.02, -30), 0.05, 0.3, 'rise');
  for (let i = 0; i < 14; i++) b.add(box(2.6, 0.06, 0.4, mat('#fff'), -100 + i * 4.6, gy + 0.25, -36), 0.15 + i * 0.01, 0.4, 'pop');
  const lightsM = mat('#ffe9a8', { emissive: '#ffd070', ei: 0.9 });
  for (let i = 0; i < 28; i++) for (const s of [-1, 1]) b.add(box(0.35, 0.3, 0.35, lightsM, -103 + i * 2.4, gy + 0.2, -36 + s * 3.7), 0.7 + i * 0.008, 0.9 + i * 0.003, 'pop');
  // apron, terminal, tower, hangars
  b.add(box(34, 0.22, 10, mat('#555a62', { rough: 1 }), -62, gy - 0.02, -24.5), 0.2, 0.4, 'rise');
  b.add(facade(24, 6, 8, '#dfe6ec', 0, -62, gy + 0.2, -17), 0.3, 0.6, 'rise');
  const roof = box(26, 0.7, 10, mat('#7a8a9a', { rough: 0.4, metal: 0.3 }), -62, gy + 6.2, -17); roof.rotation.z = 0.0; b.add(roof, 0.55, 0.72, 'drop');
  b.add(box(8, 3, 3, mat('#9cc7e0', { rough: 0.1, emissive: '#6aa8cc', ei: 0.2 }), -62, gy + 0.2, -22), 0.45, 0.65, 'rise');
  b.add(cyl(1.3, 1.6, 12, 12, mat('#e9e4d8'), -48, gy, -17), 0.4, 0.7, 'rise');
  b.add(cyl(2.6, 2.0, 2.2, 12, mat('#9cc7e0', { rough: 0.1, emissive: '#6aa8cc', ei: 0.3 }), -48, gy + 12, -17), 0.68, 0.82, 'drop');
  b.add(cone(2.8, 1.6, 12, mat('#c0563f'), -48, gy + 14.2, -17), 0.8, 0.92, 'drop');
  for (let i = 0; i < 3; i++) { b.add(box(10, 5, 9, mat('#c9d1d8', { rough: 0.5, metal: 0.2 }), -90 + i * 11, gy, -22), 0.5 + i * 0.05, 0.75 + i * 0.05, 'rise'); b.add(box(10.6, 0.5, 9.6, mat('#7a8a9a'), -90 + i * 11, gy + 5, -22), 0.7 + i * 0.05, 0.85 + i * 0.04, 'drop'); }
  return { build: b };
}

export function clocktower(): Made {
  const b = new Build('clocktower', -20, -6);
  const gy = groundY(-20, -6);
  const stone = mat('#e9dcc0', { rough: 0.85 });
  b.add(cyl(8, 8, 0.3, 28, mat('#d6cfc0', { rough: 1 }), -20, gy - 0.05, -6), 0, 0.15, 'rise');
  // city hall
  b.add(box(18, 5, 7, stone, -20, gy + 0.2, -2), 0.1, 0.45, 'rise');
  for (let i = 0; i < 6; i++) b.add(cyl(0.45, 0.5, 4.4, 10, mat('#fff7e6'), -26 + i * 2.4, gy + 0.3, 1.8), 0.35 + i * 0.03, 0.55, 'rise');
  b.add(gable(18, 7, 2.2, mat('#7a8a9a'), -20, gy + 5.2, -2, 0, 0.5), 0.5, 0.7, 'drop');
  // tower with a real clock face
  b.add(box(4.4, 12, 4.4, stone, -20, gy + 0.2, -4), 0.2, 0.6, 'rise');
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.strokeStyle = '#6a4a30'; g.lineWidth = 10; g.stroke();
  g.fillStyle = '#3b3b40'; for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; g.fillRect(128 + Math.sin(a) * 96 - 5, 128 - Math.cos(a) * 96 - 5, 10, 10); }
  g.lineWidth = 9; g.lineCap = 'round'; g.strokeStyle = '#2a2a30'; g.beginPath(); g.moveTo(128, 128); g.lineTo(128, 60); g.stroke(); g.beginPath(); g.moveTo(128, 128); g.lineTo(170, 150); g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  const face2 = face.clone(); face.position.set(-20, gy + 10.4, -1.75); face2.position.set(-17.75, gy + 10.4, -4); face2.rotation.y = Math.PI / 2;
  b.add(face, 0.55, 0.7, 'pop'); b.add(face2, 0.55, 0.7, 'pop');
  b.add(cone(3.4, 6, 4, mat('#4f7096', { rough: 0.5 }), -20, gy + 12.2, -4, Math.PI / 4), 0.65, 0.9, 'drop');
  b.add(ball(0.5, mat('#ffd23f', { metal: 0.5, rough: 0.3 }), -20, gy + 18, -4, 1), 0.85, 1, 'pop');
  return { build: b };
}

const _l: Live = { update() {} };
void _l; void BRICK; void CONCRETE; void PASTEL; void SAND;
