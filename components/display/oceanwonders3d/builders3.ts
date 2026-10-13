import * as THREE from 'three';
import { DOLPHIN, Jelly, Swimmer, WHALE, cetaceanGeo, type SwimPath } from './creatures';
import { M, brainCoral, fanCoral, fanTexture, rock, staghorn, tableCoral, tubeCoral } from './flora';
import { Build, mat, mesh, rng, U, type Live, type Made } from './kit';
import { seabedY as gy } from './seabed';
import { arch, clam, glowMat, glowPlant, glowPoints, lights, palace, palaceMats, pearlMat, spire, ringGeo } from './structures';
import { PAL, Orbs, combine, made, put, school, scatter, type Hue } from './builders1';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const fanMat = () => mat('#ffffff', { rough: 0.6, map: fanTexture(), alphaTest: 0.45, side: THREE.DoubleSide, sway: 0.5 });
const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const paintWhite = (g: THREE.BufferGeometry) => { const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(n), 1)); return g; };

export function whale(): Made {
  const b = new Build('whale', 0, 34, -112, 4.2);
  const path: SwimPath = (t, o) => o.set(Math.cos(t) * 130, 34 + Math.sin(t * 1.3) * 5, -112 + Math.sin(t) * 16);
  const w = new Swimmer(cetaceanGeo(WHALE), 58, path, 0.042, { amp: 0.045, freq: 1.6, k: 5 }, 0, () => b.t, 0.42);
  b.add(w.group, 0, 1, 'none', true);
  return made(b, w);
}

export function palaceBuild(): Made {
  const px = 0, pz = -112, base = gy(px, pz);
  const b = new Build('palace', px, base, pz, 5), r = rng(301);
  const pal = palace(r);
  const T = pal.parts;
  const baseY = base + 4.8;
  const at = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, a: number, e: number, kind: 'rise' | 'grow' | 'pop', cast = true) => { const me = mesh(g, m, x, y, z, cast); b.add(me, a, e, kind); return me; };
  at(T.terrace, M.stone(), px, base, pz, 0, 0.22, 'rise');
  at(T.walls, palaceMats.pearl(), px, baseY, pz, 0.2, 0.45, 'rise');
  at(T.gate, palaceMats.pearl(), px, baseY, pz, 0.4, 0.55, 'pop');
  T.towers.forEach((t, i) => {
    const a = i === 0 ? 0.25 : 0.38 + i * 0.05, e = i === 0 ? 0.65 : 0.62 + i * 0.03;
    at(t.body, palaceMats.pearl(), px + t.x, baseY, pz + t.z, a, e, 'rise');
    at(t.trim, palaceMats.gold(), px + t.x, baseY, pz + t.z, e - 0.1, e + 0.05, 'pop');
    at(t.win, palaceMats.window(), px + t.x, baseY, pz + t.z, e - 0.05, e + 0.08, 'pop', false);
    at(t.dome, palaceMats.dome(), px + t.x, baseY, pz + t.z, e, Math.min(1, e + 0.12), 'pop');
    at(t.orb, palaceMats.orb(), px + t.x, baseY, pz + t.z, Math.min(1, e + 0.05), 1, 'pop', false);
  });
  const orbWorld = pal.orbPos.map((p) => p.clone().add(v3(px, baseY, pz)));
  b.add(glowPoints(orbWorld, '#fff1c8', 5, 0.25), 0.7, 1, 'none', true);
  const coralCols: Hue[] = ['pink', 'orange', 'purple', 'teal', 'magenta', 'yellow'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, rr = 46 + (i % 2) * 4;
    const x = px + Math.cos(a) * rr, z = pz + Math.sin(a) * rr * 0.8;
    const h = coralCols[i % 6];
    put(b, staghorn(r, { h: 11 + (i % 3) * 3, c0: PAL[h][0], c1: PAL[h][1], roots: 5, depth: 3, seg: 6 }), M.coral(), x, z, 0.5 + (i / 12) * 0.35, 0.8 + (i / 12) * 0.2, 'grow');
  }
  const live: Live = { update: () => { lights.palace.position.set(px, baseY + 40, pz + 12); lights.palace.intensity = 520 * sm(0.4, 1, b.t); } };
  return made(b, live);
}

export function giants(): Made {
  const b = new Build('giants', 0, 0, -56, 5), r = rng(302);
  const items: [number, number, 'st' | 'tb' | 'tu' | 'br' | 'fa', number, Hue, Hue][] = [
    [-80, -48, 'st', 30, 'pink', 'pink'], [-64, -66, 'tb', 21, 'orange', 'yellow'], [-94, -34, 'tu', 22, 'teal', 'teal'], [-56, -40, 'br', 11, 'purple', 'purple'], [-72, -30, 'fa', 17, 'magenta', 'magenta'],
    [-88, 4, 'st', 24, 'orange', 'yellow'], [-70, 22, 'tb', 13, 'magenta', 'pink'], [90, 8, 'tu', 18, 'teal', 'blue'], [72, 24, 'br', 9, 'purple', 'magenta'],
    [82, -52, 'st', 28, 'purple', 'blue'], [66, -72, 'tu', 24, 'magenta', 'pink'], [94, -38, 'tb', 19, 'yellow', 'orange'], [58, -42, 'fa', 19, 'blue', 'teal'], [74, -34, 'br', 11, 'green', 'green'],
  ];
  items.forEach(([x, z, k, s, h, h2], i) => {
    const a = (i / items.length) * 0.55, e = 0.4 + (i / items.length) * 0.6;
    put(b, rock(r, { w: s * 0.5, h: s * 0.18, d: s * 0.4 }), M.rock(), x, z, a, a + 0.2);
    if (k === 'st') put(b, staghorn(r, { h: s, c0: PAL[h][0], c1: PAL[h2][1], roots: 6, depth: 3, seg: 7 }), M.coral(), x, z, a, e);
    else if (k === 'tb') put(b, tableCoral(r, { r: s, c0: PAL[h][0], c1: PAL[h2][1] }), M.coralStill(), x, z, a, e);
    else if (k === 'tu') put(b, tubeCoral(r, { n: 18, h: s, c0: PAL[h][0], c1: PAL[h2][1] }), M.coralStill(), x, z, a, e);
    else if (k === 'br') put(b, brainCoral(r, { r: s, c0: PAL[h][0], c1: PAL[h2][1], bubble: i % 2 === 0 }), M.coralStill(), x, z, a, e);
    else put(b, fanCoral(r, { w: s, h: s, c0: PAL[h][0], c1: PAL[h2][1] }), fanMat(), x, z, a, e);
  });
  scatter(b, r, 34, -96, 96, 4, 36, 0.2, 1, 2.4);
  return made(b);
}

export function school3(): Made {
  const b = new Build('school3', 0, 24, -80, 4.4);
  const path = (t: number, o: THREE.Vector3) => o.set(Math.cos(t) * 72, 25 + Math.sin(t * 2) * 3, -84 + Math.sin(t) * 24);
  const s = school(b, { species: [6, 6, 6, 4, 6, 3], count: 108, seed: 311, size: 3.1, mode: 'path', path, center: v3(0, 24, -84), speed: 0.055, gap: 2.5, entry: v3(110, 0, 20) });
  return made(b, s);
}

export function magic(): Made {
  const b = new Build('magic', 0, 0, -56, 4.6), r = rng(303);
  const hues = [['#ff7ad8', '#ff9fe0'], ['#5af0ff', '#9fffff'], ['#a98aff', '#d4c4ff']];
  const mats = hues.map(([e]) => mat('#ffffff', { rough: 0.45, emissive: e, ei: 0.55, sway: 0.1, glow: 'magic', caustics: 0.4 }));
  const sites: [number, number][] = [[-26, -52], [26, -54], [-40, -42], [40, -44], [-14, -70], [16, -72]];
  sites.forEach(([x, z], i) => {
    const m = mats[i % 3];
    const a = (i / sites.length) * 0.5, e = 0.35 + (i / sites.length) * 0.5;
    put(b, rock(r, { w: 8, h: 3, d: 6 }), M.rock(), x, z, a, a + 0.2);
    put(b, staghorn(r, { h: 9 + (i % 3) * 2, c0: ['#c03a98', '#1fa0b8', '#6a4fc8'][i % 3], c1: ['#ff9fe0', '#9fffff', '#d4c4ff'][i % 3], roots: 5, depth: 3, seg: 6 }), m, x, z, a + 0.05, e, 'grow');
    put(b, brainCoral(r, { r: 3.2, c0: ['#c03a98', '#1fa0b8', '#6a4fc8'][(i + 1) % 3], c1: ['#ff9fe0', '#9fffff', '#d4c4ff'][(i + 1) % 3], bubble: true }), m, x + 6, z + 5, a + 0.1, e + 0.1, 'grow');
  });
  const cols = ['#ff7ad8', '#5af0ff', '#a98aff'];
  const jellies: Live[] = [];
  for (let i = 0; i < 7; i++) {
    const j = new Jelly(v3(-34 + i * 11, 15 + (i % 3) * 5, -46 - (i % 2) * 14), 2.6 + (i % 3) * 0.6, cols[i % 3], i * 2.1, () => Math.max(0, (b.t - 0.3 - i * 0.07) / 0.3));
    b.add(j.group, 0, 1, 'none', true);
    jellies.push(j);
  }
  const orbs = new Orbs(34, v3(0, 12, -56), v3(90, 18, 40), '#d6c4ff', 1.5, 91, () => b.t);
  b.add(orbs.pts, 0.2, 1, 'none', true);
  return made(b, combine(...jellies, orbs));
}

export function arches2(): Made {
  const b = new Build('arches2', 0, 0, -70, 4.4), r = rng(304);
  const defs: [number, number, number, number, number][] = [[-44, -56, 16, 2.6, 0.32], [44, -56, 16, 2.6, -0.32], [0, -90, 21, 3.2, 0]];
  defs.forEach(([x, z, R, tube, yaw], i) => {
    const g = arch(r, { R, tube, elegant: true });
    g.rotateY(yaw);
    put(b, g, M.stone(), x, z, i * 0.15, 0.5 + i * 0.15, 'rise', { lift: 0.3 });
    const pg = new THREE.IcosahedronGeometry(1.7, 3); paintWhite(pg);
    const top = gy(x, z) + R + tube * 0.8;
    const pe = mesh(pg, pearlMat(), x, top + 1.4, z, false);
    b.add(pe, 0.6 + i * 0.12, 0.95, 'pop');
    const hh: Hue[] = ['pink', 'teal', 'orange'];
    [-1, 1].forEach((sx) => {
      const cx = x + Math.cos(yaw) * sx * R, cz = z - Math.sin(yaw) * sx * R;
      put(b, staghorn(r, { h: 7 + i, c0: PAL[hh[i]][0], c1: PAL[hh[i]][1], roots: 4, depth: 3, seg: 6 }), M.coral(), cx, cz, 0.55 + i * 0.1, 1, 'grow');
    });
  });
  return made(b);
}

class FloatPearls implements Live {
  readonly mesh: THREE.InstancedMesh;
  private base: THREE.Vector3[] = [];
  private m = new THREE.Matrix4();
  constructor(n: number, seed: number, private progress: () => number) {
    const r = rng(seed);
    const g = new THREE.IcosahedronGeometry(1, 3); paintWhite(g);
    this.mesh = new THREE.InstancedMesh(g, pearlMat(), n);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < n; i++) this.base.push(v3(-60 + r() * 120, 7 + r() * 17, -22 - r() * 54));
    this.mesh.visible = false;
  }
  update(_dt: number, time: number) {
    const t = this.progress();
    this.mesh.visible = t > 0.02;
    if (!this.mesh.visible) return;
    const shown = Math.ceil(this.base.length * Math.min(1, t * 1.2));
    this.mesh.count = shown;
    for (let i = 0; i < shown; i++) {
      const p = this.base[i], s = (0.9 + (i % 3) * 0.28) * Math.min(1, t * 2);
      this.m.makeScale(s, s, s).setPosition(p.x, p.y + Math.sin(time * 0.7 + i * 1.9) * 0.9, p.z);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
export function pearls(): Made {
  const b = new Build('pearls', 0, 0, -36, 4), r = rng(305);
  const spots: [number, number][] = [[-26, -28], [-14, -24], [-4, -30], [10, -26], [22, -30], [-34, -40], [30, -44], [-18, -46], [16, -50], [0, -38]];
  const halo: THREE.Vector3[] = [];
  spots.forEach(([x, z], i) => {
    const c = clam(r, { r: 2.4 + (i % 3) * 0.5, c0: ['#c8a0d8', '#f0b0b8', '#a8d0e8'][i % 3], c1: '#fbe6f0' });
    const a = (i / spots.length) * 0.55, e = a + 0.35;
    const sh = put(b, c.shell, M.shell(), x, z, a, e, 'pop', { rot: r() * 6 });
    const pe = mesh(c.pearl, pearlMat(), x, gy(x, z), z, false);
    pe.rotation.y = sh.rotation.y;
    b.add(pe, a + 0.1, e + 0.1, 'pop');
    halo.push(v3(x, gy(x, z) + c.pearlPos.y, z));
  });
  b.add(glowPoints(halo, '#ffeaff', 3.2, 0.3), 0.4, 1, 'none', true);
  const fp = new FloatPearls(18, 306, () => b.t);
  b.add(fp.mesh, 0.1, 1, 'none', true);
  return made(b, fp);
}

export function glow2(): Made {
  const b = new Build('glow2', 0, 0, -60, 4.2), r = rng(307);
  const cols = ['#4ff0ff', '#ff5ad8', '#9dff5a', '#a98aff'];
  const pts: THREE.Vector3[][] = [[], [], [], []];
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1, x = side * (20 + r() * 42), z = -40 - r() * 46, hue = i % 4;
    const gp = glowPlant(r, { h: 11 + r() * 5, hue: cols[hue], stalks: 7 });
    put(b, gp.geo, glowMat(cols[hue], 'bio2'), x, z, (i / 16) * 0.55, 0.45 + (i / 16) * 0.55, 'grow');
    const y = gy(x, z);
    gp.pts.forEach((p) => pts[hue].push(p.clone().add(v3(x, y, z))));
  }
  cols.forEach((c, h) => b.add(glowPoints(pts[h], c, 2.4, 0.35), 0.4, 1, 'none', true));
  return made(b);
}

export function dance(): Made {
  const b = new Build('dance', 0, 16, -66, 4);
  const geo = cetaceanGeo(DOLPHIN);
  const sw: Swimmer[] = [];
  [0, 0.4, Math.PI, Math.PI + 0.4].forEach((ph, i) => {
    const p: SwimPath = (t, o) => { const a = t + ph; o.set(Math.cos(a) * 36, 11 + 9 * Math.pow(Math.sin(a * 1.5 + ph), 2), -66 + Math.sin(a) * 18); };
    const s = new Swimmer(geo.clone(), 8.5, p, 0.17, { amp: 0.05, freq: 3.8, k: 7 }, i * 0.9, () => Math.max(0, (b.t - i * 0.1) / 0.6));
    b.add(s.group, 0, 1, 'none', true);
    sw.push(s);
  });
  return made(b, combine(...sw));
}

export function landmark(): Made {
  const x = -38, z = -74, base = gy(x, z);
  const b = new Build('landmark', x, base, z, 5), r = rng(308);
  const sp = spire(r);
  put(b, sp.tower, M.stone(), x, z, 0, 0.6, 'rise');
  put(b, sp.gold, mat('#ffffff', { rough: 0.3, metal: 0.7, emissive: '#b88a1a', ei: 0.25 }), x, z, 0.5, 0.75, 'pop');
  const pm = mesh(sp.pearl, pearlMat(), x, base + sp.pearlY, z, false);
  b.add(pm, 0.6, 0.9, 'pop');
  const rings = [0, 1, 2].map((i) => { const m = mesh(ringGeo(7 + i * 2.2, 0.22, '#ffd36e'), mat('#ffffff', { rough: 0.25, metal: 0.8, emissive: '#e0a020', ei: 0.5, glow: 'landmark' }), x, base + sp.pearlY, z, false); m.rotation.set(i * 1.0, 0, i * 0.7); b.add(m, 0.75 + i * 0.05, 1, 'pop'); return m; });
  b.add(glowPoints([v3(x, base + sp.pearlY, z)], '#ffe6fb', 22, 0.12), 0.7, 1, 'none', true);
  const live: Live = { update: (_dt, time) => { pm.position.y = base + sp.pearlY + Math.sin(time * 0.6) * 0.7; rings.forEach((rg, i) => { rg.position.y = pm.position.y; rg.rotation.y = time * (0.3 + i * 0.12); rg.rotation.x = 0.8 + i * 0.5 + Math.sin(time * 0.2 + i) * 0.1; }); } };
  return made(b, live);
}

export function finale(): Made {
  const px = 0, pz = -112, base = gy(px, pz);
  const b = new Build('finale', px, base, pz, 5);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uT: U.time, uK: { value: 0 } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vU; uniform float uT; uniform float uK; void main(){ float a = pow(1.0 - vU.y, 1.6) * (0.65 + 0.35 * sin(vU.x * 24.0 + uT * 0.8)) * uK; gl_FragColor = vec4(1.0, 0.9, 0.62, a * 0.28); }',
  });
  const spots: [number, number, number, number][] = [[0, -2, 90, 8], [-17, -9, 70, 4.5], [17, -9, 70, 4.5], [-17, 11, 70, 4.5], [17, 11, 70, 4.5]];
  spots.forEach(([dx, dz, h, rad], i) => {
    const g = new THREE.CylinderGeometry(rad, rad * 0.3, h, 20, 1, true);
    const me = new THREE.Mesh(g, beamMat);
    me.position.set(px + dx, base + 4.8 + h / 2 + 8, pz + dz);
    me.frustumCulled = false; me.renderOrder = 3;
    b.add(me, 0.2 + i * 0.12, 0.7 + i * 0.06, 'none', true);
  });
  const lanterns = new Orbs(34, v3(0, 14, -108), v3(110, 26, 32), '#ffe3a0', 2.2, 99, () => b.t);
  b.add(lanterns.pts, 0.2, 1, 'none', true);
  const rise = new Orbs(40, v3(0, 22, -96), v3(70, 36, 40), '#ffffff', 1.1, 101, () => b.t);
  b.add(rise.pts, 0.3, 1, 'none', true);
  const live: Live = { update: () => { beamMat.uniforms.uK.value = sm(0.15, 0.8, b.t); } };
  return made(b, combine(lanterns, rise, live));
}
