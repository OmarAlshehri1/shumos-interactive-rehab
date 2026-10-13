import * as THREE from 'three';
import { fbm, mat, merge, mix, noise2, paint, xf, type Rng } from './kit';

/** Every generator returns ONE painted geometry whose origin is at its base (so it can grow out of the seabed). */
const UP = new THREE.Vector3(0, 1, 0);

export const M = {
  coral: () => mat('#ffffff', { rough: 0.62, sway: 0.1 }),
  coralStill: () => mat('#ffffff', { rough: 0.6 }),
  plant: () => mat('#ffffff', { rough: 0.7, side: THREE.DoubleSide, sway: 0.55 }),
  kelp: () => mat('#ffffff', { rough: 0.65, side: THREE.DoubleSide, sway: 1.1 }),
  anemone: () => mat('#ffffff', { rough: 0.5, sway: 0.5 }),
  rock: () => mat('#ffffff', { rough: 0.95, flat: true }),
  shell: () => mat('#ffffff', { rough: 0.35, metal: 0.05 }),
  stone: () => mat('#ffffff', { rough: 0.8 }),
};

let fanTex: THREE.CanvasTexture | null = null;
export function fanTexture(): THREE.CanvasTexture {
  if (fanTex) return fanTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  const ox = S / 2, oy = S - 4;
  for (let i = 0; i < 17; i++) {
    const a = -Math.PI / 2 + (i - 8) * 0.17;
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(ox, oy);
    g.quadraticCurveTo(ox + Math.cos(a) * 110 + Math.sin(i) * 6, oy + Math.sin(a) * 110, ox + Math.cos(a) * 235, oy + Math.sin(a) * 235 * 0.95);
    g.stroke();
  }
  g.lineWidth = 2.6;
  for (let k = 1; k < 9; k++) {
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = -Math.PI / 2 + (i - 20) * 0.0665;
      const rr = k * 26 + Math.sin(i * 1.7 + k) * 3;
      const x = ox + Math.cos(a) * rr, y = oy + Math.sin(a) * rr * 0.95;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  fanTex = new THREE.CanvasTexture(c);
  fanTex.colorSpace = THREE.SRGBColorSpace;
  fanTex.anisotropy = 4;
  return fanTex;
}
export const disposeFlora = () => { fanTex?.dispose(); fanTex = null; };

const shade = (c: THREE.Color, x: number, y: number, z: number, k = 0.14) => c.multiplyScalar(1 - k + noise2(x * 2.6 + z, y * 2.6 - x) * k * 2);

// -------------------------------------------------------------------------------- branching (staghorn) coral -------
export interface BranchOpts { h: number; c0: string; c1: string; roots?: number; depth?: number; seg?: number; spread?: number; fat?: number }
export function staghorn(r: Rng, o: BranchOpts): THREE.BufferGeometry {
  const depth = o.depth ?? 3, seg = o.seg ?? 6, spread = o.spread ?? 0.62, fat = o.fat ?? 0.34;
  const parts: THREE.BufferGeometry[] = [];
  const grow = (base: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, d: number) => {
    const tip = rad * 0.74;
    const g = new THREE.CylinderGeometry(tip, rad, len, seg, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
    g.translate(base.x, base.y, base.z);
    const f = d / depth;
    parts.push(paint(g, (x, y, z) => shade(mix(o.c0, o.c1, f * 0.85 + 0.1), x, y, z, 0.1), (_x, y) => y / 12));
    const end = base.clone().addScaledVector(dir, len);
    if (d < depth) {
      const n = d === 0 ? 3 : r() > 0.45 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const nd = dir.clone().add(new THREE.Vector3((r() - 0.5) * 2 * spread, 0.3 + r() * 0.25, (r() - 0.5) * 2 * spread)).normalize();
        grow(end, nd, len * (0.72 + r() * 0.1), tip * 0.9, d + 1);
      }
    } else {
      const b = new THREE.IcosahedronGeometry(tip * 1.25, 1);
      b.translate(end.x, end.y, end.z);
      parts.push(paint(b, mix(o.c1, '#ffffff', 0.25), (_x, y) => y / 12));
    }
  };
  const roots = o.roots ?? 4;
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + r() * 0.8;
    const dir = new THREE.Vector3(Math.cos(a) * (0.25 + r() * 0.25), 1, Math.sin(a) * (0.25 + r() * 0.25)).normalize();
    grow(new THREE.Vector3(Math.cos(a) * 0.35, -0.1, Math.sin(a) * 0.35), dir, 1.7 + r() * 0.5, fat * (0.9 + r() * 0.3), 0);
  }
  const g = merge(parts);
  g.computeBoundingBox();
  const maxY = Math.max(0.5, g.boundingBox!.max.y);
  g.scale(o.h / maxY, o.h / maxY, o.h / maxY);
  // normalise the sway weights to the final height
  const sw = g.attributes.aSway as THREE.BufferAttribute, p = g.attributes.position;
  for (let i = 0; i < sw.count; i++) sw.setX(i, Math.min(1, p.getY(i) / o.h) * 0.9);
  return g;
}

// -------------------------------------------------------------------------------------------- brain / bubble coral
export function brainCoral(r: Rng, o: { r: number; c0: string; c1: string; bubble?: boolean }): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(o.r, 4);
  const p = g.attributes.position;
  const ph = r() * 10;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i).normalize();
    let d = 0;
    if (o.bubble) {
      const cell = noise2(v.x * 5 + ph, v.z * 5 + v.y * 4);
      d = Math.pow(Math.sin(cell * Math.PI * 4) * 0.5 + 0.5, 0.6) * 0.16;
    } else {
      const w = Math.abs(Math.sin(v.x * 4.3 + Math.sin(v.y * 5 + v.z * 3 + ph) * 1.8 + v.z * 2.2));
      d = Math.pow(1 - w, 0.7) * 0.12;
    }
    const rr = o.r * (1 + d) * (1 + (fbm(v.x * 2 + ph, v.z * 2) - 0.5) * 0.22);
    p.setXYZ(i, v.x * rr, Math.max(v.y * rr * 0.72, -o.r * 0.1), v.z * rr);
  }
  g.translate(0, o.r * 0.1, 0);
  g.computeVertexNormals();
  return paint(g, (x, y, z, nx, ny) => {
    const w = o.bubble ? noise2(x * 4 + ph, z * 4 + y * 3) : Math.abs(Math.sin(x * 3.2 + Math.sin(y * 4 + z * 3 + ph) * 1.8 + z * 1.6));
    const c = mix(o.c0, o.c1, o.bubble ? w : 1 - w);
    return c.multiplyScalar(0.8 + ny * 0.25);
  }, (_x, y) => y / (o.r * 2) * 0.3);
}

// ------------------------------------------------------------------------------------------------------ tube coral -
export function tubeCoral(r: Rng, o: { n: number; h: number; c0: string; c1: string }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < o.n; i++) {
    const a = r() * 6.28, rad = Math.sqrt(r()) * o.h * 0.38;
    const h = o.h * (0.45 + r() * 0.55), rT = o.h * (0.09 + r() * 0.05), rB = rT * 1.35;
    const g = new THREE.CylinderGeometry(rT, rB, h, 10, 1, false);
    g.translate(0, h / 2, 0);
    paint(g, (x, y, z, _nx, ny) => (ny > 0.95 ? new THREE.Color('#3b1218') : shade(mix(o.c0, o.c1, y / h), x, y, z, 0.1)), (_x, y) => y / o.h * 0.6);
    const rim = new THREE.TorusGeometry(rT * 0.96, rT * 0.2, 6, 14);
    rim.rotateX(Math.PI / 2); rim.translate(0, h, 0);
    paint(rim, mix(o.c1, '#ffffff', 0.3), (_x, y) => y / o.h * 0.6);
    const m = merge([g, rim]);
    xf(m, [Math.cos(a) * rad, 0, Math.sin(a) * rad], [(r() - 0.5) * 0.28, r() * 6, (r() - 0.5) * 0.28]);
    parts.push(m);
  }
  return merge(parts);
}

// ----------------------------------------------------------------------------------------------------- table coral -
export function tableCoral(r: Rng, o: { r: number; c0: string; c1: string }): THREE.BufferGeometry {
  const R = o.r;
  const prof = [[0.001, 0.5], [0.45, 0.5], [0.8, 0.56], [1, 0.62], [1, 0.66], [0.82, 0.64], [0.4, 0.6], [0.001, 0.58]].map(([x, y]) => new THREE.Vector2(x * R, y * R));
  const plate = new THREE.LatheGeometry(prof, 36);
  const p = plate.attributes.position, ph = r() * 9;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), ang = Math.atan2(z, x), rad = Math.hypot(x, z), f = rad / R;
    const k = 1 + 0.07 * Math.sin(ang * 7 + ph) + 0.04 * Math.sin(ang * 13);
    p.setXYZ(i, x * k, p.getY(i) + Math.sin(ang * 18 + rad * 2) * 0.03 * R * f + Math.sin(ang * 3 + ph) * 0.04 * R * f, z * k);
  }
  plate.computeVertexNormals();
  paint(plate, (x, y, z) => shade(mix(o.c0, o.c1, Math.hypot(x, z) / R), x, y, z, 0.12), (_x, y) => 0.35 + y / R * 0.2);
  const stalk = new THREE.CylinderGeometry(R * 0.16, R * 0.24, R * 0.58, 8, 1, true);
  stalk.translate(0, R * 0.29, 0);
  paint(stalk, o.c0, 0);
  const g = merge([plate, stalk]);
  xf(g, [0, 0, 0], [(r() - 0.5) * 0.2, r() * 6, (r() - 0.5) * 0.2]);
  return g;
}

// ------------------------------------------------------------------------------------------------------------- fan -
export function fanCoral(r: Rng, o: { w: number; h: number; c0: string; c1: string }): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(o.w, o.h, 14, 14);
  g.translate(0, o.h / 2, 0);
  const p = g.attributes.position, ph = r() * 5;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, Math.sin(x * 0.7 + ph) * o.w * 0.06 + (y / o.h) * (y / o.h) * o.h * 0.05);
  }
  g.computeVertexNormals();
  paint(g, (x, y, z) => shade(mix(o.c0, o.c1, y / o.h), x, y, z, 0.1), (_x, y) => y / o.h);
  g.rotateY(r() * 6.28);
  return g;
}

// -------------------------------------------------------------------------------------------------------- anemone -
export function anemone(r: Rng, o: { r: number; c0: string; c1: string; tip: string; n?: number }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.CylinderGeometry(o.r * 0.7, o.r * 0.95, o.r * 0.7, 14, 1, false);
  base.translate(0, o.r * 0.35, 0);
  parts.push(paint(base, mix(o.c0, '#40252d', 0.45), 0));
  const n = o.n ?? 46;
  for (let i = 0; i < n; i++) {
    const ring = i < n * 0.45 ? 0 : i < n * 0.8 ? 1 : 2;
    const a = r() * 6.28, d = o.r * (0.15 + ring * 0.28 + r() * 0.12), len = o.r * (1.5 - ring * 0.2) * (0.8 + r() * 0.4);
    const t = new THREE.CylinderGeometry(o.r * 0.05, o.r * 0.1, len, 5, 4, true);
    t.translate(0, len / 2, 0);
    paint(t, (x, y) => mix(o.c0, o.c1, y / len), (_x, y) => Math.min(1, y / len));
    const tipb = new THREE.IcosahedronGeometry(o.r * 0.11, 0);
    tipb.translate(0, len, 0);
    paint(tipb, o.tip, 1);
    const m = merge([t, tipb]);
    const tilt = 0.15 + ring * 0.32 + r() * 0.2;
    xf(m, [Math.cos(a) * d, o.r * 0.6, Math.sin(a) * d], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt]);
    parts.push(m);
  }
  return merge(parts);
}

// ------------------------------------------------------------------------------------------------ plants / grasses -
export function seagrass(r: Rng, o: { n: number; h: number; spread: number; c0: string; c1: string; w?: number }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < o.n; i++) {
    const h = o.h * (0.6 + r() * 0.6), w = (o.w ?? 0.2) * (0.8 + r() * 0.6);
    const g = new THREE.PlaneGeometry(w, h, 1, 7);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position, bend = (r() - 0.5) * h * 0.5, tw = r() * 6.28;
    for (let k = 0; k < p.count; k++) {
      const u = p.getY(k) / h;
      p.setXYZ(k, p.getX(k) * (1 - u * 0.75) + u * u * bend, p.getY(k), Math.sin(u * 3 + tw) * 0.05 * h * u);
    }
    g.rotateY(r() * 6.28);
    g.translate((r() - 0.5) * o.spread, 0, (r() - 0.5) * o.spread);
    parts.push(paint(g, (x, y, z) => shade(mix(o.c0, o.c1, y / o.h), x, y, z, 0.1), (_x, y) => Math.min(1, y / h)));
  }
  return merge(parts);
}
export function kelp(r: Rng, o: { n: number; h: number; spread: number }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < o.n; i++) {
    const h = o.h * (0.7 + r() * 0.5), w = 0.55 + r() * 0.5;
    const g = new THREE.PlaneGeometry(w, h, 2, 22);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position, ph = r() * 6.28;
    for (let k = 0; k < p.count; k++) {
      const u = p.getY(k) / h;
      p.setXYZ(k, p.getX(k) * (1 + Math.sin(u * 22 + ph) * 0.28) * (1 - u * 0.5) + Math.sin(u * 5 + ph) * 0.5 * u, p.getY(k), Math.cos(u * 4 + ph) * 0.35 * u);
    }
    g.rotateY(r() * 6.28);
    g.translate((r() - 0.5) * o.spread, 0, (r() - 0.5) * o.spread);
    parts.push(paint(g, (x, y, z) => shade(mix('#5f7d24', '#c8c447', y / h), x, y, z, 0.12), (_x, y) => Math.min(1, y / h)));
  }
  return merge(parts);
}
export function featherDuster(r: Rng, o: { r: number; c0: string; c1: string; n?: number }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = o.n ?? 20;
  const stem = new THREE.CylinderGeometry(o.r * 0.12, o.r * 0.2, o.r * 1.3, 6, 1, true);
  stem.translate(0, o.r * 0.65, 0);
  parts.push(paint(stem, mix(o.c0, '#3b2a45', 0.5), 0));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + r() * 0.2, len = o.r * (1.1 + r() * 0.35);
    const g = new THREE.ConeGeometry(o.r * 0.13, len, 4, 3, true);
    g.translate(0, len / 2, 0);
    paint(g, (x, y, z) => mix(o.c0, o.c1, y / len + (Math.floor(y * 3.2 / o.r) % 2) * 0.22), (_x, y) => Math.min(1, y / len) * 0.9);
    const t = 0.35 + r() * 0.55;
    xf(g, [Math.cos(a) * o.r * 0.12, o.r * 1.25, Math.sin(a) * o.r * 0.12], [Math.sin(a) * t, a, -Math.cos(a) * t]);
    parts.push(g);
  }
  return merge(parts);
}

// ----------------------------------------------------------------------------------------------------------- shells -
export function scallop(r: Rng, o: { r: number; c0: string; c1: string }): THREE.BufferGeometry {
  const R = o.r;
  const g = new THREE.SphereGeometry(R, 28, 10, 0, 2.3, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), rr = Math.hypot(x, z);
    const rib = 1 + 0.07 * Math.sin(a * 16) * (rr / R);
    p.setXYZ(i, x * rib, y * 0.38 + Math.abs(Math.sin(a * 8)) * 0.05 * R * (rr / R), z * rib);
  }
  g.computeVertexNormals();
  g.rotateY(-1.15);
  paint(g, (x, y, z) => mix(o.c0, o.c1, Math.hypot(x, z) / R * 0.8 + Math.abs(Math.sin(Math.atan2(z, x) * 8)) * 0.18), 0);
  xf(g, [0, R * 0.05, 0], [-0.35, r() * 6, 0]);
  return g;
}
export function conch(r: Rng, o: { r: number; c0: string; c1: string }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let s = o.r, px = 0, py = o.r * 0.55, pz = 0;
  for (let k = 0; k < 6; k++) {
    const g = new THREE.IcosahedronGeometry(s, 2);
    g.scale(1, 0.85, 1);
    g.translate(px, py, pz);
    parts.push(paint(g, (x, y, z) => mix(o.c0, o.c1, (Math.sin((y - py) * 9 / o.r) * 0.5 + 0.5) * 0.4 + k * 0.1), 0));
    px += Math.cos(k * 1.2) * s * 0.3; pz += Math.sin(k * 1.2) * s * 0.3; py += s * 0.78; s *= 0.68;
  }
  const spike = new THREE.ConeGeometry(o.r * 0.12, o.r * 0.5, 6);
  spike.translate(px, py + o.r * 0.1, pz);
  parts.push(paint(spike, o.c1, 0));
  const g = merge(parts);
  xf(g, [0, 0, 0], [Math.PI / 2.4, r() * 6, 0]);
  g.translate(0, o.r * 0.45, 0);
  return g;
}
export function starfish(r: Rng, o: { r: number; c0: string; c1: string }): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, rr = i % 2 === 0 ? o.r : o.r * 0.42;
    if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: o.r * 0.12, bevelEnabled: true, bevelSize: o.r * 0.12, bevelThickness: o.r * 0.1, bevelSegments: 3 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, o.r * 0.1, 0);
  paint(g, (x, y, z, nx, ny) => mix(o.c0, o.c1, Math.hypot(x, z) / o.r).multiplyScalar(0.8 + 0.3 * noise2(x * 9, z * 9) * (ny > 0.5 ? 1 : 0.4)), 0);
  g.rotateY(r() * 6);
  return g;
}
export function urchin(r: Rng, o: { r: number; c0: string; c1: string }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.IcosahedronGeometry(o.r, 2);
  body.translate(0, o.r, 0);
  parts.push(paint(body, o.c0, 0));
  for (let i = 0; i < 46; i++) {
    const v = new THREE.Vector3(r() - 0.5, r() * 0.9 + 0.05, r() - 0.5).normalize();
    const len = o.r * (1.2 + r() * 0.8);
    const s = new THREE.ConeGeometry(o.r * 0.05, len, 4);
    s.translate(0, len / 2 + o.r * 0.7, 0);
    s.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, v));
    s.translate(0, o.r, 0);
    parts.push(paint(s, mix(o.c0, o.c1, r()), 0));
  }
  return merge(parts);
}

// -------------------------------------------------------------------------------------------------------------- rocks
export function rock(r: Rng, o: { w: number; h: number; d: number; c0?: string; c1?: string; algae?: boolean }): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position, ph = r() * 20;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i).normalize();
    const n = fbm(v.x * 1.7 + ph, v.y * 1.7 + v.z * 1.3 + ph * 0.7, 3);
    const k = 0.72 + n * 0.62;
    p.setXYZ(i, v.x * k * o.w, Math.max(v.y * k * o.h, -o.h * 0.25), v.z * k * o.d);
  }
  g.computeVertexNormals();
  const c0 = o.c0 ?? '#5f7587', c1 = o.c1 ?? '#8da1ac';
  paint(g, (x, y, z, _nx, ny) => {
    const n = noise2(x * 0.6 + ph, z * 0.6 + y * 0.4);
    const c = mix(c0, c1, n * 0.8 + Math.max(0, ny) * 0.3);
    if (o.algae !== false) c.lerp(new THREE.Color('#5d8a4a'), Math.max(0, ny - 0.35) * noise2(x * 1.4, z * 1.4) * 1.1);
    return c;
  }, 0);
  g.translate(0, o.h * 0.2, 0);
  return g;
}
