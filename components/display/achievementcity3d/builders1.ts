import * as THREE from 'three';
import { Build, ball, box, bush, cone, cyl, flowers, gable, mat, pyramid, rng, tree, leaf } from './kit';
import { makeRoad, type Road } from './roads';
import { groundY } from './terrain';
import { VILLAGE_PATH } from './layout';

const WALLS = ['#f4e2c6', '#ecd5b0', '#f6ecdc', '#dfe9cc', '#f0d6c8', '#e3dcc8'];
const ROOFS = ['#c4583f', '#b84a3a', '#8d5a44', '#4f7096', '#a8483c', '#6a5a8a'];
const STONE = '#b9b2a4';

export interface Live { update(dt: number, t: number): void }
export interface Made { build: Build; live?: Live; roads?: Road[]; windows?: boolean }

/** A cottage / house. kind: 0 cottage, 1 two-storey, 2 L-shaped. Parts rise: plinth, walls, roof (drops in), details pop in. */
export function house(b: Build, x: number, z: number, rot: number, seed: number, kind = 0, a = 0, e = 1) {
  const r = rng(seed);
  const wall = mat(WALLS[Math.floor(r() * WALLS.length)], { rough: 0.9 });
  const roofC = ROOFS[Math.floor(r() * ROOFS.length)];
  const roof = mat(roofC, { rough: 0.8 });
  const trim = mat('#fbf6ea', { rough: 0.7 });
  const wood = mat('#7a4e2f', { rough: 0.8 });
  const glass = mat('#7fb8d8', { rough: 0.15, metal: 0.2, emissive: '#ffd890', ei: 0 });
  const gy = groundY(x, z);
  const W = kind === 1 ? 5.4 : 5.0, D = kind === 1 ? 5.0 : 4.2, H = kind === 1 ? 5.4 : 3.1;
  const root = new THREE.Group();
  root.position.set(x, gy, z);
  root.rotation.y = rot;
  const span = e - a;
  const t = (f: number) => a + span * f;
  const plinth = box(W + 0.5, 0.9 + 0.8, D + 0.5, mat(STONE, { rough: 1 }), 0, -0.8, 0);
  const walls = box(W, H, D, wall, 0, 0.1, 0);
  const wallParts: THREE.Object3D[] = [walls];
  if (kind === 2) wallParts.push(box(3.2, H - 0.3, 4.6, wall, W / 2 - 0.2, 0.1, D / 2 + 1.0));
  const roofs: THREE.Object3D[] = [gable(W, D, 2.2 + (kind === 1 ? 0.6 : 0), roof, 0, H + 0.1, 0, 0)];
  if (kind === 2) roofs.push(gable(3.2, 4.6, 1.9, roof, W / 2 - 0.2, H - 0.2, D / 2 + 1.0, Math.PI / 2, 0.3));
  const details: THREE.Object3D[] = [];
  details.push(box(0.9, 1.9, 0.15, wood, -0.8, 0.1, D / 2 + 0.05));
  details.push(box(1.1, 0.12, 0.7, trim, -0.8, 2.1, D / 2 + 0.35));
  for (const sx of [1.4, -2.0]) {
    details.push(box(0.9, 0.95, 0.12, glass, sx + 0.1, 1.2, D / 2 + 0.04));
    details.push(box(1.15, 0.12, 0.2, trim, sx + 0.1, 0.95, D / 2 + 0.12));
    details.push(box(1.15, 0.12, 0.2, trim, sx + 0.1, 2.15, D / 2 + 0.12));
  }
  if (kind === 1) for (const sx of [-1.6, 0.4, 1.7]) details.push(box(0.9, 0.95, 0.12, glass, sx, 3.7, D / 2 + 0.04));
  details.push(box(0.7, 2.0, 0.7, mat('#a8503c', { rough: 0.9 }), W / 2 - 1.0, H + 0.4, -0.4)); // chimney
  const fb = box(1.3, 0.3, 0.3, wood, 1.5, 0.85, D / 2 + 0.25);
  details.push(fb);
  details.push(flowers(r, 6, 0.4).translateX(1.5).translateY(1.1).translateZ(D / 2 + 0.3));
  // simpler: parent each part to a pivot group at the house origin
  const pivot = () => { const p = new THREE.Group(); p.position.copy(root.position); p.rotation.y = rot; return p; };
  const mkPart = (o: THREE.Object3D, a0: number, a1: number, kind2: 'rise' | 'drop' | 'pop' | 'grow') => { const p = pivot(); p.add(o); b.add(p, a0, a1, kind2); return p; };
  mkPart(plinth, t(0), t(0.2), 'rise');
  wallParts.forEach((w, i) => mkPart(w, t(0.18 + i * 0.05), t(0.5 + i * 0.05), 'rise'));
  roofs.forEach((rf, i) => mkPart(rf, t(0.5 + i * 0.08), t(0.8 + i * 0.05), 'drop'));
  details.forEach((d, i) => mkPart(d, t(0.78 + (i % 6) * 0.025), t(0.95 + (i % 6) * 0.01), 'pop'));
  // picket fence around the little garden
  const fence = new THREE.Group();
  const fm = mat('#fff7ea', { rough: 0.7 });
  const fw = 3.6;
  for (let i = -3; i <= 3; i++) fence.add(box(0.14, 0.7, 0.1, fm, i * (fw / 3) * 0.5 - 0.4, 0, D / 2 + 2.6));
  fence.add(box(fw + 0.6, 0.1, 0.1, fm, -0.4, 0.4, D / 2 + 2.6));
  const fp = pivot(); fp.add(fence); b.add(fp, t(0.85), t(1), 'rise');
}

function dust(_b: Build) { void _b; }

// ============================== LEVEL 1 ======================================================================
export function cottage1(): Made {
  const b = new Build('cottage1', -36, 22);
  house(b, -36, 22, 0.35, 11, 0);
  return { build: b };
}

export function villagePath(): Made {
  const b = new Build('path', -20, 18);
  const road = makeRoad(VILLAGE_PATH, { width: 2.8, color: '#d9c08c', edge: '#a89268' });
  b.add(road.group, 0, 1, 'none');
  b.hooks.push((t) => road.setProgress(t));
  // stepping lamps along the path
  const lampM = mat('#3b3b40', { metal: 0.4 });
  const glow = mat('#fff2c0', { emissive: '#ffd070', ei: 0.6 });
  for (let i = 1; i < 6; i++) {
    const u = i / 6, p = road.sample(u), q = road.sample(Math.min(1, u + 0.02));
    const nx = -(q.z - p.z), nz = q.x - p.x, l = Math.hypot(nx, nz) || 1;
    const g = new THREE.Group();
    g.add(cyl(0.08, 0.1, 2.2, 6, lampM), ball(0.26, glow, 0, 2.15));
    g.position.set(p.x + (nx / l) * 1.9, p.y, p.z + (nz / l) * 1.9);
    b.add(g, 0.2 + u * 0.7, 0.4 + u * 0.6, 'pop');
  }
  return { build: b, roads: [road] };
}

export function cottage2(): Made {
  const b = new Build('cottage2', -18, 26);
  house(b, -18, 27, -0.5, 23, 2);
  return { build: b };
}

export function farm(): Made {
  const b = new Build('farm', -48, 2, 2.8);
  const r = rng(77);
  const soil = mat('#7a5a3c', { rough: 1 });
  const crops = [['#e2b94a', '#d9a93a'], ['#5cae4a', '#4a9a3c'], ['#9a6ac8', '#8a58b8']];
  for (let p = 0; p < 3; p++) {
    const z0 = -8 + p * 10;
    const gy = groundY(-50, z0);
    const plot = box(17, 0.35, 8, soil, -50, gy - 0.05, z0);
    b.add(plot, p * 0.1, p * 0.1 + 0.3, 'rise');
    for (let i = 0; i < 9; i++) {
      const c = crops[p][i % 2];
      const row = box(15, 0.6 + r() * 0.15, 0.55, mat(c, { rough: 0.8 }), -50, gy + 0.25, z0 - 3.2 + i * 0.8);
      b.add(row, 0.25 + p * 0.1 + i * 0.03, 0.55 + p * 0.1 + i * 0.03, 'rise');
    }
  }
  // barn
  const bx = -34, bz = -6, gy = groundY(bx, bz);
  const red = mat('#b3392e', { rough: 0.85 }), white = mat('#fff7ea', { rough: 0.7 });
  const pv = (o: THREE.Object3D) => { const g = new THREE.Group(); g.position.set(bx, gy, bz); g.rotation.y = -0.2; g.add(o); return g; };
  b.add(pv(box(8, 4.5, 6, red, 0, 0, 0)), 0.35, 0.65, 'rise');
  b.add(pv(gable(8, 6, 2.6, mat('#5a4a40', { rough: 0.8 }), 0, 4.5, 0, Math.PI / 2, 0.5)), 0.6, 0.85, 'drop');
  const trim = new THREE.Group(); trim.add(box(2.4, 3.2, 0.15, white, 0, 0, 3.05)); trim.add(box(0.15, 3.2, 0.2, red, 0, 0, 3.12)); trim.add(box(2.4, 0.15, 0.2, red, 0, 1.6, 3.12));
  b.add(pv(trim), 0.8, 0.92, 'pop');
  // silo
  const silo = new THREE.Group(); silo.add(cyl(1.4, 1.4, 6, 14, mat('#d8dde2', { rough: 0.6, metal: 0.2 })), ball(1.4, mat('#9aa4ae', { metal: 0.3 }), 0, 5.4, 0, 2));
  silo.position.set(bx + 6, groundY(bx + 6, bz), bz + 1);
  b.add(silo, 0.45, 0.75, 'rise');
  // hay bales
  for (let i = 0; i < 4; i++) {
    const h = cyl(0.8, 0.8, 1.1, 14, mat('#e6c35a', { rough: 1 }));
    h.rotation.z = Math.PI / 2; h.position.set(-27 + i * 1.5, groundY(-27, -2) + 0.8, -1 + (i % 2) * 1.4);
    b.add(h, 0.75 + i * 0.04, 0.95, 'pop');
  }
  // windmill: tower rises, blades are live
  const wx = -46, wz = 18, wy = groundY(wx, wz);
  const tower = cone(2.1, 8, 10, mat('#efe7d6', { rough: 0.8 }), wx, wy, wz);
  tower.scale.set(1, 1, 1);
  b.add(tower, 0.3, 0.7, 'rise');
  const cap = cone(2.3, 2, 10, mat('#8a5a44'), wx, wy + 7.6, wz);
  b.add(cap, 0.65, 0.85, 'drop');
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const arm = box(0.35, 6.4, 0.12, mat('#6a4a30'), 0, 0.2, 0);
    arm.rotation.z = (i * Math.PI) / 2;
    const sail = box(1.6, 4.4, 0.06, mat('#f7f1e4'), 0.9, 1.4, 0.08);
    const arm2 = new THREE.Group(); arm2.add(arm, sail); arm2.rotation.z = (i * Math.PI) / 2; blades.add(arm2);
  }
  blades.position.set(wx, wy + 7.4, wz + 2.4);
  b.add(blades, 0.8, 0.95, 'pop', true);
  // fence line
  const fm = mat('#9b7a54', { rough: 0.9 });
  for (let i = 0; i < 18; i++) b.add(box(0.2, 1.0, 0.2, fm, -59 + i * 1.0, groundY(-59, -14), -14), 0.5 + i * 0.01, 0.7 + i * 0.01, 'rise');
  const live: Live = { update(dt) { blades.rotation.z -= dt * 0.9; } };
  void dust;
  return { build: b, live };
}

export function garden(): Made {
  const b = new Build('garden', -26, 20, 2.6);
  const r = rng(404);
  const spots: [number, number, 'round' | 'pine' | 'poplar' | 'blossom'][] = [
    [-42, 14, 'round'], [-40, 28, 'blossom'], [-30, 30, 'round'], [-12, 18, 'blossom'], [-8, 8, 'round'], [-2, 18, 'poplar'], [-16, 36, 'round'],
    [-54, 22, 'pine'], [-52, 36, 'pine'], [-24, 4, 'round'], [-34, 10, 'blossom'], [-4, 30, 'round'], [4, 24, 'poplar'], [-58, 30, 'round'], [-20, 42, 'pine'],
  ];
  spots.forEach(([x, z, k], i) => {
    const t = tree(r, k, 1.05);
    t.position.set(x, groundY(x, z), z);
    b.add(t, i * 0.04, 0.28 + i * 0.04, 'grow');
  });
  const beds: [number, number][] = [[-33, 18], [-27, 28], [-13, 20], [-20, 22], [-9, 12], [-40, 24], [-26, 8], [-46, 12], [-6, 34]];
  beds.forEach(([x, z], i) => {
    const f = flowers(r, 18, 1.6);
    f.position.set(x, groundY(x, z), z);
    b.add(f, 0.3 + i * 0.05, 0.6 + i * 0.05, 'grow');
    const bs = bush(r, ['#4a9a38', '#58a842'][i % 2]);
    bs.position.set(x + 1.2, groundY(x, z), z - 1);
    b.add(bs, 0.35 + i * 0.05, 0.65 + i * 0.05, 'grow');
  });
  return { build: b };
}

export function market(): Made {
  const b = new Build('market', -10, 24);
  const gy = groundY(-10, 24);
  const slab = box(18, 0.25, 9, mat('#d6cfc0', { rough: 1 }), -10, gy - 0.05, 25);
  b.add(slab, 0, 0.2, 'rise');
  const colors: [string, string][] = [['#e5484d', '#fff7ea'], ['#2f9e6f', '#fff7ea'], ['#f2a93b', '#fff7ea'], ['#3b7dd8', '#fff7ea'], ['#c25bb8', '#fff7ea']];
  const fruit = ['#e5484d', '#f2a93b', '#8bd24a', '#f7d84a', '#c25bb8'];
  const r = rng(5);
  colors.forEach(([c1, c2], i) => {
    const x = -17 + i * 3.6, z = 22.5;
    const g = new THREE.Group();
    g.add(box(2.8, 1.05, 1.4, mat('#8a6a48', { rough: 0.9 }), 0, 0, 0));
    for (const sx of [-1.3, 1.3]) { g.add(cyl(0.07, 0.07, 2.6, 6, mat('#6a4a30'), sx, 0, -0.6)); g.add(cyl(0.07, 0.07, 2.2, 6, mat('#6a4a30'), sx, 0, 0.6)); }
    for (let k = 0; k < 6; k++) {
      const s = box(0.5, 0.06, 1.9, mat(k % 2 ? c2 : c1, { rough: 0.7 }), -1.25 + k * 0.5, 0, 0);
      s.position.y = 2.55 - 0.0; s.position.z = 0; s.rotation.x = -0.28; g.add(s);
    }
    for (let k = 0; k < 7; k++) g.add(ball(0.17, mat(fruit[(i + k) % 5], { rough: 0.5 }), -0.9 + k * 0.3, 1.05, ((k % 2) - 0.5) * 0.4, 0));
    g.position.set(x, gy + 0.2, z);
    g.rotation.y = r() * 0.1;
    b.add(g, 0.2 + i * 0.1, 0.55 + i * 0.1, 'rise');
  });
  // crates + banner
  for (let i = 0; i < 5; i++) b.add(box(0.9, 0.8, 0.9, mat('#a07a52', { rough: 0.95 }), -17 + i * 3.7, gy + 0.2, 25.5), 0.6 + i * 0.05, 0.8 + i * 0.05, 'pop');
  const flag = new THREE.Group();
  flag.add(cyl(0.1, 0.1, 4.2, 6, mat('#6a4a30'), 0, 0, 0), box(1.6, 0.9, 0.05, mat('#e5484d'), 0.9, 3.2, 0));
  flag.position.set(-19.5, gy, 27); b.add(flag, 0.8, 1, 'rise');
  return { build: b };
}

export function playground(): Made {
  const b = new Build('playground', -28, 36);
  const gy = groundY(-28, 36);
  const sand = cyl(8, 8, 0.3, 28, mat('#efd9a0', { rough: 1 }), -28, gy - 0.05, 36);
  b.add(sand, 0, 0.2, 'rise');
  const red = mat('#e5484d'), yellow = mat('#f7c53b'), blue = mat('#3b7dd8'), steel = mat('#cfd6dd', { metal: 0.4, rough: 0.4 });
  // slide
  const sl = new THREE.Group();
  sl.add(box(1.6, 2.4, 1.6, blue, 0, 0, 0), box(1.9, 0.12, 1.9, yellow, 0, 2.4, 0));
  const ramp = box(1.1, 0.14, 4.2, red, 0, 0, 0); ramp.rotation.x = 0.55; ramp.position.set(0, 0.45, 2.7);
  sl.add(ramp);
  for (let i = 0; i < 5; i++) sl.add(box(1.0, 0.06, 0.1, steel, 0, 0.4 + i * 0.45, -0.85));
  sl.position.set(-33, gy + 0.1, 34); sl.rotation.y = 0.5;
  b.add(sl, 0.15, 0.5, 'rise');
  // swings
  const sw = new THREE.Group();
  for (const sx of [-2.2, 2.2]) { const l = cyl(0.1, 0.1, 3.2, 6, steel, sx, 0, 0); l.rotation.z = sx > 0 ? -0.18 : 0.18; sw.add(l); }
  sw.add(box(5, 0.14, 0.14, steel, 0, 3.1, 0));
  const swings: THREE.Group[] = [];
  for (const sx of [-1, 1]) { const s = new THREE.Group(); s.add(cyl(0.025, 0.025, 2.2, 4, steel, 0, 0.35, 0), box(0.9, 0.1, 0.4, yellow, 0, 0.3, 0)); s.position.set(sx, 0.7, 0); s.rotation.x = 0; swings.push(s); sw.add(s); }
  sw.position.set(-24, gy + 0.1, 38); sw.rotation.y = -0.4;
  b.add(sw, 0.4, 0.72, 'rise', true);
  // seesaw
  const ss = new THREE.Group();
  ss.add(box(0.4, 0.8, 0.4, steel, 0, 0, 0));
  const plank = box(5, 0.16, 0.6, red, 0, 0.8, 0); plank.rotation.z = 0.15; ss.add(plank);
  ss.position.set(-28, gy + 0.1, 41); b.add(ss, 0.55, 0.8, 'pop');
  // merry-go-round (spins)
  const mg = new THREE.Group();
  mg.add(cyl(1.5, 1.5, 0.2, 14, yellow, 0, 0.2, 0), cyl(0.12, 0.12, 1.4, 6, steel, 0, 0.2, 0));
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; mg.add(box(0.1, 0.5, 0.1, red, Math.cos(a) * 1.2, 0.35, Math.sin(a) * 1.2)); }
  mg.position.set(-31, gy + 0.1, 39.5); b.add(mg, 0.65, 0.9, 'pop', true);
  const fence = mat('#fff7ea', { rough: 0.7 });
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; b.add(box(0.2, 0.9, 0.2, fence, -28 + Math.cos(a) * 8.4, gy, 36 + Math.sin(a) * 8.4), 0.7 + i * 0.01, 0.95, 'rise'); }
  const live: Live = { update(dt, t) { mg.rotation.y += dt * 0.8; swings.forEach((s, i) => (s.rotation.x = Math.sin(t * 1.6 + i) * 0.4)); } };
  return { build: b, live };
}

export function fountain(): Made {
  const b = new Build('fountain', -22, 14);
  const gy = groundY(-22, 14);
  const stone = mat('#d8d2c4', { rough: 0.85 }), dark = mat('#b9b2a4', { rough: 0.9 });
  b.add(cyl(7, 7, 0.3, 36, mat('#e3ddd0', { rough: 1 }), -22, gy - 0.05, 14), 0, 0.2, 'rise');
  // paving ring
  b.add(cyl(7, 7, 0.34, 36, mat('#c9c0ae', { rough: 1 }), -22, gy - 0.05, 14).translateY(0.0), 0, 0.01, 'none');
  const basin = new THREE.Group();
  basin.add(cyl(3.6, 3.8, 0.9, 28, stone, 0, 0, 0));
  const waterM = mat('#6fd0e8', { rough: 0.1, metal: 0.1, emissive: '#2a7a98', ei: 0.35 });
  basin.add(cyl(3.2, 3.2, 0.1, 28, waterM, 0, 0.78, 0));
  basin.add(cyl(0.5, 0.7, 2.4, 14, dark, 0, 0, 0), cyl(1.6, 1.8, 0.4, 20, stone, 0, 1.6, 0), cyl(0.3, 0.4, 1.5, 12, dark, 0, 1.6, 0), cyl(0.9, 1.0, 0.3, 18, stone, 0, 2.9, 0));
  basin.position.set(-22, gy + 0.2, 14);
  b.add(basin, 0.15, 0.6, 'rise');
  const jetM = new THREE.MeshStandardMaterial({ color: '#bfeeff', transparent: true, opacity: 0.55, roughness: 0.1, emissive: '#6fc8e8', emissiveIntensity: 0.4 });
  const jets = new THREE.Group();
  const j1 = cone(0.35, 2.2, 10, jetM, 0, 0, 0); j1.position.y = 4.2; jets.add(j1);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const j = cone(0.2, 1.3, 8, jetM, Math.cos(a) * 1.5, 1.9, Math.sin(a) * 1.5); j.rotation.z = Math.cos(a) * 0.5; j.rotation.x = Math.sin(a) * 0.5; jets.add(j); rings.push(j); }
  jets.position.set(-22, gy + 0.2, 14);
  b.add(jets, 0.6, 0.85, 'pop', true);
  // benches and lamps around
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, x = -22 + Math.cos(a) * 6, z = 14 + Math.sin(a) * 6;
    const bench = new THREE.Group(); bench.add(box(2, 0.12, 0.6, mat('#8a5a38'), 0, 0.45, 0), box(2, 0.5, 0.1, mat('#8a5a38'), 0, 0.5, -0.3), box(0.12, 0.45, 0.5, mat('#3b3b40'), -0.8, 0, 0), box(0.12, 0.45, 0.5, mat('#3b3b40'), 0.8, 0, 0));
    bench.position.set(x, gy + 0.3, z); bench.rotation.y = -a + Math.PI / 2; b.add(bench, 0.7 + i * 0.05, 0.9 + i * 0.03, 'pop');
  }
  const live: Live = { update(_dt, t) { jets.scale.y = 1 + Math.sin(t * 5) * 0.08; rings.forEach((m, i) => (m.scale.y = 1 + Math.sin(t * 4 + i) * 0.12)); } };
  return { build: b, live };
}

export function houses(): Made {
  const b = new Build('houses', -44, 32);
  house(b, -48, 29, 0.6, 31, 1, 0, 0.45);
  house(b, -44, 40, -0.2, 41, 0, 0.3, 0.75);
  house(b, -8, 39, 0.1, 53, 2, 0.55, 1);
  return { build: b };
}

export function festival(): Made {
  const b = new Build('festival', -22, 14, 2.2);
  const gy = groundY(-22, 14);
  // bunting between poles around the square
  const poles = [[-30, 7], [-14, 7], [-14, 21], [-30, 21]] as const;
  const cols = ['#e5484d', '#f7c53b', '#3b9fe0', '#4cc27a', '#c25bb8'];
  const flags: THREE.Mesh[] = [];
  poles.forEach(([x, z], i) => b.add(cyl(0.12, 0.14, 6, 6, mat('#6a4a30'), x, groundY(x, z), z), i * 0.05, 0.3 + i * 0.05, 'rise'));
  for (let s = 0; s < 4; s++) {
    const [x1, z1] = poles[s], [x2, z2] = poles[(s + 1) % 4];
    for (let i = 1; i < 12; i++) {
      const u = i / 12, x = x1 + (x2 - x1) * u, z = z1 + (z2 - z1) * u, sag = Math.sin(u * Math.PI) * 1.1;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.65, 3), mat(cols[(i + s) % 5], { rough: 0.7 }));
      f.rotation.x = Math.PI; f.position.set(x, gy + 5.6 - sag, z); f.castShadow = true;
      f.rotation.y = Math.atan2(x2 - x1, z2 - z1);
      b.add(f, 0.3 + (s * 12 + i) * 0.008, 0.5 + (s * 12 + i) * 0.008, 'pop', true);
      flags.push(f);
    }
  }
  // lanterns on the path
  for (let i = 0; i < 6; i++) {
    const x = -34 + i * 5.5, z = 18 + Math.sin(i) * 1.5;
    const g = new THREE.Group(); g.add(cyl(0.06, 0.06, 2.8, 6, mat('#3b3b40')), ball(0.4, mat('#ff7a59', { emissive: '#ff9a59', ei: 0.7 }), 0, 2.6));
    g.position.set(x, groundY(x, z), z); b.add(g, 0.5 + i * 0.05, 0.75 + i * 0.05, 'pop');
  }
  // entrance arch with a welcome sign
  const ax = -2, az = 12.5, ay = groundY(ax, az);
  const arch = new THREE.Group();
  arch.add(box(0.5, 4.2, 0.5, mat('#8a5a38'), -2.4, 0, 0), box(0.5, 4.2, 0.5, mat('#8a5a38'), 2.4, 0, 0), box(5.8, 0.5, 0.5, mat('#8a5a38'), 0, 4.2, 0));
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g2 = c.getContext('2d')!;
  g2.fillStyle = '#fff4d6'; g2.fillRect(0, 0, 512, 128); g2.strokeStyle = '#c0563f'; g2.lineWidth = 8; g2.strokeRect(6, 6, 500, 116);
  g2.fillStyle = '#9a3f2a'; g2.font = 'bold 64px "Noto Naskh Arabic","Geeza Pro","Segoe UI",sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('أهلاً بكم في قريتنا', 256, 66);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  sign.position.set(0, 3.3, 0.3); arch.add(sign);
  arch.position.set(ax, ay, az); arch.rotation.y = 0.55;
  const back = new THREE.Mesh(sign.geometry, sign.material); back.position.set(0, 3.3, -0.3); back.rotation.y = Math.PI; arch.add(back);
  b.add(arch, 0.2, 0.7, 'rise');
  const live: Live = { update(_dt, t) { flags.forEach((f, i) => (f.rotation.z = Math.sin(t * 3 + i * 0.7) * 0.18)); } };
  void leaf; void pyramid;
  return { build: b, live };
}
