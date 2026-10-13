import * as THREE from 'three';
import { FishSchool, Octopus, Jelly, type SchoolOpts } from './creatures';
import { M, anemone, brainCoral, conch, fanCoral, fanTexture, featherDuster, kelp, rock, scallop, seagrass, staghorn, starfish, tableCoral, tubeCoral, urchin } from './flora';
import { Build, mat, mesh, rng, type Live, type Made, type PartKind } from './kit';
import { seabedY as gy } from './seabed';
import { clam, glowPoints, pearlMat } from './structures';

export const PAL = {
  pink: ['#c93a63', '#ff9fb8'], red: ['#c4322f', '#ff8070'], orange: ['#e8731a', '#ffd08a'], purple: ['#6a3fb8', '#cdb0ff'], blue: ['#2f6fd0', '#9fd6ff'],
  teal: ['#1fa89c', '#8ff0d8'], magenta: ['#b8338f', '#ff8fd6'], yellow: ['#d4a017', '#fff09a'], green: ['#3d9a52', '#b6f09a'], coral: ['#e0553f', '#ffb199'],
} as const;
export type Hue = keyof typeof PAL;

/** Places a geometry on the seabed at (x,z) and stages its growth between a and e of the milestone's progress. */
export function put(b: Build, geo: THREE.BufferGeometry, m: THREE.Material, x: number, z: number, a: number, e: number, kind: PartKind = 'grow', o: { rot?: number; s?: number; lift?: number; cast?: boolean } = {}) {
  const me = mesh(geo, m, x, gy(x, z) + (o.lift ?? 0), z, o.cast ?? true);
  if (o.rot) me.rotation.y = o.rot;
  if (o.s) me.scale.setScalar(o.s);
  b.add(me, a, e, kind);
  return me;
}
/** Fills open seabed with a mix of grass, small corals, rocks and shells so the foreground never reads as empty sand. */
export function scatter(b: Build, r: ReturnType<typeof rng>, n: number, x0: number, x1: number, z0: number, z1: number, a: number, e: number, scale = 1) {
  const hues: Hue[] = ['pink', 'orange', 'purple', 'teal', 'magenta', 'yellow', 'blue'];
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0), t = a + (e - a) * (i / n) * 0.8, k = i % 5, h = hues[i % hues.length];
    if (k === 0 || k === 1) put(b, seagrass(r, { n: 9, h: (2.4 + r() * 1.6) * scale, spread: 2 * scale, c0: i % 3 ? '#1f8f66' : '#6a3fb8', c1: i % 3 ? '#8af0b8' : '#e0b0ff' }), M.plant(), x, z, t, t + 0.2, 'grow');
    else if (k === 2) put(b, staghorn(r, { h: (1.8 + r() * 1.6) * scale, c0: PAL[h][0], c1: PAL[h][1], depth: 2, roots: 3, seg: 5 }), M.coral(), x, z, t, t + 0.2, 'grow');
    else if (k === 3) put(b, rock(r, { w: (0.9 + r()) * scale, h: (0.5 + r() * 0.5) * scale, d: (0.8 + r()) * scale }), M.rock(), x, z, t, t + 0.15, 'grow');
    else put(b, brainCoral(r, { r: (0.6 + r() * 0.6) * scale, c0: PAL[h][0], c1: PAL[h][1], bubble: i % 2 === 0 }), M.coralStill(), x, z, t, t + 0.2, 'grow');
  }
}
export const combine = (...l: (Live | undefined)[]): Live => ({ update: (dt, t) => l.forEach((x) => x?.update(dt, t)) });
export const school = (b: Build, o: Omit<SchoolOpts, 'progress'>) => {
  const s = new FishSchool({ ...o, progress: () => b.t });
  b.add(s.group, 0, 1, 'none', true);
  return s;
};
export const made = (b: Build, live?: Live, vents?: THREE.Vector3[]): Made => ({ build: b, live, vents });
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Floating light motes that drift up around a point (live). */
export class Orbs implements Live {
  readonly pts: THREE.Points;
  private base: THREE.Vector3[] = [];
  constructor(n: number, center: THREE.Vector3, spread: THREE.Vector3, color: string, size: number, seed: number, private progress: () => number) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) this.base.push(v3(center.x + (r() - 0.5) * spread.x, center.y + (r() - 0.5) * spread.y, center.z + (r() - 0.5) * spread.z));
    this.pts = glowPoints(this.base.map((p) => p.clone()), color, size, 0.35);
    this.pts.visible = false;
  }
  update(_dt: number, time: number) {
    const t = this.progress();
    this.pts.visible = t > 0.02;
    if (!this.pts.visible) return;
    const a = this.pts.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.base.length; i++) {
      const b = this.base[i];
      a.setXYZ(i, b.x + Math.sin(time * 0.35 + i * 1.7) * 1.4, b.y + ((time * 0.6 + i * 3.1) % 6) * 0.8 * Math.min(1, t * 2) - 1, b.z + Math.cos(time * 0.3 + i) * 1.2);
    }
    a.needsUpdate = true;
  }
}

// -------------------------------------------------------------------------------------------------------- baseline ---
/** The quiet starting scene: sandy seabed with a few pebbles, tiny corals and sparse grass. Never a milestone. */
export function baseline(): Made {
  const b = new Build('baseline', 0, 0, 0, 1);
  const r = rng(7);
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * 120, z = 18 - r() * 70;
    put(b, rock(r, { w: 0.5 + r() * 1.1, h: 0.35 + r() * 0.5, d: 0.5 + r() * 1.0, c0: '#8d9a9c', c1: '#c9c4b2', algae: false }), M.rock(), x, z, 0, 1, 'none');
  }
  const tiny: [number, number, Hue][] = [[-2, 12, 'pink'], [6, 6, 'orange'], [-13, 4, 'purple'], [14, 10, 'teal']];
  tiny.forEach(([x, z, h], i) => put(b, staghorn(r, { h: 1.0 + (i % 2) * 0.4, c0: PAL[h][0], c1: PAL[h][1], depth: 2, roots: 3, seg: 5 }), M.coral(), x, z, 0, 1, 'none'));
  for (let i = 0; i < 14; i++) put(b, seagrass(r, { n: 6, h: 1.6, spread: 1.2, c0: '#2e8a55', c1: '#8fdc7a' }), M.plant(), (r() - 0.5) * 70, 14 - r() * 40, 0, 1, 'none');
  for (let i = 0; i < 8; i++) put(b, brainCoral(r, { r: 0.45 + r() * 0.35, c0: '#9a8a62', c1: '#d8c48a' }), M.coralStill(), (r() - 0.5) * 50, 16 - r() * 20, 0, 1, 'none');
  const fish = school(b, { species: [4, 7, 8], count: 4, seed: 3, size: 1.5, mode: 'orbit', center: v3(4, 4.5, 2), rx: 14, rz: 8, ry: 2, speed: 0.18 });
  b.apply(1);
  return made(b, fish);
}

// ---------------------------------------------------------------------------------------------------- Level 1 -------
export function coral1(): Made {
  const b = new Build('coral1', -4, gy(-4, 6), 6, 3.2), r = rng(101);
  put(b, staghorn(r, { h: 3.8, c0: PAL.pink[0], c1: PAL.pink[1], roots: 4, depth: 3 }), M.coral(), -4, 6, 0, 0.85);
  put(b, brainCoral(r, { r: 1.2, c0: PAL.teal[0], c1: PAL.teal[1] }), M.coralStill(), 3, 8.5, 0.2, 0.9);
  put(b, staghorn(r, { h: 2.0, c0: PAL.orange[0], c1: PAL.orange[1], roots: 3, depth: 2 }), M.coral(), -8.5, 9, 0.35, 1);
  return made(b);
}
export function plants(): Made {
  const b = new Build('plants', -2, gy(-2, 8), 8, 3.4), r = rng(102);
  const spots: [number, number][] = [[-11, 7], [9, 9], [-15, 1], [13, 3], [1, 12], [-6, 3.5]];
  spots.forEach(([x, z], i) => put(b, seagrass(r, { n: 12, h: 3.2 + r() * 1.4, spread: 2.4, c0: i % 3 === 1 ? '#6a3fb8' : '#1f8f66', c1: i % 3 === 1 ? '#d6a8ff' : i % 3 === 2 ? '#d7f06a' : '#7ff0c0' }), M.plant(), x, z, i * 0.1, 0.45 + i * 0.1, 'grow'));
  [[-9, 10, 'orange'], [7, 4, 'purple'], [14, 8, 'pink']].forEach(([x, z, h], i) => put(b, featherDuster(r, { r: 0.9 + r() * 0.3, c0: PAL[h as Hue][0], c1: '#fff5ea' }), M.plant(), x as number, z as number, 0.35 + i * 0.1, 0.8 + i * 0.07, 'pop'));
  return made(b);
}
export function fish1(): Made {
  const b = new Build('fish1', 0, 5, 4, 3.6);
  const s = school(b, { species: [0, 3, 4, 5, 8, 2, 1], count: 7, seed: 11, size: 2.3, mode: 'orbit', center: v3(0, 5.2, 5), rx: 13, rz: 8, ry: 3, speed: 0.2, entry: v3(-60, 2, 8) });
  return made(b, s);
}
export function coral2(): Made {
  const b = new Build('coral2', -2, gy(-2, -2), -2, 3.6), r = rng(103);
  put(b, brainCoral(r, { r: 2.6, c0: PAL.purple[0], c1: PAL.teal[1] }), M.coralStill(), -8, -2, 0, 0.55);
  put(b, tableCoral(r, { r: 4.4, c0: PAL.orange[0], c1: PAL.orange[1] }), M.coralStill(), 0, -5, 0.15, 0.7);
  put(b, tubeCoral(r, { n: 9, h: 3.4, c0: PAL.yellow[0], c1: PAL.yellow[1] }), M.coralStill(), 6.5, -3, 0.3, 0.85);
  put(b, brainCoral(r, { r: 1.6, c0: PAL.blue[0], c1: PAL.blue[1], bubble: true }), M.coralStill(), -3, 1.5, 0.45, 1);
  put(b, rock(r, { w: 2.2, h: 1.1, d: 1.8 }), M.rock(), 3, -1, 0, 0.4);
  return made(b);
}
export function anemones(): Made {
  const b = new Build('anemones', 11, gy(11, 4), 4, 3.4), r = rng(104);
  const list: [number, number, string, string, string][] = [[10, 5, '#a2328f', '#ff8ad8', '#ffe28a'], [14, 0.5, '#5a3fb8', '#79e8ff', '#ffffff'], [-13, 7, '#b8503a', '#ffd58a', '#7dffb0']];
  list.forEach(([x, z, c0, c1, tip], i) => {
    put(b, rock(r, { w: 1.7, h: 0.8, d: 1.6 }), M.rock(), x, z, i * 0.1, 0.3 + i * 0.1, 'grow');
    put(b, anemone(r, { r: 1.5, c0, c1, tip }), M.anemone(), x, z, 0.25 + i * 0.12, 0.85 + i * 0.05, 'grow', { lift: 0.6 });
  });
  const clown = school(b, { species: [0], count: 3, seed: 14, size: 1.3, mode: 'orbit', center: v3(11.5, 2.4, 3.5), rx: 2.6, rz: 2.4, ry: 0.8, speed: 0.55 });
  return made(b, clown);
}
export function school1(): Made {
  const b = new Build('school1', -2, 5, -2, 3.6);
  const s = school(b, { species: [7, 4, 5, 8], count: 22, seed: 21, size: 1.7, mode: 'orbit', center: v3(-2, 4.8, -2), rx: 15, rz: 9, ry: 4, speed: 0.22, entry: v3(70, 0, -4) });
  return made(b, s);
}
export function shells(): Made {
  const b = new Build('shells', -2, gy(-2, 13), 13, 3.2), r = rng(105);
  const pairs: [number, number, string, string][] = [[-14, 13, '#f4a3b4', '#fff0e6'], [-6, 15, '#f7c58a', '#fff6e0'], [8, 14, '#c8a2ff', '#f4e8ff'], [13, 12, '#ffd0a2', '#fff3e3']];
  pairs.forEach(([x, z, c0, c1], i) => put(b, scallop(r, { r: 1.0 + r() * 0.35, c0, c1 }), M.shell(), x, z, i * 0.08, 0.35 + i * 0.1, 'pop'));
  [[-10, 14.5], [4, 13.5]].forEach(([x, z], i) => put(b, conch(r, { r: 0.9, c0: '#f7e1c6', c1: '#e7a07a' }), M.shell(), x, z, 0.3 + i * 0.1, 0.65 + i * 0.1, 'pop'));
  [[-2, 16, '#ff7b4a', '#ffd29a'], [10, 16, '#e84a6a', '#ffb4b4'], [-16, 11, '#ffaa3a', '#fff0b0']].forEach(([x, z, c0, c1], i) => put(b, starfish(r, { r: 1.0, c0: c0 as string, c1: c1 as string }), M.shell(), x as number, z as number, 0.5 + i * 0.1, 0.85 + i * 0.05, 'pop', { rot: r() * 6 }));
  [[-8, 12], [6, 11.5]].forEach(([x, z], i) => put(b, urchin(r, { r: 0.55, c0: '#2b1a3f', c1: '#7a4fb8' }), M.shell(), x, z, 0.6 + i * 0.1, 0.95, 'pop'));
  const cl = clam(r, { r: 1.5, c0: '#c8a0d8', c1: '#f4dcec' });
  put(b, cl.shell, M.shell(), 1, 12.5, 0.65, 1, 'pop');
  const pe = mesh(cl.pearl, pearlMat(), 1, gy(1, 12.5), 12.5, false);
  b.add(pe, 0.8, 1, 'pop');
  return made(b);
}
export function reef1(): Made {
  const b = new Build('reef1', 0, 0, 0, 4), r = rng(106);
  put(b, rock(r, { w: 6.5, h: 2.2, d: 4.5 }), M.rock(), -20, 0, 0, 0.25);
  put(b, staghorn(r, { h: 6.4, c0: PAL.purple[0], c1: PAL.purple[1], roots: 5, depth: 3 }), M.coral(), -20, 1, 0.08, 0.5);
  put(b, staghorn(r, { h: 5, c0: PAL.teal[0], c1: PAL.teal[1], roots: 4, depth: 3 }), M.coral(), -15.5, -4, 0.2, 0.6);
  put(b, tableCoral(r, { r: 5, c0: PAL.magenta[0], c1: PAL.magenta[1] }), M.coralStill(), -24, -5, 0.28, 0.65);
  put(b, fanCoral(r, { w: 5, h: 5, c0: PAL.pink[0], c1: PAL.pink[1] }), mat('#ffffff', { rough: 0.6, map: fanTexture(), alphaTest: 0.45, side: THREE.DoubleSide, sway: 0.5 }), -18, 5.5, 0.4, 0.75);
  put(b, rock(r, { w: 5.5, h: 2, d: 4 }), M.rock(), 20, 1, 0.35, 0.55);
  put(b, staghorn(r, { h: 6.8, c0: PAL.orange[0], c1: PAL.orange[1], roots: 5, depth: 3 }), M.coral(), 18.5, -2, 0.45, 0.78);
  put(b, tubeCoral(r, { n: 12, h: 4.6, c0: PAL.pink[0], c1: '#ffd0e0' }), M.coralStill(), 23, 3, 0.55, 0.88);
  put(b, brainCoral(r, { r: 2.4, c0: PAL.green[0], c1: PAL.green[1] }), M.coralStill(), 15, 5.5, 0.62, 0.92);
  put(b, fanCoral(r, { w: 5.5, h: 5.5, c0: PAL.purple[0], c1: PAL.blue[1] }), mat('#ffffff', { rough: 0.6, map: fanTexture(), alphaTest: 0.45, side: THREE.DoubleSide, sway: 0.5 }), 25, -4.5, 0.7, 1);
  put(b, staghorn(r, { h: 3.8, c0: PAL.yellow[0], c1: PAL.yellow[1], roots: 4, depth: 3 }), M.coral(), -11, -7, 0.75, 1);
  return made(b);
}
export function garden2(): Made {
  const b = new Build('garden2', 4, 5, 4, 3.8), r = rng(107);
  const sp: [number, number, string, string][] = [[-18, 9, '#1f8f66', '#7ff0c0'], [-4, 14, '#6a3fb8', '#e0b0ff'], [18, 10, '#2c9aa8', '#9ff0ff'], [6, -9, '#1f8f66', '#d7f06a'], [-12, -9, '#b8338f', '#ff9fd6'], [26, 4, '#1f8f66', '#7ff0c0'], [-27, 3, '#2c9aa8', '#9ff0ff']];
  sp.forEach(([x, z, c0, c1], i) => put(b, seagrass(r, { n: 14, h: 3.8, spread: 3, c0, c1 }), M.plant(), x, z, i * 0.07, 0.35 + i * 0.08, 'grow'));
  [[-7, -9, 'teal'], [11, -7, 'magenta'], [-21, 12, 'pink'], [21, 14, 'orange']].forEach(([x, z, h], i) => put(b, featherDuster(r, { r: 1.1, c0: PAL[h as Hue][0], c1: '#fff5ea' }), M.plant(), x as number, z as number, 0.3 + i * 0.1, 0.65 + i * 0.07, 'pop'));
  [[-10, -13], [14, -12]].forEach(([x, z], i) => put(b, kelp(r, { n: 7, h: 8, spread: 3 }), M.kelp(), x, z, 0.4 + i * 0.1, 0.8, 'grow'));
  const s = school(b, { species: [8, 1, 2, 3, 0], count: 14, seed: 31, size: 2.1, mode: 'orbit', center: v3(14, 6, -4), rx: 10, rz: 7, ry: 3.5, speed: 0.2, entry: v3(60, 3, 2) });
  return made(b, s);
}
export function bloom(): Made {
  const b = new Build('bloom', 0, 4, 2, 4), r = rng(108);
  const fm = mat('#ffffff', { rough: 0.55, map: fanTexture(), alphaTest: 0.45, side: THREE.DoubleSide, sway: 0.55, emissive: '#ff6fb8', ei: 0.18, glow: 'bloom' });
  const list: [number, number, Hue][] = [[-5, 2, 'magenta'], [8, 0, 'orange'], [-12, -2, 'blue'], [4, 9, 'purple'], [16, 6, 'pink'], [-9, 11, 'yellow']];
  list.forEach(([x, z, h], i) => put(b, fanCoral(r, { w: 4.2, h: 4.2, c0: PAL[h][0], c1: PAL[h][1] }), fm, x, z, i * 0.08, 0.35 + i * 0.1, 'pop'));
  const parade = school(b, { species: [0, 1, 2, 3, 4, 5, 7, 8], count: 28, seed: 41, size: 2.0, mode: 'orbit', center: v3(0, 7.5, 2), rx: 22, rz: 12, ry: 4, speed: 0.16, entry: v3(0, 6, 40) });
  const orbs = new Orbs(26, v3(0, 5, 3), v3(46, 8, 22), '#ffe9a8', 1.2, 55, () => b.t);
  b.add(orbs.pts, 0.2, 1, 'none', true);
  return made(b, combine(parade, orbs));
}

export { Octopus, Jelly };
