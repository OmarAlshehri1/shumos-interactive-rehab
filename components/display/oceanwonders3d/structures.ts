import * as THREE from 'three';
import { M, rock, staghorn } from './flora';
import { fbm, mat, merge, mix, noise2, paint, rng, U, xf, type Rng } from './kit';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const sm = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const C = (h: string) => new THREE.Color(h);

/** Scene point lights are created once up front (adding a light later would recompile every material); builders drive their intensity. */
export const lights = { cave: new THREE.PointLight('#5fe8ff', 0, 46, 1.6), palace: new THREE.PointLight('#ffd98a', 0, 90, 1.4) };
export const resetLights = () => { lights.cave = new THREE.PointLight('#5fe8ff', 0, 46, 1.6); lights.palace = new THREE.PointLight('#ffd98a', 0, 90, 1.4); };

// ------------------------------------------------------------------------------------------- additive glow sprites
export function glowPoints(pts: THREE.Vector3[], color: string, size: number, pulse = 0.25): THREE.Points {
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: U.time, uC: { value: new THREE.Color(color) }, uS: { value: size }, uP: { value: pulse } },
    vertexShader: `uniform float uT; uniform float uS; uniform float uP; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        float ph = position.x * 0.7 + position.z * 0.5; float k = 1.0 + uP * sin(uT * 1.6 + ph);
        gl_PointSize = clamp(uS * 420.0 / -mv.z * k, 2.0, 160.0); vA = clamp(1.4 - (-mv.z) / 420.0, 0.2, 1.0); }`,
    fragmentShader: `uniform vec3 uC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.2); gl_FragColor = vec4(uC, a * 0.75 * vA); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 6;
  return p;
}

// --------------------------------------------------------------------------------------------------- stone arches ---
/** A natural-looking stone arch; apex up, both feet at y=0 (embedded). `elegant` gives a smooth, fluted pale-coral arch. */
export function arch(r: Rng, o: { R: number; tube: number; elegant?: boolean; c0?: string; c1?: string }): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(o.R, o.tube, o.elegant ? 14 : 12, o.elegant ? 48 : 36, Math.PI);
  const p = g.attributes.position, ph = r() * 30;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = o.elegant ? Math.sin(Math.atan2(y, x) * 28) * 0.05 : (fbm(x * 0.28 + ph, y * 0.28 + z * 0.3, 3) - 0.5) * 0.9;
    const cx = Math.cos(Math.atan2(y, x)) * o.R, cy = Math.sin(Math.atan2(y, x)) * o.R;
    const dx = x - cx, dy = y - cy, dz = z;
    const k = 1 + n * (o.elegant ? 1 : 1.2);
    p.setXYZ(i, cx + dx * k, cy + dy * k, dz * k * (o.elegant ? 1 : 1.25));
  }
  g.computeVertexNormals();
  const c0 = o.c0 ?? (o.elegant ? '#e9d6cf' : '#66798a'), c1 = o.c1 ?? (o.elegant ? '#fff0e6' : '#9aaab5');
  paint(g, (x, y, z, _nx, ny) => {
    const n = noise2(x * 0.3 + ph, y * 0.3 + z * 0.3);
    const c = mix(c0, c1, n * 0.8 + Math.max(0, ny) * 0.3);
    if (!o.elegant) c.lerp(C('#5d8a4a'), Math.max(0, ny - 0.3) * noise2(x * 0.9, z * 0.9) * 1.3);
    return c;
  }, 0);
  g.translate(0, -o.tube * 0.2, 0);
  return g;
}

// ---------------------------------------------------------------------------------------------------------- the cave --
/** A glowing cave mouth: a horseshoe of rocks around a dark hollow with crystals inside. Faces +Z. */
export function cave(r: Rng): { shell: THREE.BufferGeometry; crystals: THREE.BufferGeometry; pts: THREE.Vector3[] } {
  const parts: THREE.BufferGeometry[] = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.05 + 0.9 * (i / (n - 1)));
    const R = 9 + (i % 2) * 0.8;
    const rk = rock(r, { w: 4.4 + r() * 1.6, h: 5.2 + r() * 2.2, d: 5 + r(), c0: '#4f6577', c1: '#7f95a3' });
    xf(rk, [Math.cos(a) * R, 0, -Math.sin(a) * R * 0.75], [0, r() * 6, 0], 1 + Math.sin(a) * 0.55);
    parts.push(rk);
  }
  // roof rocks closing the arc overhead
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.18 + 0.64 * (i / 5));
    const rk = rock(r, { w: 4.8, h: 3.4, d: 5.5, c0: '#55697a', c1: '#8fa4b1' });
    xf(rk, [Math.cos(a) * 7.5, 5.6 + Math.sin(a) * 2.4, -Math.sin(a) * 5.4], [r() * 0.5, r() * 6, 0], 1.15);
    parts.push(rk);
  }
  // dark hollow
  const back = new THREE.SphereGeometry(8.5, 20, 12, 0, Math.PI, 0, Math.PI / 2);
  back.rotateY(Math.PI); back.scale(1, 0.7, 0.8);
  parts.push(paint(back, '#173243', 0));
  const crystals: THREE.BufferGeometry[] = [];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 22; i++) {
    const a = Math.PI * (0.12 + 0.76 * r()), d = 2.2 + r() * 5.6, h = 0.9 + r() * 2.8;
    const cr = new THREE.ConeGeometry(0.28 + r() * 0.32, h, 5);
    cr.translate(0, h / 2, 0);
    const col = ['#58f0ff', '#8a7bff', '#5affc8'][i % 3];
    paint(cr, (x, y) => mix(col, '#ffffff', clamp01(y / h * 0.7)), 0);
    xf(cr, [Math.cos(a) * d, 0, -Math.sin(a) * d * 0.62 - 1], [(r() - 0.5) * 0.6, r() * 6, (r() - 0.5) * 0.6]);
    crystals.push(cr);
    if (i % 2 === 0) pts.push(new THREE.Vector3(Math.cos(a) * d, h * 0.8, -Math.sin(a) * d * 0.62 - 1));
  }
  return { shell: merge(parts), crystals: merge(crystals), pts };
}

// ----------------------------------------------------------------------------------------------- glowing plants / clams
export const glowMat = (hue: string, group = 'bio') => mat('#ffffff', { rough: 0.35, emissive: hue, ei: 1.5, sway: 0.55, glow: group, caustics: 0.2 });
export function glowPlant(r: Rng, o: { h: number; hue: string; stalks?: number }): { geo: THREE.BufferGeometry; pts: THREE.Vector3[] } {
  const parts: THREE.BufferGeometry[] = [];
  const pts: THREE.Vector3[] = [];
  const n = o.stalks ?? 6;
  for (let s = 0; s < n; s++) {
    const a = r() * 6.28, h = o.h * (0.55 + r() * 0.6), bend = (r() - 0.5) * h * 0.55, off = (r() - 0.5) * o.h * 0.45;
    const seg = 7;
    for (let k = 0; k < seg; k++) {
      const u0 = k / seg, u1 = (k + 1) / seg;
      const p0 = new THREE.Vector3(bend * u0 * u0, h * u0, 0), p1 = new THREE.Vector3(bend * u1 * u1, h * u1, 0);
      const len = p0.distanceTo(p1);
      const c = new THREE.CylinderGeometry(0.07 * (1 - u1 * 0.6), 0.07 * (1 - u0 * 0.6), len, 5, 1, true);
      c.translate(0, len / 2, 0);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()));
      c.translate(p0.x, p0.y, p0.z);
      paint(c, mix('#ffffff', '#ffffff', 0), (_x, y) => clamp01(y / o.h));
      parts.push(xf(c, [Math.cos(a) * off, 0, Math.sin(a) * off], [0, a, 0]));
    }
    const bulbs = 3 + Math.floor(r() * 3);
    for (let b = 0; b < bulbs; b++) {
      const u = 0.4 + (b / bulbs) * 0.6, rad = 0.22 + r() * 0.2;
      const bg = new THREE.IcosahedronGeometry(rad, 1);
      bg.translate(bend * u * u + (r() - 0.5) * 0.4, h * u, (r() - 0.5) * 0.4);
      paint(bg, '#ffffff', clamp01(h * u / o.h));
      xf(bg, [Math.cos(a) * off, 0, Math.sin(a) * off], [0, a, 0]);
      parts.push(bg);
      const p = new THREE.Vector3().fromBufferAttribute(bg.attributes.position, 0);
      bg.computeBoundingBox();
      bg.boundingBox!.getCenter(p);
      pts.push(p);
    }
  }
  return { geo: merge(parts), pts };
}

/** Giant clam with a glowing pearl. Returns the two geometries (shell with open lid, pearl). */
export function clam(r: Rng, o: { r: number; c0: string; c1: string }): { shell: THREE.BufferGeometry; pearl: THREE.BufferGeometry; pearlPos: THREE.Vector3 } {
  const half = (flip: boolean) => {
    const g = new THREE.SphereGeometry(o.r, 26, 10, 0, Math.PI, 0, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      p.setXYZ(i, x * (1 + 0.06 * Math.sin(a * 18)), y * 0.55 + Math.abs(Math.sin(a * 9)) * 0.06 * o.r, z * (1 + 0.06 * Math.sin(a * 18)));
    }
    g.computeVertexNormals();
    paint(g, (x, y, z, _nx, ny) => mix(o.c0, o.c1, Math.hypot(x, z) / o.r * 0.7 + Math.abs(Math.sin(Math.atan2(z, x) * 9)) * 0.2), 0);
    if (flip) { g.rotateX(Math.PI); g.rotateZ(0); }
    return g;
  };
  const lo = half(false);
  lo.rotateX(0);
  lo.translate(0, o.r * 0.1, 0);
  const up = half(true);
  up.rotateX(0.0); up.translate(0, o.r * 0.1, 0);
  // rotate the lid open about the back hinge
  up.translate(0, 0, o.r); up.rotateX(0.75); up.translate(0, 0, -o.r);
  const inner = new THREE.CircleGeometry(o.r * 0.92, 24);
  inner.rotateX(-Math.PI / 2); inner.translate(0, o.r * 0.12, 0);
  paint(inner, '#f8c8d0', 0);
  const pearl = new THREE.IcosahedronGeometry(o.r * 0.32, 3);
  pearl.translate(0, o.r * 0.34, 0);
  paint(pearl, (x, y) => mix('#ffffff', '#ffd9f0', noise2(x * 3, y * 3)), 0);
  return { shell: merge([lo, up, inner]), pearl, pearlPos: new THREE.Vector3(0, o.r * 0.34, 0) };
}
export const pearlMat = () => mat('#ffffff', { rough: 0.18, metal: 0.25, emissive: '#dff2ff', ei: 0.7, glow: 'pearls', caustics: 0.3 });

// ---------------------------------------------------------------------------------------------------- the shipwreck ---
let woodTex: THREE.CanvasTexture | null = null;
function plankTexture() {
  if (woodTex) return woodTex;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!, r = rng(3);
  g.fillStyle = '#b79568'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 8; i++) {
    const y = i * (S / 8);
    g.fillStyle = `rgba(${60 + r() * 40},${40 + r() * 30},${20 + r() * 20},0.22)`; g.fillRect(0, y, S, S / 8);
    g.fillStyle = 'rgba(30,18,8,0.65)'; g.fillRect(0, y, S, 3);
    for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(40,24,10,0.16)'; g.fillRect(r() * S, y + r() * (S / 8), 20 + r() * 80, 1.5); }
  }
  woodTex = new THREE.CanvasTexture(c);
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.anisotropy = 4;
  return woodTex;
}
let sailTex: THREE.CanvasTexture | null = null;
function sailTexture() {
  if (sailTex) return sailTex;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!, r = rng(9);
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) { g.beginPath(); const x = r() * S, y = r() * S; g.moveTo(x, y); for (let k = 0; k < 6; k++) g.lineTo(x + (r() - 0.5) * 70, y + (r() - 0.5) * 70); g.closePath(); g.fill(); }
  for (let y = S - 40; y < S; y += 4) { g.fillRect(0, y, S, 2); }
  sailTex = new THREE.CanvasTexture(c);
  sailTex.colorSpace = THREE.SRGBColorSpace;
  return sailTex;
}
export const disposeStructures = () => { woodTex?.dispose(); woodTex = null; sailTex?.dispose(); sailTex = null; };

export interface Ship { hull: THREE.BufferGeometry; deck: THREE.BufferGeometry; spars: THREE.BufferGeometry; sails: THREE.BufferGeometry; cabin: THREE.BufferGeometry; warm: THREE.BufferGeometry; gold: THREE.BufferGeometry; lanterns: THREE.Vector3[]; deckPts: THREE.Vector3[] }
/** Decorative fantasy wreck, ~34 long, bow towards +Z, keel at y=0. Hull is open in the middle so the ribs show. */
export function ship(r: Rng): Ship {
  const L = 34, W = 7.6, D = 5.2;
  const wU = (u: number) => W * Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * u)), 0.65) * (u > 0.85 ? 1 - (u - 0.85) * 3.2 : 1);
  const deckY = (u: number) => D + 0.8 + 3.4 * Math.pow(u, 3.2) + 0.9 * (1 - u) * (1 - u);
  const draft = (u: number) => D * (0.95 - 0.4 * Math.pow(u, 3));
  const NU = 34, NV = 16;
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  const P = (u: number, v: number): [number, number, number] => { const phi = v * Math.PI; return [-wU(u) * Math.cos(phi), deckY(u) - Math.sin(phi) * draft(u) - 0.0, L * (u - 0.5)]; };
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) { const p = P(i / NU, j / NV); pos.push(...p); uvs.push((i / NU) * 6, (j / NV) * 3); }
  const hole = (i: number, j: number) => { const u = (i + 0.5) / NU, v = (j + 0.5) / NV; return u > 0.34 && u < 0.6 && ((v < 0.46) || (v > 0.0 && v < 0.2 && u < 0.5)); };
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    if (hole(i, j)) continue;
    const a = i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const hullG = new THREE.BufferGeometry();
  hullG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hullG.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  hullG.setIndex(idx);
  hullG.computeVertexNormals();
  paint(hullG, (x, y, z) => {
    const n = noise2(x * 0.5, z * 0.4 + y * 0.3);
    const c = C('#d2b080').lerp(C('#8f6c45'), n * 0.8);
    c.lerp(C('#4c7d58'), clamp01((deckY(0.5) - y) / D * 0.5 - 0.2) * clamp01(noise2(x * 0.9 + 3, z * 0.7) * 1.6));
    return c;
  }, 0);
  const ribs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const u = 0.36 + i * 0.045;
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, k) => { const p = P(u, 0.02 + (k / 8) * 0.42); return new THREE.Vector3(p[0], p[1], p[2]); }));
    const t = new THREE.TubeGeometry(curve, 14, 0.22, 5, false);
    ribs.push(paint(t, '#6a4a2b', 0));
  }
  // keel
  const keel = new THREE.BoxGeometry(0.5, 0.6, L * 0.92);
  keel.translate(0, deckY(0.5) - D - 0.05, 0);
  ribs.push(paint(keel, '#5a3d22', 0));
  const hullAll = merge([hullG, ...ribs], true);
  // deck
  const dk: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 26; i++) {
    const u = (i + 0.5) / 26;
    if (u > 0.36 && u < 0.58) continue;
    const w = wU(u) * 0.9, len = L / 26 * 0.93;
    const pl = new THREE.BoxGeometry(w * 2, 0.22, len);
    pl.translate(0, deckY(u) - 0.35 + (i % 2) * 0.01, L * (u - 0.5));
    dk.push(paint(pl, mix('#c9a877', '#8a6540', noise2(i * 0.9, 2)), 0));
  }
  // rails with posts
  for (const sx of [-1, 1]) for (let i = 0; i < 18; i++) {
    const u = 0.04 + (i / 17) * 0.92;
    if (u > 0.4 && u < 0.58 && sx < 0) continue;
    const post = new THREE.CylinderGeometry(0.1, 0.12, 1.5, 5);
    post.translate(sx * wU(u) * 0.97, deckY(u) + 0.3, L * (u - 0.5));
    dk.push(paint(post, '#6e4c2c', 0));
  }
  const deckAll = merge(dk, true);
  // spars: masts (one snapped), yards, bowsprit, rigging, wheel
  const sp: THREE.BufferGeometry[] = [];
  const mast = (x: number, z: number, h: number, tiltX: number, tiltZ: number, rad = 0.32) => {
    const m = new THREE.CylinderGeometry(rad * 0.7, rad, h, 8);
    m.translate(0, h / 2, 0);
    xf(m, [x, deckY(0.5) - 0.4, z], [tiltX, 0, tiltZ]);
    return paint(m, '#7b5a38', 0);
  };
  sp.push(mast(0, L * 0.06, 22, 0.05, 0.1));
  sp.push(mast(0, L * 0.3, 11, -0.06, -0.55, 0.28)); // fore mast, leaning
  const lying = new THREE.CylinderGeometry(0.2, 0.28, 8.5, 7);
  lying.translate(0, 4.25, 0);
  xf(lying, [2.8, deckY(0.5) + 1.8, L * 0.0 - 1.2], [1.35, 0.4, -1.25]);
  sp.push(paint(lying, '#7b5a38', 0));
  const yard = (y: number, w: number, z: number) => { const b = new THREE.CylinderGeometry(0.14, 0.14, w, 6); b.rotateZ(Math.PI / 2); xf(b, [0.9, y, z], [0, 0.0, 0.12]); return paint(b, '#6e4c2c', 0); };
  sp.push(yard(deckY(0.5) + 18, 9, L * 0.06), yard(deckY(0.5) + 11, 11, L * 0.06));
  const bows = new THREE.CylinderGeometry(0.16, 0.24, 8, 6);
  bows.translate(0, 4, 0);
  xf(bows, [0, deckY(1) - 0.6, L * 0.5 - 0.6], [Math.PI / 2 - 0.34, 0, 0]);
  sp.push(paint(bows, '#6e4c2c', 0));
  for (let i = 0; i < 6; i++) {
    const a = new THREE.Vector3(0.0, deckY(0.5) + 20, L * 0.06), b = new THREE.Vector3((i % 2 ? 1 : -1) * wU(0.5 + (i % 3) * 0.04) * 0.95, deckY(0.5), L * (0.02 + (i % 3) * 0.05));
    const len = a.distanceTo(b);
    const rd = new THREE.CylinderGeometry(0.035, 0.035, len, 4);
    rd.translate(0, len / 2, 0);
    rd.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    rd.translate(a.x, a.y, a.z);
    sp.push(paint(rd, '#9a8a6a', (_x, y) => clamp01(y / 24) * 0.3));
  }
  const wheel = new THREE.TorusGeometry(0.9, 0.09, 6, 16);
  xf(wheel, [0, deckY(0.1) + 1.6, -L * 0.34], [0, 0, 0]);
  sp.push(paint(wheel, '#6e4c2c', 0));
  for (let i = 0; i < 8; i++) { const s = new THREE.CylinderGeometry(0.05, 0.05, 2.1, 4); xf(s, [0, deckY(0.1) + 1.6, -L * 0.34], [0, 0, (i / 8) * Math.PI]); sp.push(paint(s, '#6e4c2c', 0)); }
  // cannons
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const c = new THREE.CylinderGeometry(0.26, 0.34, 2.0, 8);
    c.rotateZ(Math.PI / 2);
    xf(c, [sx * (wU(0.28 + i * 0.07) + 0.3), deckY(0.3 + i * 0.07) - 1.0, L * (0.28 + i * 0.07 - 0.5)], [0, 0, 0]);
    sp.push(paint(c, '#262b30', 0));
  }
  // anchor
  const anc = [new THREE.TorusGeometry(0.5, 0.09, 6, 12), new THREE.CylinderGeometry(0.09, 0.09, 2.8, 6), new THREE.TorusGeometry(1.2, 0.1, 6, 14, Math.PI)];
  anc[1].translate(0, -1.4, 0); anc[2].rotateZ(Math.PI); anc[2].translate(0, -2.7, 0);
  const ancM = merge(anc.map((g) => paint(g, '#3b4348', 0)));
  xf(ancM, [wU(0.82) + 0.6, deckY(0.82) - 0.5, L * 0.32], [0.1, 0.3, 0.4]);
  sp.push(ancM);
  const sparsAll = merge(sp);
  // sails (torn, swaying)
  const s1 = new THREE.PlaneGeometry(8.6, 7.5, 6, 7);
  s1.translate(0.9, deckY(0.5) + 14.5, L * 0.06 + 0.1);
  const sailP = s1.attributes.position;
  for (let i = 0; i < sailP.count; i++) sailP.setZ(i, sailP.getZ(i) + Math.sin(sailP.getX(i) * 0.6) * 0.45);
  s1.computeVertexNormals();
  paint(s1, (x, y) => mix('#f2e8cf', '#c5b48d', noise2(x * 0.5, y * 0.5)), (_x, y) => clamp01(1 - (y - (deckY(0.5) + 10.8)) / 7.5) * 0.9);
  const s2 = new THREE.PlaneGeometry(10.6, 5.0, 6, 5);
  s2.translate(0.9, deckY(0.5) + 8.2, L * 0.06 + 0.1);
  paint(s2, (x, y) => mix('#f2e8cf', '#bda982', noise2(x * 0.5 + 4, y * 0.5)), (_x, y) => clamp01(1 - (y - (deckY(0.5) + 5.7)) / 5) * 0.9);
  const sailsAll = merge([s1, s2], true);
  // stern cabin + warm windows + lanterns + gold (treasure)
  const cab: THREE.BufferGeometry[] = [];
  const cb = new THREE.BoxGeometry(wU(0.12) * 1.5, 3.6, 7);
  cb.translate(0, deckY(0.1) + 1.4, -L * 0.36);
  cab.push(paint(cb, '#a07c52', 0));
  const roof = new THREE.BoxGeometry(wU(0.12) * 1.7, 0.4, 7.6);
  roof.translate(0, deckY(0.1) + 3.4, -L * 0.36);
  cab.push(paint(roof, '#6d4b2b', 0));
  const warm: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) { const w = new THREE.BoxGeometry(1.2, 1.2, 0.2); w.translate(-1.9 + i * 1.9, deckY(0.1) + 1.9, -L * 0.36 - 3.55); warm.push(paint(w, '#ffe3a0', 0)); }
  const lanterns = [new THREE.Vector3(-2.4, deckY(0.2) + 2.6, -L * 0.27), new THREE.Vector3(2.4, deckY(0.2) + 2.6, -L * 0.27), new THREE.Vector3(0, deckY(0.95) + 1.2, L * 0.46)];
  lanterns.forEach((p) => { const s = new THREE.IcosahedronGeometry(0.34, 1); s.translate(p.x, p.y, p.z); warm.push(paint(s, '#fff0c0', 0)); });
  const gold: THREE.BufferGeometry[] = [];
  const chest = new THREE.BoxGeometry(2.2, 1.1, 1.4); chest.translate(1.6, deckY(0.45) - 0.3, L * (0.45 - 0.5) + 0.2); gold.push(paint(chest, '#8a5a2b', 0));
  const lid = new THREE.CylinderGeometry(0.7, 0.7, 2.2, 10, 1, false, 0, Math.PI); lid.rotateZ(Math.PI / 2); lid.rotateY(Math.PI / 2); lid.translate(1.6, deckY(0.45) + 0.5, L * (0.45 - 0.5) + 0.2); gold.push(paint(lid, '#9a6a35', 0));
  for (let i = 0; i < 16; i++) { const cn = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 8); cn.translate(1.0 + r() * 1.2, deckY(0.45) + 0.55 + r() * 0.3, L * (0.45 - 0.5) + (r() - 0.5) * 0.9); gold.push(paint(cn, '#ffd34d', 0)); }
  return { hull: hullAll, deck: deckAll, spars: sparsAll, sails: sailsAll, cabin: merge(cab), warm: merge(warm), gold: merge(gold), lanterns, deckPts: [new THREE.Vector3(1.6, deckY(0.45) + 0.8, L * (0.45 - 0.5) + 0.2)] };
}
export const woodMat = () => mat('#ffffff', { rough: 0.9, map: plankTexture() });
export const sailMat = () => mat('#ffffff', { rough: 0.95, map: sailTexture(), alphaTest: 0.5, side: THREE.DoubleSide, sway: 0.8 });
export const warmMat = () => mat('#ffffff', { rough: 0.4, emissive: '#ffcf70', ei: 1.4, glow: 'warm', caustics: 0 });
export const goldMat = () => mat('#ffffff', { rough: 0.25, metal: 0.8, emissive: '#c88a10', ei: 0.35 });

// ------------------------------------------------------------------------------------------------------ coral palace --
const gold = () => mat('#ffffff', { rough: 0.28, metal: 0.65, emissive: '#b88a1a', ei: 0.25 });
export const palaceMats = {
  pearl: () => mat('#ffffff', { rough: 0.45, metal: 0.05 }),
  gold,
  dome: () => mat('#ffffff', { rough: 0.3, metal: 0.25 }),
  window: () => mat('#ffffff', { rough: 0.4, emissive: '#ffd98a', ei: 0.45, glow: 'palace', caustics: 0 }),
  orb: () => mat('#ffffff', { rough: 0.2, emissive: '#eaf6ff', ei: 0.9, glow: 'palace', caustics: 0 }),
};
function domeGeo(R: number, color: string, y0: number): THREE.BufferGeometry {
  const prof = [[R * 1.12, 0], [R * 1.22, R * 0.14], [R * 1.05, R * 0.42], [R * 0.62, R * 0.95], [R * 0.2, R * 1.6], [0.001, R * 2.05]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(prof, 24);
  g.translate(0, y0, 0);
  return paint(g, (x, y, z) => mix(color, '#d9fff6', clamp01((y - y0) / (R * 2) * 0.8) + Math.sin(Math.atan2(z, x) * 12) * 0.05), 0);
}
function towerParts(R: number, H: number, domeColor: string) {
  const body: THREE.BufferGeometry[] = [], trim: THREE.BufferGeometry[] = [], win: THREE.BufferGeometry[] = [], dome: THREE.BufferGeometry[] = [];
  const cyl = new THREE.CylinderGeometry(R, R * 1.1, H, 24);
  cyl.translate(0, H / 2, 0);
  body.push(paint(cyl, (x, y, z) => mix('#ffdfe6', '#fff6ea', clamp01(y / H) * 0.7 + Math.sin(Math.atan2(z, x) * 10) * 0.08), 0));
  for (const f of [0.02, 0.36, 0.7, 0.97]) { const t = new THREE.TorusGeometry(R * 1.06, R * 0.07, 6, 28); t.rotateX(Math.PI / 2); t.translate(0, H * f, 0); trim.push(paint(t, '#ffd36e', 0)); }
  const bal = new THREE.CylinderGeometry(R * 1.28, R * 1.2, R * 0.14, 24); bal.translate(0, H * 0.99, 0); trim.push(paint(bal, '#ffe9b0', 0));
  const n = Math.max(5, Math.round(R * 1.6));
  for (const f of [0.18, 0.52, 0.82]) for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + f * 3;
    const w = new THREE.BoxGeometry(R * 0.22, H * 0.09, R * 0.1);
    xf(w, [Math.cos(a) * R * 1.02, H * f, Math.sin(a) * R * 1.02], [0, -a + Math.PI / 2, 0]);
    win.push(paint(w, '#ffe3a0', 0));
  }
  dome.push(domeGeo(R, domeColor, H * 1.0));
  const fin = new THREE.CylinderGeometry(R * 0.04, R * 0.07, R * 0.8, 6); fin.translate(0, H + R * 2.05 + R * 0.4, 0); trim.push(paint(fin, '#ffd36e', 0));
  const orb = new THREE.IcosahedronGeometry(R * 0.2, 2); orb.translate(0, H + R * 2.05 + R * 0.95, 0);
  return { body: merge(body), trim: merge(trim), win: merge(win), dome: merge(dome), orb: paint(orb, '#ffffff', 0) };
}
export interface Palace { parts: { terrace: THREE.BufferGeometry; walls: THREE.BufferGeometry; towers: { body: THREE.BufferGeometry; trim: THREE.BufferGeometry; win: THREE.BufferGeometry; dome: THREE.BufferGeometry; orb: THREE.BufferGeometry; x: number; z: number; s: number }[]; gate: THREE.BufferGeometry }; orbPos: THREE.Vector3[] }
export function palace(r: Rng): Palace {
  const terr: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const t = new THREE.CylinderGeometry(40 - i * 5, 42 - i * 5, 1.6, 10);
    t.translate(0, 0.8 + i * 1.6, 0);
    terr.push(paint(t, (x, y, z) => mix('#e6d3bd', '#f7e8d6', noise2(x * 0.2, z * 0.2) * 0.8 + i * 0.1), 0));
  }
  for (let i = 0; i < 7; i++) { const st = new THREE.BoxGeometry(18 - i * 0.5, 0.7, 2); st.translate(0, 0.35 + i * 0.7, 26 - i * 1.6 + 7); terr.push(paint(st, '#fff1de', 0)); }
  const walls: THREE.BufferGeometry[] = [];
  const corners: [number, number][] = [[-17, -9], [17, -9], [-17, 11], [17, 11]];
  const ring = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), a = Math.atan2(bx - ax, bz - az);
    const w = new THREE.BoxGeometry(2.4, 9, len); w.translate(0, 4.5 + 4.8, 0);
    xf(w, [(ax + bx) / 2, 0, (az + bz) / 2], [0, a, 0]);
    walls.push(paint(w, (x, y) => mix('#ffe3e8', '#fff4ea', clamp01((y - 5) / 9)), 0));
    const n = Math.floor(len / 3);
    for (let i = 0; i < n; i++) { const m = new THREE.ConeGeometry(1.1, 2.4, 4); m.translate(0, 9.6 + 1.2 + 4.6, 0); const t = (i + 0.5) / n; xf(m, [ax + (bx - ax) * t, 0, az + (bz - az) * t], [0, a + Math.PI / 4, 0]); walls.push(paint(m, '#ffd36e', 0)); }
  };
  ring(...corners[0], ...corners[1]); ring(...corners[0], ...corners[2]); ring(...corners[1], ...corners[3]);
  ring(corners[2][0], corners[2][1], -6, 11); ring(6, 11, corners[3][0], corners[3][1]);
  const towers = [
    { ...towerParts(7, 36, '#6fe0dc'), x: 0, z: -2, s: 1 },
    ...corners.map(([x, z], i) => ({ ...towerParts(3.7, 20 + (i % 2) * 5, i % 2 ? '#ff9fb8' : '#7fe0e6'), x, z, s: 1 })),
    ...[[-9, 14], [9, 14]].map(([x, z]) => ({ ...towerParts(2.4, 14, '#ffd36e'), x, z, s: 1 })),
  ];
  const orbPos = towers.map((t, i) => new THREE.Vector3(t.x, (i === 0 ? 36 + 7 * 2.05 + 7 * 0.95 : 24 + 3.7 * 3), t.z));
  const gate: THREE.BufferGeometry[] = [];
  const ga = new THREE.TorusGeometry(4.2, 0.9, 8, 24, Math.PI);
  ga.translate(0, 6.5, 12.4);
  gate.push(paint(ga, '#ffe9b0', 0));
  for (const sx of [-1, 1]) { const p = new THREE.CylinderGeometry(0.9, 1.0, 6.5, 10); p.translate(sx * 4.2, 3.2, 12.4); gate.push(paint(p, '#ffdfe6', 0)); }
  void r;
  return { parts: { terrace: merge(terr), walls: merge(walls), towers, gate: merge(gate) }, orbPos };
}

// ------------------------------------------------------------------------------------------------------ pearl spire ---
/** The grand central landmark: a spiral coral-shell tower holding a giant pearl. Base at y=0, pearl floats above it. */
export function spire(r: Rng): { tower: THREE.BufferGeometry; gold: THREE.BufferGeometry; pearl: THREE.BufferGeometry; pearlY: number } {
  const parts: THREE.BufferGeometry[] = [];
  const H = 30;
  for (let k = 0; k < 16; k++) {
    const u = k / 15, y = u * H, rad = 5.2 * (1 - u * 0.78) + 0.5, a = u * 9;
    const ring = new THREE.TorusGeometry(rad, rad * 0.36, 8, 22);
    ring.rotateX(Math.PI / 2);
    ring.translate(Math.cos(a) * 1.2 * (1 - u), y, Math.sin(a) * 1.2 * (1 - u));
    parts.push(paint(ring, (x, yy, z) => mix('#ff9fc2', '#fff0e2', u * 0.8 + noise2(x * 0.4, z * 0.4) * 0.2), 0));
  }
  const base = new THREE.CylinderGeometry(8, 10, 2.4, 14);
  base.translate(0, 1.2, 0);
  parts.push(paint(base, '#f4dcc4', 0));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 6.28, c = staghorn(r, { h: 9 + r() * 3, c0: '#e66a8f', c1: '#ffc6d6', depth: 2, roots: 2, seg: 5 });
    xf(c, [Math.cos(a) * 9.5, 0, Math.sin(a) * 9.5], [0, r() * 6, 0]);
    parts.push(c);
  }
  const cradle: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28;
    const claw = new THREE.ConeGeometry(0.7, 7, 6);
    claw.translate(0, 3.5, 0);
    xf(claw, [Math.cos(a) * 3.2, H - 1, Math.sin(a) * 3.2], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]);
    cradle.push(paint(claw, '#ffd36e', 0));
  }
  const pearl = new THREE.IcosahedronGeometry(4.2, 4);
  paint(pearl, (x, y, z) => mix('#ffffff', '#ffd9f4', noise2(x * 0.5, y * 0.5 + z * 0.3) * 0.7), 0);
  return { tower: merge(parts), gold: merge(cradle), pearl, pearlY: H + 6.6 };
}

export function ringGeo(R: number, tube: number, color: string): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(R, tube, 8, 48);
  return paint(g, color, 0);
}
export { M, U };
