import * as THREE from 'three';
import { DOLPHIN, Swimmer, Turtle, Octopus, cetaceanGeo, type SwimPath } from './creatures';
import { M, anemone, brainCoral, fanCoral, fanTexture, kelp, rock, staghorn, tableCoral, tubeCoral } from './flora';
import { Build, mat, mesh, rng, type Made } from './kit';
import { seabedY as gy } from './seabed';
import { arch, cave, glowMat, glowPlant, glowPoints, lights, ship, sailMat, warmMat, woodMat, goldMat } from './structures';
import { PAL, combine, made, put, school, scatter, Orbs, type Hue } from './builders1';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const fanMat = () => mat('#ffffff', { rough: 0.6, map: fanTexture(), alphaTest: 0.45, side: THREE.DoubleSide, sway: 0.5 });
const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function bigreef(): Made {
  const b = new Build('bigreef', 0, 0, -16, 4.6), r = rng(201);
  const rocks: [number, number, number][] = [[-46, -10, 9], [44, -17, 8.5], [-36, -22, 6], [34, -28, 6.5]];
  rocks.forEach(([x, z, w], i) => put(b, rock(r, { w, h: w * 0.4, d: w * 0.7 }), M.rock(), x, z, i * 0.05, 0.25 + i * 0.05));
  put(b, staghorn(r, { h: 12, c0: PAL.purple[0], c1: PAL.purple[1], roots: 6, depth: 3, seg: 7 }), M.coral(), -46, -10, 0.1, 0.45);
  put(b, staghorn(r, { h: 9, c0: PAL.teal[0], c1: PAL.teal[1], roots: 5, depth: 3, seg: 7 }), M.coral(), -38, -6, 0.2, 0.55);
  put(b, tableCoral(r, { r: 9, c0: PAL.orange[0], c1: PAL.orange[1] }), M.coralStill(), -53, -3, 0.3, 0.62);
  put(b, brainCoral(r, { r: 4.4, c0: PAL.pink[0], c1: PAL.pink[1] }), M.coralStill(), -33, -13, 0.4, 0.7);
  put(b, fanCoral(r, { w: 9, h: 9, c0: PAL.magenta[0], c1: PAL.magenta[1] }), fanMat(), -42, -2, 0.5, 0.78);
  put(b, staghorn(r, { h: 11, c0: PAL.pink[0], c1: PAL.pink[1], roots: 6, depth: 3, seg: 7 }), M.coral(), 44, -17, 0.35, 0.65);
  put(b, staghorn(r, { h: 9.5, c0: PAL.orange[0], c1: PAL.orange[1], roots: 5, depth: 3, seg: 7 }), M.coral(), 38, -22, 0.45, 0.72);
  put(b, tubeCoral(r, { n: 15, h: 8, c0: PAL.yellow[0], c1: PAL.yellow[1] }), M.coralStill(), 53, -10, 0.55, 0.82);
  put(b, tableCoral(r, { r: 7.5, c0: PAL.magenta[0], c1: PAL.magenta[1] }), M.coralStill(), 33, -28, 0.62, 0.9);
  put(b, brainCoral(r, { r: 4.8, c0: PAL.green[0], c1: PAL.green[1], bubble: true }), M.coralStill(), 50, -22, 0.72, 0.95);
  put(b, fanCoral(r, { w: 9.5, h: 9.5, c0: PAL.blue[0], c1: PAL.blue[1] }), fanMat(), 40, -13, 0.8, 1);
  put(b, anemone(r, { r: 2.6, c0: '#a2328f', c1: '#ff8ad8', tip: '#ffe28a' }), M.anemone(), -30, -4, 0.7, 1, 'grow', { lift: 0.8 });
  // foreground framing: big corals at the edges of the shot
  put(b, rock(r, { w: 8, h: 3, d: 6 }), M.rock(), -62, 16, 0.2, 0.45);
  put(b, staghorn(r, { h: 13, c0: PAL.pink[0], c1: PAL.pink[1], roots: 6, depth: 3, seg: 7 }), M.coral(), -62, 16, 0.3, 0.6);
  put(b, tableCoral(r, { r: 9, c0: PAL.yellow[0], c1: PAL.orange[1] }), M.coralStill(), -50, 26, 0.5, 0.8);
  put(b, rock(r, { w: 8, h: 3, d: 6 }), M.rock(), 63, 20, 0.25, 0.5);
  put(b, staghorn(r, { h: 12, c0: PAL.teal[0], c1: PAL.blue[1], roots: 6, depth: 3, seg: 7 }), M.coral(), 63, 20, 0.4, 0.7);
  put(b, brainCoral(r, { r: 5.5, c0: PAL.purple[0], c1: PAL.magenta[1] }), M.coralStill(), 52, 28, 0.6, 0.9);
  scatter(b, r, 26, -56, 56, 12, 34, 0.15, 1, 1.5);
  return made(b);
}

export function turtle(): Made {
  const b = new Build('turtle', 0, 9, -20, 3.4);
  const path: SwimPath = (t, o) => o.set(Math.cos(t) * 36, 9.5 + Math.sin(t * 1.7) * 1.8, -22 + Math.sin(t) * 13);
  const tu = new Turtle(2.0, path, 0.075, () => b.t);
  b.add(tu.group, 0, 1, 'none', true);
  return made(b, tu);
}
export function dolphins(): Made {
  const b = new Build('dolphins', 0, 14, -50, 3.6);
  const geo = cetaceanGeo(DOLPHIN);
  const mk = (ph: number, y: number, phase: number) => {
    const p: SwimPath = (t, o) => o.set(Math.cos(t + ph) * 66, y + Math.sin(t * 2.3 + ph) * 4.5, -52 + Math.sin(t + ph) * 17);
    const s = new Swimmer(geo.clone(), 7.5, p, 0.11, { amp: 0.05, freq: 3.4, k: 7 }, phase, () => b.t);
    b.add(s.group, 0, 1, 'none', true);
    return s;
  };
  return made(b, combine(mk(0, 15, 0), mk(0.55, 12, 1.7)));
}
export function caveBuild(): Made {
  const b = new Build('cave', -62, gy(-62, -40), -40, 4), r = rng(203);
  const c = cave(r);
  const ry = 0.38;
  c.shell.rotateY(ry); c.crystals.rotateY(ry);
  put(b, c.shell, M.rock(), -62, -40, 0, 0.55, 'grow', { cast: true });
  const cm = mat('#ffffff', { rough: 0.25, emissive: '#6fe6ff', ei: 1.5, glow: 'cave', caustics: 0.1 });
  const crys = put(b, c.crystals, cm, -62, -40, 0.4, 1, 'pop', { cast: false });
  const world = c.pts.map((p) => p.clone().applyAxisAngle(v3(0, 1, 0), ry).add(v3(-62, gy(-62, -40), -40)));
  const halo = glowPoints(world, '#6fe6ff', 2.6, 0.3);
  b.add(halo, 0.5, 1, 'none', true);
  void crys;
  const px = -62 + Math.sin(ry) * -3, pz = -40 + 2;
  return made(b, { update: () => { lights.cave.position.set(px, 4 + gy(-62, -40), pz); lights.cave.intensity = 70 * sm(0.3, 1, b.t); } }, [v3(-62, 2, -38)]);
}
export function school2(): Made {
  const b = new Build('school2', 0, 10, -38, 4);
  const path = (t: number, o: THREE.Vector3) => o.set(Math.cos(t) * 42, 9.5 + Math.sin(t * 2) * 2.4, -37 + Math.sin(t) * Math.cos(t) * 40);
  const s = school(b, { species: [1, 2, 3, 4, 5, 8, 7, 0], count: 56, seed: 211, size: 2.3, mode: 'path', path, center: v3(0, 10, -38), speed: 0.12, gap: 1.7, entry: v3(-90, 0, 10) });
  return made(b, s);
}
export function shipBuild(): Made {
  const b = new Build('ship', 40, gy(40, -48), -48, 4.4), r = rng(206);
  const sh = ship(r);
  const rot = new THREE.Euler(0.1, -0.7, 0.22);
  const q = new THREE.Matrix4().makeRotationFromEuler(rot);
  const place = (g: THREE.BufferGeometry) => { g.translate(0, -1.4, 0); g.applyMatrix4(q); return g; };
  const wx = 40, wz = -48, wy = gy(wx, wz) - 0.6;
  const at = (g: THREE.BufferGeometry, m: THREE.Material, a: number, e: number, kind: 'grow' | 'rise' | 'pop', cast = true) => { const me = mesh(place(g), m, wx, wy, wz, cast); b.add(me, a, e, kind); return me; };
  at(sh.hull, woodMat(), 0, 0.45, 'rise');
  at(sh.deck, woodMat(), 0.3, 0.6, 'rise');
  at(sh.spars, mat('#ffffff', { rough: 0.9 }), 0.45, 0.78, 'rise');
  at(sh.cabin, mat('#ffffff', { rough: 0.9 }), 0.55, 0.8, 'pop');
  at(sh.sails, sailMat(), 0.7, 1, 'pop', false);
  at(sh.warm, warmMat(), 0.75, 1, 'pop', false);
  at(sh.gold, goldMat(), 0.8, 1, 'pop', false);
  // life growing on the wreck
  const world = (p: THREE.Vector3) => p.clone().add(v3(0, -1.4, 0)).applyMatrix4(q).add(v3(wx, wy, wz));
  const tops: [number, number, number, Hue][] = [[-2.2, 7.1, -6, 'orange'], [2.4, 7.0, 4.5, 'pink'], [0.2, 6.9, -11, 'teal'], [3.0, 8.4, 14, 'purple']];
  tops.forEach(([x, y, z, h], i) => {
    const g = staghorn(r, { h: 2.4, c0: PAL[h][0], c1: PAL[h][1], depth: 2, roots: 3, seg: 5 });
    const p = world(v3(x, y, z));
    const me = mesh(g, M.coral(), p.x, p.y, p.z);
    b.add(me, 0.82 + i * 0.04, 1, 'grow');
  });
  const lan = glowPoints(sh.lanterns.map(world), '#ffcf70', 2.2, 0.2);
  b.add(lan, 0.8, 1, 'none', true);
  const treasure = glowPoints(sh.deckPts.map(world), '#ffe28a', 2.4, 0.3);
  b.add(treasure, 0.85, 1, 'none', true);
  const vents = [world(v3(-1, 6.5, -2)), world(v3(2, 6.5, 8))];
  return made(b, undefined, vents);
}
export function archBuild(): Made {
  const b = new Build('arch', 0, gy(0, -38), -38, 3.8), r = rng(207);
  put(b, arch(r, { R: 12, tube: 3.4 }), M.rock(), 0, -38, 0, 0.6, 'rise', { lift: 0.2 });
  put(b, rock(r, { w: 6, h: 2.4, d: 5 }), M.rock(), -13, -36, 0.1, 0.5);
  put(b, rock(r, { w: 6, h: 2.4, d: 5 }), M.rock(), 13, -37, 0.15, 0.55);
  const top = gy(0, -38) + 12 + 3.2;
  [[-5, 'orange'], [3, 'pink'], [8, 'teal']].forEach(([x, h], i) => { const g = staghorn(r, { h: 3.4, c0: PAL[h as Hue][0], c1: PAL[h as Hue][1], depth: 2, roots: 3, seg: 5 }); const me = mesh(g, M.coral(), x as number, top - Math.abs(x as number) * 0.55 - 0.4, -38); b.add(me, 0.6 + i * 0.1, 1, 'grow'); });
  put(b, kelp(r, { n: 5, h: 7, spread: 1.6 }), M.kelp(), -12, -38, 0.6, 1);
  put(b, kelp(r, { n: 5, h: 8, spread: 1.6 }), M.kelp(), 12.5, -38.5, 0.65, 1);
  return made(b);
}
export function glow1(): Made {
  const b = new Build('glow1', -30, gy(-30, -34), -34, 3.6), r = rng(208);
  const hues: [string, string][] = [['#4ff0ff', 'bio'], ['#ff5ad8', 'bio'], ['#9dff5a', 'bio']];
  const spots: [number, number][] = [[-52, -34], [-58, -44], [-48, -48], [-8, -34], [9, -35], [-14, -42], [16, -42], [30, -40], [-36, -30], [27, -34]];
  const orbsPts: THREE.Vector3[][] = [[], [], []];
  spots.forEach(([x, z], i) => {
    const hue = i % 3, gp = glowPlant(r, { h: 5.5 + r() * 2.5, hue: hues[hue][0] });
    const y = gy(x, z);
    put(b, gp.geo, glowMat(hues[hue][0]), x, z, (i / spots.length) * 0.5, 0.45 + (i / spots.length) * 0.5, 'grow');
    gp.pts.forEach((p) => orbsPts[hue].push(p.clone().add(v3(x, y, z))));
  });
  hues.forEach(([c], h) => { if (orbsPts[h].length) b.add(glowPoints(orbsPts[h], c, 1.6, 0.35), 0.4, 1, 'none', true); });
  return made(b);
}
export function kelpForest(): Made {
  const b = new Build('kelp', 0, 0, -66, 4.2), r = rng(209);
  const spots: [number, number][] = [[-34, -62], [-22, -70], [-8, -66], [8, -72], [22, -64], [34, -70], [-62, -20], [60, -34]];
  spots.forEach(([x, z], i) => put(b, kelp(r, { n: 14, h: 17 + r() * 5, spread: 5 }), M.kelp(), x, z, (i / spots.length) * 0.55, 0.45 + (i / spots.length) * 0.55, 'grow'));
  return made(b);
}
export function friend(): Made {
  const b = new Build('friend', 22, gy(22, -12), -12, 3.6), r = rng(210);
  [[21, -14, 3.4], [25, -13, 2.6], [23, -10, 2.2], [19, -11, 2.0]].forEach(([x, z, w], i) => put(b, rock(r, { w, h: w * 0.9, d: w * 0.8 }), M.rock(), x, z, i * 0.06, 0.28 + i * 0.05));
  put(b, anemone(r, { r: 1.2, c0: '#b8338f', c1: '#ffb0e8', tip: '#fff0a0' }), M.anemone(), 17, -9, 0.2, 0.55, 'grow', { lift: 0.4 });
  const home = v3(22.5, gy(22, -14) + 1.2, -15), out = v3(18.5, gy(18, -8) + 2.0, -7);
  const o = new Octopus(home, out, 1.6, () => Math.max(0, (b.t - 0.3) / 0.7));
  b.add(o.group, 0, 1, 'none', true);
  const s = school(b, { species: [7], count: 4, seed: 215, size: 1.4, mode: 'orbit', center: v3(23, 5.5, -10), rx: 4, rz: 4, ry: 1.5, speed: 0.5 });
  return made(b, combine(o, s));
}
export function panorama(): Made {
  const b = new Build('panorama', 0, 0, -90, 4.6), r = rng(211);
  for (let i = 0; i < 16; i++) {
    const x = -105 + i * 14 + (r() - 0.5) * 6, z = -88 - r() * 12;
    const kind = i % 4;
    if (kind === 0) put(b, staghorn(r, { h: 16 + r() * 6, c0: PAL[(['purple', 'teal', 'pink', 'orange'] as Hue[])[i % 4]][0], c1: PAL[(['purple', 'teal', 'pink', 'orange'] as Hue[])[(i >> 2) % 4]][1], roots: 5, depth: 3, seg: 6 }), M.coral(), x, z, (i / 16) * 0.6, 0.4 + (i / 16) * 0.6, 'grow');
    else if (kind === 1) put(b, staghorn(r, { h: 18 + r() * 6, c0: PAL.blue[0], c1: PAL.teal[1], roots: 5, depth: 3, seg: 6 }), M.coral(), x, z, (i / 16) * 0.6, 0.4 + (i / 16) * 0.6, 'grow');
    else if (kind === 2) put(b, tableCoral(r, { r: 11, c0: PAL.orange[0], c1: PAL.yellow[1] }), M.coralStill(), x, z, (i / 16) * 0.6, 0.4 + (i / 16) * 0.6, 'grow');
    else put(b, tubeCoral(r, { n: 14, h: 12, c0: PAL.pink[0], c1: PAL.magenta[1] }), M.coralStill(), x, z, (i / 16) * 0.6, 0.4 + (i / 16) * 0.6, 'grow');
  }
  const orbs = new Orbs(24, v3(0, 14, -60), v3(150, 24, 60), '#bff4ff', 1.5, 77, () => b.t);
  b.add(orbs.pts, 0.3, 1, 'none', true);
  return made(b, orbs);
}
