import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './kit';
import { CITY_ROADS, VILLAGE_PATH } from './layout';
import { METRO_PATH } from './builders3';
import { groundY, riverX } from './terrain';

/** Ambient life: cars, pedestrians, boats, planes, the metro train and birds. Each only exists once the milestone that enables it is built. Cheap and bounded. */
export interface Life { update(dt: number, t: number, night: number, built: (id: string) => number, level: number): void; dispose(): void }

const SAMPLES = 240;
interface Path { pos: Float32Array; dir: Float32Array; length: number; y?: number }

/** Pre-sampled path (x, y, z per sample) so per-frame movement is array lookups. */
function sampled(pts: THREE.Vector3[], closed: boolean, yFixed?: number): Path {
  const c = new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.3);
  const pos = new Float32Array((SAMPLES + 1) * 3), dir = new Float32Array((SAMPLES + 1) * 2);
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES, p = c.getPointAt(u % 1 === 0 && i === SAMPLES ? (closed ? 0 : 1) : u), t = c.getTangentAt(i === SAMPLES && closed ? 0 : u);
    pos[i * 3] = p.x; pos[i * 3 + 1] = yFixed ?? p.y; pos[i * 3 + 2] = p.z;
    dir[i * 2] = t.x; dir[i * 2 + 1] = t.z;
  }
  return { pos, dir, length: c.getLength(), y: yFixed };
}
const at = (p: Path, u: number, out: THREE.Vector3, dirOut?: THREE.Vector2) => {
  const f = (((u % 1) + 1) % 1) * SAMPLES, i = Math.floor(f), k = f - i, j = Math.min(SAMPLES, i + 1);
  out.set(p.pos[i * 3] * (1 - k) + p.pos[j * 3] * k, p.pos[i * 3 + 1] * (1 - k) + p.pos[j * 3 + 1] * k, p.pos[i * 3 + 2] * (1 - k) + p.pos[j * 3 + 2] * k);
  if (dirOut) dirOut.set(p.dir[i * 2] * (1 - k) + p.dir[j * 2] * k, p.dir[i * 2 + 1] * (1 - k) + p.dir[j * 2 + 1] * k);
};

/** A lane loop for a road: out along +offset, back along -offset; ends become gentle U-turns. */
function laneLoop(pts: [number, number][], off: number, y?: number): Path {
  const base = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.3);
  const n = 28, out: THREE.Vector3[] = [], back: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = base.getPointAt(u), t = base.getTangentAt(u), nx = -t.z, nz = t.x;
    out.push(new THREE.Vector3(p.x + nx * off, 0, p.z + nz * off));
    back.push(new THREE.Vector3(p.x - nx * off, 0, p.z - nz * off));
  }
  const loop = [...out, ...back.reverse()];
  const s = sampled(loop.map((v) => v.clone()), true, y);
  if (y === undefined) for (let i = 0; i <= SAMPLES; i++) s.pos[i * 3 + 1] = groundY(s.pos[i * 3], s.pos[i * 3 + 2]) + 0.35;
  return s;
}

function carGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(2.1, 0.7, 1.0).translate(0, 0.45, 0).toNonIndexed();
  const cab = new THREE.BoxGeometry(1.1, 0.5, 0.9).translate(-0.1, 0.95, 0).toNonIndexed();
  return mergeGeometries([body, cab])!;
}
function personGeometry(): THREE.BufferGeometry {
  const b = new THREE.CapsuleGeometry(0.22, 0.6, 3, 6).translate(0, 0.6, 0).toNonIndexed();
  const h = new THREE.IcosahedronGeometry(0.2, 0).translate(0, 1.3, 0).toNonIndexed();
  return mergeGeometries([b, h])!;
}

export function createLife(scene: THREE.Scene, quality: 'high' | 'balanced' | 'low', reduced: boolean): Life {
  const group = new THREE.Group();
  scene.add(group);
  const r = rng(555);
  const tmp = new THREE.Vector3(), dir = new THREE.Vector2(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const speedK = reduced ? 0.5 : 1;

  // ---- cars ----
  const roadsDef = CITY_ROADS.filter((d) => d.traffic);
  const lanes = roadsDef.map((d) => laneLoop(d.pts, d.width * 0.22));
  const bridgeLane = laneLoop([[10, 11], [25, 10.2], [40, 9.4]], 1.1, 2.75);
  const bridge2Lane = laneLoop([[-8, 46], [18, 46], [44, 44]], 1.3, 2.75);
  const carPaths = [...lanes, bridgeLane, bridge2Lane];
  const carGate = [...roadsDef.map((d, i) => ({ id: 'roads', min: (CITY_ROADS.indexOf(d) / CITY_ROADS.length) * 0.8 + 0.2, i })), { id: 'bridge', min: 1, i: lanes.length }, { id: 'bridge2', min: 1, i: lanes.length + 1 }];
  const maxCars = quality === 'low' ? 24 : 70;
  const carMesh = new THREE.InstancedMesh(carGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), maxCars);
  carMesh.castShadow = quality !== 'low'; carMesh.frustumCulled = false;
  const palette = ['#e5484d', '#3b7dd8', '#f2f4f7', '#ffd23f', '#4cc27a', '#2a2f38', '#f2a93b', '#8a5ac8'].map((c) => new THREE.Color(c));
  const cars = Array.from({ length: maxCars }, (_, i) => {
    const g = carGate[Math.floor(r() * carGate.length)];
    const c = { path: carPaths[g.i], gate: g, u: r(), v: (0.012 + r() * 0.01) * (carPaths[g.i].length > 80 ? 1 : 1.5), i };
    carMesh.setColorAt(i, palette[i % palette.length]);
    return c;
  });
  group.add(carMesh);

  // ---- pedestrians ----
  const walkers: { path: Path; gate: string; u: number; dirn: number; v: number; scale: number }[] = [];
  const vp = sampled(VILLAGE_PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false);
  for (let i = 0; i <= SAMPLES; i++) vp.pos[i * 3 + 1] = groundY(vp.pos[i * 3], vp.pos[i * 3 + 2]) + 0.12;
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i < 12; i++) ring.push(new THREE.Vector3(-22 + Math.cos((i / 12) * 6.283) * 5.6, 0, 14 + Math.sin((i / 12) * 6.283) * 5.6));
  const fr = sampled(ring, true);
  for (let i = 0; i <= SAMPLES; i++) fr.pos[i * 3 + 1] = groundY(fr.pos[i * 3], fr.pos[i * 3 + 2]) + 0.4;
  const mkp = (pts: [number, number][]) => { const p = sampled(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false); for (let i = 0; i <= SAMPLES; i++) p.pos[i * 3 + 1] = groundY(p.pos[i * 3], p.pos[i * 3 + 2]) + 0.45; return p; };
  const wf = mkp([[-50, 51], [-30, 53], [-10, 56], [10, 54], [30, 52]]);
  const pk = mkp([[24, 28], [30, 24], [36, 22], [42, 26], [44, 32]]);
  const pk2 = mkp([[40, 24], [46, 20], [54, 18], [62, 24]]);
  const mk = (path: Path, gate: string, n: number) => { for (let i = 0; i < n; i++) walkers.push({ path, gate, u: r(), dirn: r() > 0.5 ? 1 : -1, v: 0.02 + r() * 0.015, scale: 0.8 + r() * 0.3 }); };
  const maxPeople = quality === 'low' ? 20 : 70;
  mk(vp, 'path', 7); mk(fr, 'fountain', 8); mk(pk, 'park', 6); mk(wf, 'waterfront', 12); mk(pk2, 'parks', 8);
  const people = walkers.slice(0, maxPeople);
  const pMesh = new THREE.InstancedMesh(personGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.8 }), Math.max(1, people.length));
  pMesh.castShadow = false; pMesh.frustumCulled = false;
  const shirts = ['#e5484d', '#3b7dd8', '#ffd23f', '#4cc27a', '#c25bb8', '#f2f4f7', '#f2a93b'].map((c) => new THREE.Color(c));
  people.forEach((_, i) => pMesh.setColorAt(i, shirts[i % shirts.length]));
  group.add(pMesh);

  // ---- boats ----
  const hullM = new THREE.MeshStandardMaterial({ color: '#2c3e50', roughness: 0.6 }), whiteM = new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.5 });
  const wakeM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false, fog: false });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o; };
  const cargoShip = (hue: string) => {
    const g = new THREE.Group();
    g.add(box(18, 2.2, 5, hullM, 0, 1.1, 0), box(18.4, 0.5, 5.4, new THREE.MeshStandardMaterial({ color: hue }), 0, 2.3, 0), box(3.4, 3.4, 4.4, whiteM, -6, 4.2, 0));
    ['#e5484d', '#3b7dd8', '#f2a93b', '#4cc27a'].forEach((c, i) => { for (let k = 0; k < 2; k++) g.add(box(2.4, 1.1, 4, new THREE.MeshStandardMaterial({ color: c }), -1 + i * 2.8 - (i > 2 ? 0 : 0), 3.2 + k * 1.1, 0)); });
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(14, 4).rotateX(-Math.PI / 2), wakeM); wake.position.set(-17, 0.12, 0); g.add(wake);
    return g;
  };
  const cruise = () => {
    const g = new THREE.Group();
    g.add(box(30, 3, 6.4, new THREE.MeshStandardMaterial({ color: '#f4f6f8' }), 0, 1.5, 0), box(26, 2.6, 5.8, new THREE.MeshStandardMaterial({ color: '#f4f6f8' }), 0, 4.4, 0), box(20, 2.2, 5, new THREE.MeshStandardMaterial({ color: '#f4f6f8' }), 1, 6.8, 0), box(30, 0.5, 6.5, new THREE.MeshStandardMaterial({ color: '#2f7fd8' }), 0, 0.6, 0));
    g.add(box(1.6, 2.4, 1.6, new THREE.MeshStandardMaterial({ color: '#e5484d' }), -2, 9.2, 0));
    for (let i = 0; i < 3; i++) g.add(box(24, 0.35, 5.9, new THREE.MeshStandardMaterial({ color: '#7fb3d6', emissive: '#6aa8cc', emissiveIntensity: 0.25 }), 0, 3.4 + i * 2.2, 0.0));
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5).rotateX(-Math.PI / 2), wakeM); wake.position.set(-24, 0.12, 0); g.add(wake);
    return g;
  };
  const sailboat = () => {
    const g = new THREE.Group();
    g.add(box(4, 0.7, 1.4, whiteM, 0, 0.35, 0));
    const mast = box(0.1, 5, 0.1, new THREE.MeshStandardMaterial({ color: '#cfd6dd' }), 0, 0.7, 0); g.add(mast);
    const sail = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.4, 3), new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, flatShading: true })); sail.scale.set(0.12, 1, 1); sail.position.set(0.3, 3.1, 0); sail.rotation.z = -0.06; g.add(sail);
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.6).rotateX(-Math.PI / 2), wakeM); wake.position.set(-4.5, 0.1, 0); g.add(wake);
    return g;
  };
  const tug = () => { const g = new THREE.Group(); g.add(box(3.6, 0.9, 1.4, new THREE.MeshStandardMaterial({ color: '#e5484d' }), 0, 0.45, 0), box(1.2, 1, 1.2, whiteM, -0.4, 1.2, 0)); return g; };
  const sea = (cx: number, cz: number, rx: number, rz: number, n = 16) => Array.from({ length: n }, (_, i) => new THREE.Vector3(cx + Math.cos((i / n) * 6.283) * rx, 0, cz + Math.sin((i / n) * 6.283) * rz));
  const seaPath = (cx: number, cz: number, rx: number, rz: number) => { const p = sampled(sea(cx, cz, rx, rz), true); for (let i = 0; i <= SAMPLES; i++) p.pos[i * 3 + 1] = 0.05; return p; };
  const riverPath = (() => { const pts: THREE.Vector3[] = []; for (let z = 18; z <= 66; z += 6) pts.push(new THREE.Vector3(riverX(z), 0, z)); const p = sampled(pts, false); for (let i = 0; i <= SAMPLES; i++) p.pos[i * 3 + 1] = 0.05; return p; })();
  const boats: { obj: THREE.Group; path: Path; gate: string; u: number; v: number; flip: boolean; pingpong: boolean; wob: number }[] = [];
  const addBoat = (obj: THREE.Group, path: Path, gate: string, v: number, flip = false, pingpong = false) => { group.add(obj); boats.push({ obj, path, gate, u: r(), v, flip, pingpong, wob: r() * 6 }); obj.visible = false; };
  addBoat(cargoShip('#c0392b'), seaPath(40, 92, 80, 12), 'port', 0.0035);
  addBoat(cargoShip('#2f7fd8'), seaPath(44, 100, 76, 9), 'port', -0.003, true);
  addBoat(cruise(), seaPath(34, 84, 70, 8), 'port2', 0.0028);
  for (let i = 0; i < 4; i++) addBoat(sailboat(), seaPath(-20 + i * 14, 72 + (i % 2) * 8, 22 + i * 3, 5), 'waterfront', 0.004 + i * 0.001, i % 2 === 1);
  addBoat(tug(), riverPath, 'bridge', 0.004, false, true);

  // ---- planes ----
  const planeGeo = () => {
    const g = new THREE.Group();
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 11, 10).rotateZ(Math.PI / 2), whiteM); fus.castShadow = true;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), whiteM); nose.position.x = 5.5; nose.scale.x = 1.4;
    const wing = box(2.6, 0.2, 13, whiteM, 0.5, -0.2, 0); const tailF = box(1.8, 2.2, 0.2, new THREE.MeshStandardMaterial({ color: '#e5484d' }), -5, 1.4, 0), tailW = box(1.4, 0.15, 4.4, whiteM, -5, 0.4, 0);
    const eng = [-3.4, 3.4].map((z) => { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.8, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#9aa3ab' })); e.position.set(1.6, -0.6, z); return e; });
    g.add(fus, nose, wing, tailF, tailW, ...eng, box(7, 0.28, 0.3, new THREE.MeshStandardMaterial({ color: '#3b7dd8' }), 0.5, 0.15, 0.92));
    g.scale.setScalar(1.15);
    return g;
  };
  const flight = sampled([[-104, 3.2, -36], [-60, 3.3, -36], [-32, 15, -38], [8, 33, -46], [58, 48, -62], [96, 52, -92], [58, 50, -132], [-44, 46, -126], [-122, 34, -84], [-152, 16, -48], [-128, 5, -37]].map(([x, y, z]) => new THREE.Vector3(x, y, z)), true);
  const planes: { obj: THREE.Group; gate: string; u: number }[] = [];
  const addPlane = (gate: string, u: number) => { const p = planeGeo(); p.visible = false; group.add(p); planes.push({ obj: p, gate, u }); };
  addPlane('airport', 0.02); addPlane('airport2', 0.38); addPlane('airport2', 0.7);

  // ---- metro train ----
  const mc = new THREE.CatmullRomCurve3(METRO_PATH.map(([x, z]) => new THREE.Vector3(x, 9.9, z)), false, 'catmullrom', 0.3);
  const trainPath = sampled(METRO_PATH.map(([x, z]) => new THREE.Vector3(x, 9.9, z)), false, 9.9);
  void mc;
  const train = new THREE.Group();
  for (let i = 0; i < 3; i++) { const c = new THREE.Group(); c.add(box(7.4, 2.1, 2.5, new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.4, metalness: 0.2 }), 0, 0, 0), box(7.5, 0.7, 2.55, new THREE.MeshStandardMaterial({ color: '#7fb3d6', emissive: '#6aa8cc', emissiveIntensity: 0.3 }), 0, 0.5, 0), box(7.5, 0.3, 2.56, new THREE.MeshStandardMaterial({ color: '#2f7fd8' }), 0, -0.6, 0)); c.position.x = -i * 7.8; train.add(c); }
  train.visible = false; group.add(train);
  let trainU = 0, trainDir = 1, trainWait = 0;

  // ---- birds (always: a living sky) ----
  const birds: { m: THREE.Mesh; a: number; r: number; h: number; s: number; cx: number; cz: number }[] = [];
  const wingGeo = new THREE.BufferGeometry(); wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.0, 0, -0.5, 1.0, 0, 0.5], 3)); wingGeo.computeVertexNormals();
  const birdM = new THREE.MeshBasicMaterial({ color: '#3a4350', side: THREE.DoubleSide });
  for (let i = 0; i < (quality === 'low' ? 4 : 9); i++) {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), birdM);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.9, 0.25, -0.9, 0.9, 0.25, 0.9, 0, 0, 0, -0.9, 0.25, -0.9, -0.9, 0.25, 0.9], 3)); geo.setIndex([0, 1, 2, 3, 5, 4]);
    m.geometry = geo; m.scale.setScalar(0.9); group.add(m);
    birds.push({ m, a: r() * 6.28, r: 30 + r() * 30, h: 26 + r() * 14, s: 0.18 + r() * 0.12, cx: -20 + r() * 40, cz: 0 + r() * 20 });
  }

  const e = (fn: () => void) => fn();
  void e; void sc; void up;
  function update(dt: number, t: number, night: number, built: (id: string) => number, level: number) {
    // cars
    let n = 0;
    for (const c of cars) {
      const on = built(c.gate.id) >= c.gate.min && !(level === 0 && c.gate.id === 'roads' && built('roads') <= 0);
      if (!on) { m4.makeScale(0, 0, 0); carMesh.setMatrixAt(c.i, m4); continue; }
      c.u = (c.u + c.v * dt * speedK * (night > 0.5 ? 0.85 : 1)) % 1;
      at(c.path, c.u, tmp, dir);
      q.setFromAxisAngle(up, -Math.atan2(dir.y, dir.x));
      m4.compose(tmp, q, sc.set(1, 1, 1)); carMesh.setMatrixAt(c.i, m4); n++;
    }
    carMesh.instanceMatrix.needsUpdate = true;
    // pedestrians
    people.forEach((w, i) => {
      if (built(w.gate) < 1) { m4.makeScale(0, 0, 0); pMesh.setMatrixAt(i, m4); return; }
      w.u += w.dirn * w.v * dt * speedK * 0.5;
      if (w.u > 1 || w.u < 0) { w.dirn = -w.dirn; w.u = Math.max(0, Math.min(1, w.u)); }
      at(w.path, w.u, tmp, dir);
      tmp.y += Math.abs(Math.sin(t * 7 + i)) * 0.08;
      q.setFromAxisAngle(up, -Math.atan2(dir.y, dir.x) + (w.dirn < 0 ? Math.PI : 0));
      m4.compose(tmp, q, sc.set(w.scale, w.scale, w.scale)); pMesh.setMatrixAt(i, m4);
    });
    pMesh.instanceMatrix.needsUpdate = true;
    // boats
    for (const b of boats) {
      const on = built(b.gate) >= 1;
      b.obj.visible = on;
      if (!on) continue;
      b.u += b.v * dt * speedK * 0.5 * (b.pingpong ? 1 : 1);
      let u = b.u;
      if (b.pingpong) { const p = ((u % 2) + 2) % 2; u = p > 1 ? 2 - p : p; }
      at(b.path, u, tmp, dir);
      const heading = -Math.atan2(dir.y, dir.x) + (b.flip || (b.pingpong && ((b.u % 2) + 2) % 2 > 1) ? Math.PI : 0);
      b.obj.position.set(tmp.x, 0.05 + Math.sin(t * 1.2 + b.wob) * 0.12, tmp.z);
      b.obj.rotation.set(Math.sin(t * 0.9 + b.wob) * 0.015, heading, Math.sin(t * 1.1 + b.wob) * 0.02);
    }
    // planes: they accelerate down the runway, climb, circle behind the city and return to land
    for (const p of planes) {
      const on = built(p.gate) >= 1;
      p.obj.visible = on;
      if (!on) continue;
      const slow = p.u < 0.06 || p.u > 0.97 ? 0.5 : 1;
      p.u = (p.u + dt * 0.011 * speedK * slow) % 1;
      at(flight, p.u, tmp, dir);
      const ahead = new THREE.Vector3(); at(flight, p.u + 0.004, ahead);
      p.obj.position.copy(tmp);
      const dx = ahead.x - tmp.x, dz = ahead.z - tmp.z, dy = ahead.y - tmp.y;
      p.obj.rotation.set(0, 0, 0);
      p.obj.rotation.y = -Math.atan2(dz, dx);
      p.obj.rotation.z = Math.atan2(dy, Math.hypot(dx, dz));
    }
    // metro
    const tb = built('metro') >= 1;
    train.visible = tb;
    if (tb) {
      if (trainWait > 0) trainWait -= dt;
      else {
        trainU += trainDir * dt * 0.022 * speedK;
        const nearStation = Math.abs(trainU - 0.5) < 0.004;
        if (nearStation && trainWait <= 0 && Math.random() < 0.2) trainWait = 3;
        if (trainU > 1) { trainU = 1; trainDir = -1; trainWait = 2; } else if (trainU < 0) { trainU = 0; trainDir = 1; trainWait = 2; }
      }
      at(trainPath, trainU, tmp, dir);
      train.position.copy(tmp);
      train.rotation.y = -Math.atan2(dir.y, dir.x) + (trainDir < 0 ? Math.PI : 0);
      train.children.forEach((c, i) => { c.position.x = trainDir > 0 ? -i * 7.8 : i * 7.8; });
    }
    // birds
    for (const b of birds) {
      b.a += b.s * dt * speedK * 0.5;
      b.m.position.set(b.cx + Math.cos(b.a) * b.r, b.h + Math.sin(b.a * 3) * 1.4, b.cz + Math.sin(b.a) * b.r * 0.6);
      b.m.rotation.y = -b.a - Math.PI / 2;
      const flap = Math.sin(t * 9 + b.a * 5) * 0.5;
      const pos = b.m.geometry.attributes.position as THREE.BufferAttribute;
      for (const k of [1, 2, 4, 5]) pos.setY(k, 0.25 + flap * (k < 3 ? 1 : 1));
      pos.needsUpdate = true;
      b.m.visible = night < 0.6;
    }
    void n;
  }
  return {
    update,
    dispose() {
      group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mm = m.material as THREE.Material; if (mm) mm.dispose?.(); } });
      scene.remove(group);
      carMesh.dispose(); pMesh.dispose();
    },
  };
}
