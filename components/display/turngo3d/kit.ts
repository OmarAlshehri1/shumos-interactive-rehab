import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dist, type Pt } from '@/lib/turngo3d/courses';

/** Course (x, y-up) to world (x, height, -y). The camera looks down with screen-up = world -Z. */
export const W3 = (p: Pt, h = 0) => new THREE.Vector3(p[0], h, -p[1]);

/** Collects everything a scene allocates so it can all be released in one call. */
export class Disposer {
  private items: { dispose(): void }[] = [];
  add<T extends { dispose(): void }>(x: T): T {
    this.items.push(x);
    return x;
  }
  dispose() {
    for (const i of this.items) i.dispose();
    this.items = [];
  }
}

const hash = (x: number, y: number, z: number, s: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453;
  return v - Math.floor(v);
};

function paint(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number]) {
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export const color3 = (hex: number | string): [number, number, number] => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Constant-colour vertex paint for parts that are merged with others. */
export function solid(geo: THREE.BufferGeometry, hex: number | string) {
  const c = color3(hex);
  return paint(geo, () => c);
}

/** Strip along a spline: U across, V along (in world units / vScale), flat at height y. Vertex colours default to white. */
export function ribbonGeometry(points: Pt[], width: number, y: number, vScale = 2, uScale = 1): THREE.BufferGeometry {
  const n = points.length;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), col = new Float32Array(n * 2 * 3).fill(1), nor = new Float32Array(n * 2 * 3);
  const idx: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    if (i > 0) s += dist(points[i - 1], points[i]);
    const nx = -ty, ny = tx, hw = width / 2;
    const L = [points[i][0] + nx * hw, points[i][1] + ny * hw], R = [points[i][0] - nx * hw, points[i][1] - ny * hw];
    pos.set([L[0], y, -L[1], R[0], y, -R[1]], i * 6);
    nor.set([0, 1, 0, 0, 1, 0], i * 6);
    uv.set([0, s / vScale, uScale, s / vScale], i * 4);
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Flat 5-point star lying on the floor (face up), bevelled so it catches light. */
export function starGeometry(outer = 1, inner = 0.46, depth = 0.2): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer, a = (Math.PI / 5) * i + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i) sh.lineTo(x, y); else sh.moveTo(x, y);
  }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.45, bevelSize: outer * 0.07, bevelSegments: 3, curveSegments: 2 });
  g.translate(0, 0, -depth / 2);
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** Smooth displaced blob (foliage, rocks, bushes) with an up-lit vertex gradient. */
export function blobGeometry(radius: number, seed: number, detail = 2, squash = 1, lobes = 0.22, light: number | string = 0x8bd35a, dark: number | string = 0x2f7d32): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.getAttribute('position');
  const lc = color3(light), dc = color3(dark), col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + (hash(Math.round(x * 5), Math.round(y * 5), Math.round(z * 5), seed) - 0.5) * lobes + Math.sin(x * 3 + seed) * lobes * 0.35;
    pos.setXYZ(i, x * k, y * k * squash, z * k);
    const t = THREE.MathUtils.clamp((y / radius + 1) / 2, 0, 1);
    const c = mix(dc, lc, t * 0.85 + hash(i, seed, 3, 1) * 0.15);
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p;
    if (!q.getAttribute('uv')) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.getAttribute('position').count * 2), 2));
    if (!q.getAttribute('color')) paint(q, () => [1, 1, 1]);
    if (!q.getAttribute('normal')) q.computeVertexNormals();
    return q;
  });
  return mergeGeometries(prepared, false)!;
}

const trans = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
};
export { trans };

/** Traffic cone: soft lathe body + white reflective band + square base. Footprint radius ~0.3 cu. */
export function coneParts(): { body: THREE.BufferGeometry; band: THREE.BufferGeometry; base: THREE.BufferGeometry } {
  const H = 0.84, r0 = 0.23, r1 = 0.04, y0 = 0.05;
  const rAt = (y: number) => r0 + (r1 - r0) * ((y - y0) / (H - y0));
  const body = new THREE.LatheGeometry([new THREE.Vector2(r0, y0), new THREE.Vector2(rAt(0.2), 0.2), new THREE.Vector2(rAt(0.55), 0.55), new THREE.Vector2(rAt(0.7), 0.7), new THREE.Vector2(r1, H - 0.02), new THREE.Vector2(0.0, H)], 40);
  const band = new THREE.LatheGeometry([new THREE.Vector2(rAt(0.3) + 0.012, 0.3), new THREE.Vector2(rAt(0.3) + 0.012, 0.3), new THREE.Vector2(rAt(0.5) + 0.012, 0.5)], 40);
  const base: THREE.BufferGeometry = new THREE.CylinderGeometry(0.29, 0.31, 0.05, 28);
  base.translate(0, 0.025, 0);
  return { body, band, base };
}

/** Round lollipop-style tree: trunk + three displaced canopy blobs, vertex coloured. */
export function treeGeometry(seed: number, leafLight: number | string, leafDark: number | string, trunk: number | string = 0x7a5230, height = 1): THREE.BufferGeometry {
  const t: THREE.BufferGeometry = new THREE.CylinderGeometry(0.1 * height, 0.16 * height, 1.1 * height, 10);
  t.translate(0, 0.55 * height, 0);
  solid(t, trunk);
  const parts: THREE.BufferGeometry[] = [t];
  const spec: [number, number, number, number][] = [[0, 1.35, 0, 0.75], [0.38, 1.05, 0.1, 0.5], [-0.34, 1.12, -0.12, 0.52]];
  spec.forEach(([x, y, z, r], i) => parts.push(trans(blobGeometry(r * height, seed + i, 2, 0.95, 0.2, leafLight, leafDark), x * height, y * height, z * height)));
  return merge(parts);
}

/** Palm: curved segmented trunk plus eight arched fronds. */
export function palmGeometry(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bend = 0.55 + (seed % 3) * 0.12, segs = 9, H = 2.6;
  let x = 0, y = 0, a = 0;
  for (let i = 0; i < segs; i++) {
    const r0 = 0.15 - i * 0.008, r1 = r0 - 0.008, seg = H / segs;
    const g = new THREE.CylinderGeometry(r1, r0, seg * 1.04, 8);
    g.translate(0, seg / 2, 0);
    solid(g, i % 2 ? 0x8a6238 : 0x9a7040);
    g.rotateZ(-a);
    g.translate(x, y, 0);
    parts.push(g);
    a += bend / segs; x += Math.sin(a) * seg; y += Math.cos(a) * seg;
  }
  for (let f = 0; f < 8; f++) {
    const ang = (f / 8) * Math.PI * 2, len = 1.5 + ((f + seed) % 3) * 0.2;
    const leaf = new THREE.PlaneGeometry(0.44, len, 1, 8);
    const p = leaf.getAttribute('position');
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const t = THREE.MathUtils.clamp((p.getY(i) + len / 2) / len, 0, 1), wv = Math.sin(t * Math.PI) * 0.5 + 0.12;
      p.setXYZ(i, p.getX(i) * wv * 2.0, t * len, -Math.pow(t, 1.8) * 0.8 * len * 0.5);
      col.set(mix(color3(0x1f7a3a), color3(0x7fd35a), 1 - t * 0.9), i * 3);
    }
    leaf.setAttribute('color', new THREE.BufferAttribute(col, 3));
    leaf.computeVertexNormals();
    const m = new THREE.Matrix4().makeRotationY(ang).multiply(new THREE.Matrix4().makeRotationX(-0.25 - (f % 2) * 0.2));
    leaf.applyMatrix4(m);
    leaf.translate(x, y, 0);
    parts.push(leaf);
  }
  return merge(parts);
}

/** A flower head: ring of petals + centre. Colour via instanceColor on the petals (centre is baked yellow). */
export function flowerHeadGeometry(petals = 6): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < petals; i++) {
    const p = new THREE.SphereGeometry(0.075, 8, 6);
    p.scale(1, 0.35, 0.62);
    p.translate(0.085, 0, 0);
    p.rotateY((i / petals) * Math.PI * 2);
    solid(p, 0xffffff);
    parts.push(p);
  }
  const c = new THREE.SphereGeometry(0.052, 8, 6);
  c.scale(1, 0.7, 1); c.translate(0, 0.012, 0);
  solid(c, 0xffc21a);
  parts.push(c);
  return merge(parts);
}

export function stemGeometry(h = 0.4): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.008, 0.012, h, 5);
  g.translate(0, h / 2, 0);
  const leaf = new THREE.SphereGeometry(0.05, 6, 4); leaf.scale(1, 0.18, 0.45); leaf.translate(0.05, h * 0.35, 0);
  solid(g, 0x3d8f3a); solid(leaf, 0x4aa645);
  return merge([g, leaf]);
}

export function mushroomGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.05, 0.065, 0.2, 10); stem.translate(0, 0.1, 0); solid(stem, 0xf4ead6);
  const cap = new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(0, 0.19, 0); solid(cap, 0xe63946);
  const dots = [[0.05, 0.31, 0.04], [-0.07, 0.29, 0.03], [0.02, 0.3, -0.08]].map(([x, y, z]) => { const d = new THREE.SphereGeometry(0.025, 6, 4); d.translate(x, y, z); return solid(d, 0xffffff); });
  return merge([stem, cap, ...dots]);
}

export function lanternGeometry(): THREE.BufferGeometry {
  const post = new THREE.CylinderGeometry(0.03, 0.04, 0.9, 6); post.translate(0, 0.45, 0); solid(post, 0x3a2f2a);
  const glass = new THREE.CylinderGeometry(0.13, 0.1, 0.26, 8); glass.translate(0, 1.03, 0); solid(glass, 0xfff1b8);
  const cap = new THREE.ConeGeometry(0.17, 0.12, 8); cap.translate(0, 1.22, 0); solid(cap, 0x3a2f2a);
  return merge([post, glass, cap]);
}

export function houseGeometry(w: number, d: number, h: number, wall: number | string, roof: number | string): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(w, h, d); body.translate(0, h / 2, 0); solid(body, wall);
  const r = new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, h * 0.45, 4); r.rotateY(Math.PI / 4); r.translate(0, h + h * 0.225, 0); solid(r, roof);
  return merge([body, r]);
}

export function balloonGeometry(): THREE.BufferGeometry {
  const b = new THREE.SphereGeometry(0.22, 14, 12); b.scale(1, 1.2, 1); b.translate(0, 1.0, 0); solid(b, 0xffffff);
  const t = new THREE.ConeGeometry(0.04, 0.07, 6); t.rotateX(Math.PI); t.translate(0, 0.72, 0); solid(t, 0xffffff);
  const s = new THREE.CylinderGeometry(0.004, 0.004, 0.72, 3); s.translate(0, 0.36, 0); solid(s, 0xdddddd);
  return merge([b, t, s]);
}

export function rockGeometry(seed: number): THREE.BufferGeometry {
  return blobGeometry(0.2, seed, 1, 0.55, 0.45, 0xb9b2a6, 0x6f6a62);
}

export function shellGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.5, 0.8); solid(g, 0xffd9c9); return g;
}

export function bannerPoleGeometry(): THREE.BufferGeometry {
  const p = new THREE.CylinderGeometry(0.03, 0.04, 1.8, 6); p.translate(0, 0.9, 0); solid(p, 0xe8e2d4);
  const f = new THREE.PlaneGeometry(0.5, 0.8); f.translate(0.25, 1.4, 0); solid(f, 0xffffff);
  return merge([p, f]);
}

export function lampPostGeometry(): THREE.BufferGeometry {
  const p = new THREE.CylinderGeometry(0.035, 0.05, 1.5, 6); p.translate(0, 0.75, 0); solid(p, 0x2b3345);
  const arm = new THREE.BoxGeometry(0.4, 0.04, 0.04); arm.translate(0.17, 1.5, 0); solid(arm, 0x2b3345);
  const lamp = new THREE.SphereGeometry(0.09, 10, 8); lamp.translate(0.36, 1.46, 0); solid(lamp, 0xfff3c4);
  return merge([p, arm, lamp]);
}

/** Wind sway for instanced vegetation: displaces vertices by their height, phase from the instance position. */
export function addSway(mat: THREE.Material, uTime: { value: number }, amp = 0.05, speed = 1.6) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
        #else
          float ph = 0.0;
        #endif
        float sw = max(position.y, 0.0);
        transformed.x += sin(uTime * ${speed.toFixed(2)} + ph) * ${amp.toFixed(3)} * sw;
        transformed.z += cos(uTime * ${(speed * 0.8).toFixed(2)} + ph * 1.3) * ${(amp * 0.7).toFixed(3)} * sw;`);
  };
  mat.needsUpdate = true;
}

/** Deterministic scatter of positions over a rectangle, accepted by `ok`. */
export function scatter(count: number, rng: () => number, half: [number, number], ok: (x: number, y: number) => boolean, tries = 12): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < tries; k++) {
      const x = (rng() * 2 - 1) * half[0], y = (rng() * 2 - 1) * half[1];
      if (ok(x, y)) { out.push([x, y]); break; }
    }
  }
  return out;
}

/** Builds an InstancedMesh from positions with random scale / yaw / tint. */
export function instances(geo: THREE.BufferGeometry, mat: THREE.Material, pts: Pt[], rng: () => number, opts: { scale?: [number, number]; y?: number; tint?: (i: number, rng: () => number) => THREE.Color; tilt?: number; castShadow?: boolean; receiveShadow?: boolean } = {}): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
  m.count = pts.length;
  const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const [s0, s1] = opts.scale ?? [0.8, 1.2];
  pts.forEach((p, i) => {
    const sc = s0 + rng() * (s1 - s0);
    e.set((rng() - 0.5) * (opts.tilt ?? 0), rng() * Math.PI * 2, (rng() - 0.5) * (opts.tilt ?? 0));
    q.setFromEuler(e);
    v.set(p[0], opts.y ?? 0, -p[1]);
    s.set(sc, sc * (0.9 + rng() * 0.2), sc);
    mat4.compose(v, q, s);
    m.setMatrixAt(i, mat4);
    if (opts.tint) m.setColorAt(i, opts.tint(i, rng));
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = opts.castShadow ?? false;
  m.receiveShadow = opts.receiveShadow ?? true;
  m.frustumCulled = false;
  return m;
}

/** Soft additive glow quad lying on the floor or facing the camera. */
export function glowSprite(tex: THREE.Texture, color: number | string, size: number, opacity = 1): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}

export const lerpColor = (a: THREE.Color, b: THREE.Color, t: number, out = new THREE.Color()) => out.copy(a).lerp(b, t);

/** A butterfly wing (two lobes) painted into a canvas by the caller; this just supplies the quad. */
export function wingGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(0.22, 0.17);
  g.translate(0.11, 0, 0);
  return g;
}
