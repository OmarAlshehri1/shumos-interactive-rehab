import * as THREE from 'three';
import { mulberry32 } from '@/lib/footsteps3d/rng';
import { AREA_H, AREA_W, dist, type Plan, type Pt } from '@/lib/turngo3d/courses';
import type { StarFx, ThemeId } from '@/lib/turngo3d/stages';
import { bubbleTexture, canvasTexture, facadeTexture, foamTexture, glowTexture, groundTexture, hsl, pathTexture, pathUv, wingTexture } from './textures';
import { addSway, balloonGeometry, bannerPoleGeometry, blobGeometry, Disposer, flowerHeadGeometry, glowSprite, houseGeometry, instances, lampPostGeometry, lanternGeometry, merge, mushroomGeometry, palmGeometry, rockGeometry, scatter, shellGeometry, solid, stemGeometry, treeGeometry, trans, W3 } from './kit';

export type Quality = 'high' | 'balanced' | 'low';

export interface EnvCtx {
  theme: ThemeId;
  plan: Plan;
  /** Primary route polyline (start first), final frame. */
  route: Pt[];
  width: number;
  quality: Quality;
  /** Reduced effects: fewer decorations, no ambient particles, no shadows. */
  reduced: boolean;
  highContrast: boolean;
  seed: number;
}

export interface Env {
  group: THREE.Group;
  pathMaterial: THREE.MeshStandardMaterial;
  /** Texture repeats across (u) and the tile length along the route (v), for this stage's corridor width. */
  pathUv: { u: number; v: number };
  outlineColor: number;
  /** Star-collect particle palette + shape. */
  fx: { kind: StarFx; colors: number[] };
  /** Light the Display uses (also drives the tone). */
  night: boolean;
  update(t: number, dt: number): void;
  dispose(): void;
}

interface ThemeLook {
  bg: number;
  sun: number; sunI: number; sunDir: [number, number, number];
  hemiSky: number; hemiGround: number; hemiI: number;
  exposure: number;
  path: { rough: number; metal: number; tint: number };
  outline: number;
  night: boolean;
  fx: { kind: StarFx; colors: number[] };
}

const LOOK: Record<ThemeId, ThemeLook> = {
  garden: { bg: 0x5a9a3c, sun: 0xfff1d0, sunI: 2.6, sunDir: [-6, 14, 7], hemiSky: 0xcfe9ff, hemiGround: 0x7aa05a, hemiI: 1.25, exposure: 1.02, path: { rough: 0.85, metal: 0, tint: 0xffffff }, outline: 0x6b5a3c, night: false, fx: { kind: 'sparkle', colors: [0xffe27a, 0xffffff, 0xfff0b0] } },
  playground: { bg: 0x3b7fd4, sun: 0xfff6e0, sunI: 2.5, sunDir: [-5, 14, 8], hemiSky: 0xd8ecff, hemiGround: 0xc9a070, hemiI: 1.3, exposure: 1.05, path: { rough: 0.5, metal: 0.05, tint: 0xffffff }, outline: 0x22314f, night: false, fx: { kind: 'confetti', colors: [0xff4d6d, 0x3ec6ff, 0xffd23f, 0x6be585, 0xb06bff] } },
  flowers: { bg: 0x5a9a4c, sun: 0xfff0d8, sunI: 2.4, sunDir: [-7, 13, 8], hemiSky: 0xffe9f2, hemiGround: 0x84b060, hemiI: 1.3, exposure: 1.04, path: { rough: 0.85, metal: 0, tint: 0xffffff }, outline: 0x7a5a50, night: false, fx: { kind: 'petals', colors: [0xffb3d1, 0xffffff, 0xffd6e8, 0xe9b8ff] } },
  beach: { bg: 0x2aa9c9, sun: 0xfff3d2, sunI: 3.1, sunDir: [-4, 15, 5], hemiSky: 0xbfe9ff, hemiGround: 0xe6c887, hemiI: 1.35, exposure: 1.08, path: { rough: 0.7, metal: 0, tint: 0xffffff }, outline: 0x6a4a28, night: false, fx: { kind: 'bubbles', colors: [0xbff4ff, 0xffffff, 0x8fe3ff] } },
  festivalPark: { bg: 0x6a4b8a, sun: 0xffd9a0, sunI: 2.3, sunDir: [-8, 10, 6], hemiSky: 0xffd1b8, hemiGround: 0x8a6a8a, hemiI: 1.1, exposure: 1.0, path: { rough: 0.45, metal: 0.05, tint: 0xffffff }, outline: 0x3a2850, night: false, fx: { kind: 'fireworks', colors: [0xff5d8f, 0xffd23f, 0x4cc9f0, 0x80ed99, 0xc77dff] } },
  forest: { bg: 0x1f4a2c, sun: 0xfff0c2, sunI: 2.1, sunDir: [-5, 13, 6], hemiSky: 0xc8e8c0, hemiGround: 0x4a6a3a, hemiI: 1.15, exposure: 0.98, path: { rough: 0.95, metal: 0, tint: 0xffffff }, outline: 0x4a3320, night: false, fx: { kind: 'fireflies', colors: [0xf8ff9a, 0xc8ff7a, 0xffffff] } },
  luminous: { bg: 0x061a22, sun: 0x9fc4ff, sunI: 0.9, sunDir: [6, 14, 4], hemiSky: 0x4a6aa8, hemiGround: 0x10343a, hemiI: 0.75, exposure: 1.1, path: { rough: 0.35, metal: 0.1, tint: 0xffffff }, outline: 0x10243a, night: true, fx: { kind: 'lanterns', colors: [0xffd27a, 0x7af0ff, 0xff9ad6, 0xb6ff8f] } },
  town: { bg: 0x39475c, sun: 0xfff1d6, sunI: 2.5, sunDir: [-6, 14, 8], hemiSky: 0xd6e4ff, hemiGround: 0x7a7a88, hemiI: 1.2, exposure: 1.02, path: { rough: 0.9, metal: 0, tint: 0xffffff }, outline: 0x1d2433, night: false, fx: { kind: 'bells', colors: [0xffd23f, 0xffffff, 0x7bdff2, 0xff9e7d] } },
  finale: { bg: 0x1a1240, sun: 0xffe2b0, sunI: 1.9, sunDir: [-4, 13, 6], hemiSky: 0xb8a8ff, hemiGround: 0x3a2a70, hemiI: 1.0, exposure: 1.08, path: { rough: 0.3, metal: 0.25, tint: 0xffffff }, outline: 0x2a1a50, night: true, fx: { kind: 'grand', colors: [0xffd23f, 0xff5d8f, 0x4cc9f0, 0x80ed99, 0xc77dff, 0xffffff] } },
};

export const themeBackground = (t: ThemeId) => LOOK[t].bg;
export const themeExposure = (t: ThemeId) => LOOK[t].exposure;

/** Decimated route points for fast keep-out tests. */
function samplePolyline(poly: Pt[], step = 0.35): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i], l = dist(a, b), n = Math.max(1, Math.ceil(l / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(poly[poly.length - 1]);
  return out;
}

export function buildEnvironment(c: EnvCtx): Env {
  const look = LOOK[c.theme];
  const d = new Disposer();
  const group = new THREE.Group();
  const rng = mulberry32(c.seed ^ (c.theme.length * 7919));
  const hq = c.quality === 'high', lq = c.quality === 'low' || c.reduced;
  const density = lq ? 0.35 : c.quality === 'balanced' ? 0.75 : 1;
  const uTime = { value: 0 };
  const updaters: ((t: number, dt: number) => void)[] = [];

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemiI);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(look.sun, look.sunI);
  sun.position.set(...look.sunDir);
  sun.castShadow = !lq;
  if (sun.castShadow) {
    const sz = hq ? 2048 : 1024;
    sun.shadow.mapSize.set(sz, sz);
    const cam = sun.shadow.camera;
    cam.left = -11; cam.right = 11; cam.top = 8; cam.bottom = -8; cam.near = 1; cam.far = 40;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  }
  group.add(sun);

  // ---- ground ----
  const gTex = groundTexture(c.theme);
  gTex.repeat.set(c.theme === 'playground' ? 4 : 10, c.theme === 'playground' ? 3 : 7);
  gTex.anisotropy = 8;
  const ground = new THREE.Mesh(d.add(new THREE.PlaneGeometry(64, 44)), d.add(new THREE.MeshStandardMaterial({ map: gTex, roughness: c.theme === 'finale' ? 0.35 : 0.95, metalness: c.theme === 'finale' ? 0.2 : 0 })));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- keep-out for decoration ----
  const trail = samplePolyline(c.route);
  const lanes = c.width / 2 + 0.55;
  const special: Pt[] = [c.plan.start, ...c.plan.cps, ...c.plan.alts.filter((a): a is Pt => !!a), ...c.plan.cones];
  const free = (x: number, y: number, extra = 0) => {
    const p: Pt = [x, y];
    for (const q of trail) if (Math.abs(q[0] - x) < lanes + extra + 0.4 && Math.abs(q[1] - y) < lanes + extra + 0.4 && dist(q, p) < lanes + extra) return false;
    for (const q of special) if (dist(q, p) < 1.25 + extra) return false;
    return true;
  };
  const HX = AREA_W / 2, HY = AREA_H / 2;
  const border = (x: number, y: number, m = 0.9) => Math.abs(x) > HX - m || Math.abs(y) > HY - m * 0.8;
  const wide: [number, number] = [HX + 3.5, HY + 3];
  const wideFree = (x: number, y: number) => (Math.abs(x) <= HX + 0.2 && Math.abs(y) <= HY + 0.2 ? free(x, y) : true);
  const outer = (x: number, y: number) => Math.abs(x) > HX - 0.4 || Math.abs(y) > HY - 0.35;

  const standard = (opts: THREE.MeshStandardMaterialParameters) => d.add(new THREE.MeshStandardMaterial(opts));
  const addInst = (m: THREE.InstancedMesh, shadow = false) => { m.castShadow = shadow && !lq; group.add(m); return m; };
  const geo = <T extends THREE.BufferGeometry>(g: T) => d.add(g);

  // grass tufts (ground cover)
  const tuft = () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.ConeGeometry(0.026, 0.3 + (i % 2) * 0.09, 3);
      g.translate(0, 0.15, 0); g.rotateZ((i - 1.5) * 0.18); g.rotateY(i * 1.3); solid(g, i % 2 ? 0x6fbf3d : 0x4f9f33);
      parts.push(g);
    }
    return merge(parts);
  };

  const tufts = (n: number, hue: number, extra = 0) => {
    const pts = scatter(Math.round(n * density), rng, wide, (x, y) => wideFree(x, y) && free(x, y, extra), 8);
    const m = standard({ vertexColors: true, roughness: 0.9 });
    addSway(m, uTime, 0.07, 2.0);
    addInst(instances(geo(tuft()), m, pts, rng, { scale: [0.7, 1.5], tint: (_i, r) => new THREE.Color().setHSL(hue + r() * 0.05, 0.5, 0.55 + r() * 0.2) }));
  };

  const flowers = (n: number, colors: number[], cluster = true) => {
    const centers = scatter(Math.round((cluster ? n / 14 : 1) * density) + 2, rng, wide, (x, y) => wideFree(x, y), 10);
    const pts: Pt[] = [];
    const count = Math.round(n * density);
    for (let i = 0; i < count; i++) {
      const base = cluster ? centers[i % centers.length] : [(rng() * 2 - 1) * wide[0], (rng() * 2 - 1) * wide[1]] as Pt;
      const p: Pt = [base[0] + (rng() - 0.5) * (cluster ? 2.2 : 1), base[1] + (rng() - 0.5) * (cluster ? 1.6 : 1)];
      if (Math.abs(p[0]) < HX + 1 && Math.abs(p[1]) < HY + 1 && free(p[0], p[1], 0.05)) pts.push(p);
    }
    const stemM = standard({ vertexColors: true, roughness: 0.8 }), headM = standard({ vertexColors: true, roughness: 0.55 });
    addSway(stemM, uTime, 0.05, 1.7); addSway(headM, uTime, 0.05, 1.7);
    const seed = rng() * 1000;
    const r2 = mulberry32(seed | 0);
    const stems = instances(geo(stemGeometry(0.36)), stemM, pts, mulberry32(seed | 0), { scale: [0.8, 1.3] });
    const heads = new THREE.InstancedMesh(geo(flowerHeadGeometry()), headM, Math.max(1, pts.length));
    const q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), m4 = new THREE.Matrix4();
    const r3 = mulberry32(seed | 0);
    pts.forEach((p, i) => {
      const sc = 0.8 + r3() * 0.5;
      r3(); r3(); // keep the stem and head scales in step
      q.setFromEuler(new THREE.Euler(0, r2() * 6.28, 0));
      const hsc = sc * (0.8 + r2() * 0.5);
      v.set(p[0], 0.36 * sc, -p[1]); s.set(hsc * 1.2, hsc * 1.2, hsc * 1.2);
      m4.compose(v, q, s); heads.setMatrixAt(i, m4);
      heads.setColorAt(i, new THREE.Color(colors[Math.floor(r2() * colors.length)]));
    });
    heads.count = pts.length; heads.instanceMatrix.needsUpdate = true; if (heads.instanceColor) heads.instanceColor.needsUpdate = true; heads.frustumCulled = false;
    group.add(stems, heads);
  };

  const trees = (n: number, light: number, dark: number, region: (x: number, y: number) => boolean, scale: [number, number] = [0.9, 1.5], trunk = 0x7a5230) => {
    const pts = scatter(Math.round(n * (lq ? 0.6 : 1)), rng, wide, (x, y) => region(x, y) && wideFree(x, y), 20);
    const variants = [0, 1, 2].map((i) => geo(treeGeometry(i * 3 + 1, light, dark, trunk)));
    const m = standard({ vertexColors: true, roughness: 0.82 });
    for (let k = 0; k < 3; k++) addInst(instances(variants[k], m, pts.filter((_, i) => i % 3 === k), rng, { scale, castShadow: true, tint: (_i, r) => new THREE.Color().setHSL(0.27 + r() * 0.06, 0.35, 0.7 + r() * 0.3) }), true);
  };

  const bushes = (n: number, light: number, dark: number, region: (x: number, y: number) => boolean) => {
    const pts = scatter(Math.round(n * density), rng, wide, (x, y) => region(x, y) && wideFree(x, y), 20);
    const m = standard({ vertexColors: true, roughness: 0.9 });
    addInst(instances(geo(blobGeometry(0.42, 7, 2, 0.75, 0.3, light, dark)), m, pts, rng, { scale: [0.7, 1.4], y: 0.12, castShadow: true }), true);
  };

  const rocks = (n: number, region: (x: number, y: number) => boolean) => {
    const pts = scatter(Math.round(n * density), rng, wide, (x, y) => region(x, y) && wideFree(x, y), 12);
    addInst(instances(geo(rockGeometry(3)), standard({ vertexColors: true, roughness: 0.95 }), pts, rng, { scale: [0.6, 1.5], y: 0.03, castShadow: true }), true);
  };

  const butterflies = (n: number, colors: number[]) => {
    if (lq) return;
    const wing = geo(new THREE.PlaneGeometry(0.24, 0.19));
    wing.translate(0.12, 0, 0);
    const hues = colors.map((c) => Math.round(new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }).h * 360));
    const mats = hues.map((h) => d.add(new THREE.MeshBasicMaterial({ map: wingTexture(h), side: THREE.DoubleSide, transparent: true, alphaTest: 0.35, depthWrite: false })));
    const bodyG = geo(new THREE.CapsuleGeometry(0.018, 0.1, 3, 6)); bodyG.rotateZ(Math.PI / 2);
    const bodyM = d.add(new THREE.MeshBasicMaterial({ color: 0x2b2030 }));
    const flies = Array.from({ length: n }, (_, i) => {
      const g = new THREE.Group();
      const l = new THREE.Mesh(wing, mats[i % mats.length]), r = new THREE.Mesh(wing, mats[i % mats.length]);
      r.scale.x = -1;
      const body = new THREE.Mesh(bodyG, bodyM);
      g.add(l, r, body); group.add(g);
      return { g, l, r, cx: (rng() * 2 - 1) * 7, cy: (rng() * 2 - 1) * 3.4, ph: rng() * 6.28, sp: 0.35 + rng() * 0.3 };
    });
    updaters.push((t) => flies.forEach((f) => {
      const a = t * f.sp + f.ph, x = f.cx + Math.cos(a) * 1.6 + Math.sin(a * 2.1) * 0.5, y = f.cy + Math.sin(a * 1.3) * 1.2;
      f.g.position.set(x, 0.9 + Math.sin(a * 3) * 0.18, -y);
      f.g.rotation.y = Math.atan2(-Math.cos(a * 1.3) * 1.56, -(-Math.sin(a) * 1.6)) ;
      const flap = 0.15 + Math.abs(Math.sin(t * 14 + f.ph)) * 1.0;
      f.l.rotation.set(-Math.PI / 2, 0, flap); f.r.rotation.set(-Math.PI / 2, 0, -flap);
    }));
  };

  /** Floating points (fireflies / petals / bubbles / dust / confetti) drifting over the scene. */
  const floaters = (n: number, opts: { color: number; size: number; tex: THREE.Texture; motion: 'drift' | 'fall' | 'rise' | 'firefly'; spread?: number; additive?: boolean; opacity?: number }) => {
    if (c.reduced) return;
    const count = Math.max(6, Math.round(n * density));
    const pos = new Float32Array(count * 3), base = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { base[i * 4] = (rng() * 2 - 1) * (HX + 1); base[i * 4 + 1] = (rng() * 2 - 1) * (HY + 1); base[i * 4 + 2] = rng() * 6.28; base[i * 4 + 3] = 0.3 + rng() * 0.7; }
    const g = geo(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = d.add(new THREE.PointsMaterial({ map: opts.tex, color: opts.color, size: opts.size, transparent: true, opacity: opts.opacity ?? 0.9, depthWrite: false, blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, sizeAttenuation: true }));
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; group.add(pts);
    updaters.push((t) => {
      for (let i = 0; i < count; i++) {
        const bx = base[i * 4], by = base[i * 4 + 1], ph = base[i * 4 + 2], sp = base[i * 4 + 3];
        let x = bx, y = by, h = 0.6;
        if (opts.motion === 'firefly') { x = bx + Math.sin(t * 0.4 * sp + ph) * 1.2; y = by + Math.cos(t * 0.33 * sp + ph * 2) * 0.9; h = 0.5 + Math.sin(t * 0.7 + ph) * 0.25; }
        else if (opts.motion === 'fall') { const k = ((t * 0.12 * sp + ph / 6.28) % 1 + 1) % 1; h = 3.2 * (1 - k); x = bx + Math.sin(t * 0.8 * sp + ph) * 0.6; y = by + Math.cos(t * 0.5 + ph) * 0.4; }
        else if (opts.motion === 'rise') { const k = ((t * 0.07 * sp + ph / 6.28) % 1 + 1) % 1; h = 0.1 + k * 2.6; x = bx + Math.sin(t * 0.6 + ph) * 0.4; }
        else { x = bx + Math.sin(t * 0.25 * sp + ph) * 1.4; y = by + Math.cos(t * 0.2 * sp + ph) * 1.0; h = 0.8 + Math.sin(t * 0.5 + ph) * 0.3; }
        pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = -y;
      }
      g.getAttribute('position').needsUpdate = true;
    });
  };

  const glowPool = (p: Pt, color: number, size: number, opacity = 0.55) => {
    const s = glowSprite(glowTexture(), color, size, opacity);
    s.position.copy(W3(p, 0.05)); group.add(s);
    d.add(s.material);
    return s;
  };

  /** Row of small flags on a sagging line (bunting). */
  const bunting = (a: Pt, b: Pt, colors: number[], count: number, sag = 0.35, h = 1.3) => {
    const tri = geo(new THREE.ConeGeometry(0.1, 0.24, 3)); tri.rotateX(Math.PI); tri.translate(0, -0.12, 0);
    const m = standard({ roughness: 0.8, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(tri, m, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const linePts: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, hh = h - Math.sin(t * Math.PI) * sag;
      v.set(x, hh, -y); q.setFromEuler(new THREE.Euler(0, Math.atan2(b[0] - a[0], -(b[1] - a[1])) + Math.PI / 2, 0)); m4.compose(v, q, s); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    }
    for (let i = 0; i <= 24; i++) { const t = i / 24; linePts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, h - Math.sin(t * Math.PI) * sag, -(a[1] + (b[1] - a[1]) * t))); }
    const line = new THREE.Line(geo(new THREE.BufferGeometry().setFromPoints(linePts)), d.add(new THREE.LineBasicMaterial({ color: 0xf5efe0 })));
    mesh.castShadow = !lq; mesh.frustumCulled = false;
    group.add(mesh, line);
  };

  /** String lights: small emissive bulbs with additive halos on a sagging line. */
  const stringLights = (a: Pt, b: Pt, colors: number[], count: number, h = 1.5, sag = 0.3) => {
    const bulb = geo(new THREE.SphereGeometry(0.06, 8, 6));
    const m = d.add(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const mesh = new THREE.InstancedMesh(bulb, m, count);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      m4.setPosition(x, h - Math.sin(t * Math.PI) * sag, -y); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
      if (!lq) { const gl = glowSprite(glowTexture(), colors[i % colors.length], 0.5, 0.7); gl.position.set(x, h - Math.sin(t * Math.PI) * sag, -y); group.add(gl); d.add(gl.material); }
    }
    mesh.frustumCulled = false; group.add(mesh);
  };

  const fence = (y: number, color: number) => {
    const n = Math.round(46 * (lq ? 0.5 : 1)), post = geo(new THREE.BoxGeometry(0.1, 0.62, 0.05)); post.translate(0, 0.31, 0);
    const mesh = new THREE.InstancedMesh(post, standard({ color, roughness: 0.8 }), n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { m4.setPosition(-HX - 0.4 + ((HX * 2 + 0.8) * i) / (n - 1), 0, -y); mesh.setMatrixAt(i, m4); }
    mesh.castShadow = !lq; mesh.frustumCulled = false; group.add(mesh);
    const rail = new THREE.Mesh(geo(new THREE.BoxGeometry(HX * 2 + 1, 0.06, 0.05)), standard({ color, roughness: 0.8 }));
    rail.position.set(0, 0.42, -y); rail.castShadow = !lq; group.add(rail);
  };

  const balloons = (pts: Pt[], colors: number[]) => {
    const m = standard({ vertexColors: true, roughness: 0.25, metalness: 0.05 });
    addInst(instances(geo(balloonGeometry()), m, pts, rng, { scale: [0.9, 1.4], tint: (i) => new THREE.Color(colors[i % colors.length]), tilt: 0.2, castShadow: true }), true);
  };

  const painted = (draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, key: string, p: Pt, size: [number, number], rot = 0, opacity = 1) => {
    const tex = canvasTexture(key, 256, 256, draw);
    const m = d.add(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false }));
    const mesh = new THREE.Mesh(geo(new THREE.PlaneGeometry(size[0], size[1])), m);
    mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = rot; mesh.position.copy(W3(p, 0.012)); mesh.renderOrder = 1;
    group.add(mesh);
  };

  // =================== per-theme dressing ===================
  switch (c.theme) {
    case 'garden': {
      tufts(900, 0.27);
      flowers(260, [0xff5d73, 0xffd23f, 0xffffff, 0xff9ed2, 0xb689ff, 0xff8a3d]);
      bushes(16, 0x8bd35a, 0x2f7d32, (x, y) => outer(x, y) || rng() > 0.7);
      trees(10, 0x8fd65a, 0x2c7a30, border, [1.1, 1.8]);
      rocks(10, () => true);
      fence(-HY + 0.15, 0xf2ead8); fence(HY - 0.1, 0xf2ead8);
      butterflies(7, [0xffb347, 0xff7ab8, 0x6ec6ff, 0xfff176]);
      floaters(26, { color: 0xfff2b8, size: 0.09, tex: glowTexture(), motion: 'drift', opacity: 0.55 });
      break;
    }
    case 'playground': {
      const cols = [0xff4d6d, 0x3ec6ff, 0xffd23f, 0x6be585, 0xb06bff, 0xff9e3d];
      bunting([-HX + 0.2, HY - 0.15], [HX - 0.2, HY - 0.15], cols, 26, 0.5, 1.4);
      bunting([-HX + 0.2, -HY + 0.15], [HX - 0.2, -HY + 0.15], cols.slice().reverse(), 26, 0.5, 1.4);
      // painted hopscotch circles and stars on free floor
      const paints = scatter(Math.round(7 * density), rng, [HX - 0.6, HY - 0.5], (x, y) => free(x, y, 0.8) && (Math.abs(x) > 3 || Math.abs(y) > 2.6), 30);
      paints.forEach((p, i) => painted((ctx, w, h) => { ctx.fillStyle = 'rgba(255,255,255,0.0)'; ctx.lineWidth = 16; ctx.strokeStyle = ['#ffffff', '#fff3a0', '#ffd0e0'][i % 3]; ctx.beginPath(); ctx.arc(w / 2, h / 2, 96, 0, 7); ctx.stroke(); ctx.fillStyle = ['#ffffff', '#fff3a0', '#ffd0e0'][i % 3]; ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = (Math.PI / 5) * k - Math.PI / 2, r = k % 2 ? 34 : 70; ctx[k ? 'lineTo' : 'moveTo'](w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }, `hop${i % 3}`, p, [0.9, 0.9], rng() * 0.5 - 0.25, 0.55));
      // balls & blocks
      const balls = scatter(Math.round(10 * density), rng, [HX, HY], (x, y) => (outer(x, y) || rng() > 0.8) && free(x, y, 0.2), 20);
      addInst(instances(geo(new THREE.SphereGeometry(0.22, 18, 14)), standard({ roughness: 0.35 }), balls, rng, { y: 0.22, scale: [0.8, 1.3], tint: (i) => new THREE.Color(cols[i % cols.length]), castShadow: true }), true);
      const blocks = scatter(Math.round(8 * density), rng, [HX, HY], (x, y) => outer(x, y) && free(x, y, 0.2), 20);
      addInst(instances(geo(new THREE.BoxGeometry(0.4, 0.4, 0.4)), standard({ roughness: 0.55 }), blocks, rng, { y: 0.2, scale: [0.8, 1.2], tint: (i) => new THREE.Color(cols[(i + 2) % cols.length]), castShadow: true }), true);
      bushes(8, 0x7ed957, 0x2f8f3a, (x, y) => outer(x, y));
      floaters(30, { color: 0xffffff, size: 0.1, tex: bubbleTexture(), motion: 'rise', opacity: 0.6, additive: false });
      break;
    }
    case 'flowers': {
      tufts(700, 0.28);
      flowers(900, [0xff6fa6, 0xffe066, 0xffffff, 0xc77dff, 0xff8fb1, 0x74c0fc, 0xff9f43], true);
      bushes(12, 0xa6e36a, 0x3a9140, (x, y) => outer(x, y));
      trees(8, 0xffc2dc, 0xd96b9a, border, [1.0, 1.5], 0x8a5a3c);
      butterflies(9, [0xffb3d1, 0xfff176, 0xb8f0ff, 0xd0b3ff, 0xffffff]);
      floaters(60, { color: 0xffd0e6, size: 0.16, tex: glowTexture(), motion: 'fall', opacity: 0.8, additive: false });
      break;
    }
    case 'beach': {
      // the sea lies along the bottom border (course y < -HY + 0.6 is wet sand / foam / water), with moving foam
      const seaZ = HY - 0.25; // world z of the shoreline
      const sea = new THREE.Mesh(geo(new THREE.PlaneGeometry(44, 9)), d.add(new THREE.MeshStandardMaterial({ color: 0x1fb6d4, roughness: 0.2, metalness: 0.1, emissive: 0x08485a, emissiveIntensity: 0.4 })));
      sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.02, seaZ + 4.5);
      group.add(sea);
      const foam = foamTexture(); foam.repeat.set(8, 1);
      const foamMat = d.add(new THREE.MeshBasicMaterial({ map: foam, transparent: true, opacity: 0.9, depthWrite: false }));
      const foamMeshes = [0, 1, 2].map((i) => { const f = new THREE.Mesh(geo(new THREE.PlaneGeometry(44, 0.9)), foamMat); f.rotation.x = -Math.PI / 2; f.position.set(0, 0.03 + i * 0.001, seaZ + i * 0.34); group.add(f); return f; });
      const wet = new THREE.Mesh(geo(new THREE.PlaneGeometry(44, 1.5)), d.add(new THREE.MeshBasicMaterial({ color: 0xb8964f, transparent: true, opacity: 0.38, depthWrite: false })));
      wet.rotation.x = -Math.PI / 2; wet.position.set(0, 0.015, seaZ - 0.75); group.add(wet);
      updaters.push((t) => { foam.offset.x = t * 0.02; foamMat.opacity = 0.65 + Math.sin(t * 0.7) * 0.2; foamMeshes.forEach((f, i) => { f.position.z = seaZ + i * 0.32 + Math.sin(t * 0.7 + i * 1.7) * 0.28; }); });
      const landY = (y: number) => y > -HY + 1.7;
      const palms = scatter(Math.round(8 * (lq ? 0.6 : 1)), rng, [HX + 1.4, HY + 1.2], (x, y) => landY(y) && (Math.abs(x) > HX - 1.4 || y > HY - 1) && wideFree(x, y), 40);
      const pm = standard({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
      addInst(instances(geo(palmGeometry(1)), pm, palms.filter((_, i) => i % 2 === 0), rng, { scale: [1.0, 1.5], castShadow: true }), true);
      addInst(instances(geo(palmGeometry(2)), pm, palms.filter((_, i) => i % 2 === 1), rng, { scale: [1.0, 1.5], castShadow: true }), true);
      const shells = scatter(Math.round(36 * density), rng, [HX, HY], (x, y) => landY(y) && free(x, y, 0.1), 10);
      addInst(instances(geo(shellGeometry()), standard({ vertexColors: true, roughness: 0.5 }), shells, rng, { scale: [0.7, 1.6], y: 0.02, tint: (_i, r) => new THREE.Color().setHSL(0.03 + r() * 0.08, 0.7, 0.8) }));
      rocks(8, (x, y) => landY(y));
      const balls = scatter(3, rng, [HX - 1, HY - 0.6], (x, y) => landY(y) && free(x, y, 0.5), 20);
      addInst(instances(geo(new THREE.SphereGeometry(0.3, 18, 12)), standard({ roughness: 0.3 }), balls, rng, { y: 0.3, tint: (i) => new THREE.Color([0xff5d73, 0xffd23f, 0x3ec6ff][i % 3]), castShadow: true }), true);
      floaters(36, { color: 0xffffff, size: 0.12, tex: bubbleTexture(), motion: 'rise', opacity: 0.55, additive: false });
      break;
    }
    case 'festivalPark': {
      const cols = [0xff5d8f, 0xffd23f, 0x4cc9f0, 0x80ed99, 0xc77dff];
      stringLights([-HX + 0.3, HY - 0.3], [HX - 0.3, HY - 0.3], cols, 30, 1.6, 0.3);
      stringLights([-HX + 0.3, -HY + 0.3], [HX - 0.3, -HY + 0.3], cols, 30, 1.6, 0.3);
      bunting([-HX + 0.3, HY - 0.7], [HX - 0.3, HY - 0.7], cols, 22, 0.4, 1.3);
      balloons(scatter(Math.round(18 * density), rng, [HX, HY], (x, y) => outer(x, y) && wideFree(x, y), 30), cols);
      // confetti scattered on the plaza
      const conf = scatter(Math.round(160 * density), rng, [HX, HY], (x, y) => free(x, y, 0.1), 6);
      addInst(instances(geo(new THREE.PlaneGeometry(0.1, 0.06).rotateX(-Math.PI / 2)), d.add(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), conf, rng, { y: 0.015, scale: [0.8, 1.6], tint: (i) => new THREE.Color(cols[i % cols.length]) }));
      // striped tents at the corners
      const tentG = (() => { const cone = new THREE.ConeGeometry(0.9, 0.9, 12); cone.translate(0, 1.0, 0); solid(cone, 0xff5d8f); const base = new THREE.CylinderGeometry(0.75, 0.75, 0.6, 12); base.translate(0, 0.3, 0); solid(base, 0xfff3e0); return merge([cone, base]); })();
      const tentPts: Pt[] = [[-HX - 0.2, HY - 0.2], [HX + 0.2, HY - 0.2], [-HX - 0.2, -HY + 0.2], [HX + 0.2, -HY + 0.2]];
      addInst(instances(geo(tentG), standard({ vertexColors: true, roughness: 0.7 }), tentPts, rng, { scale: [1.1, 1.3], castShadow: true }), true);
      bushes(10, 0x9be564, 0x2f8f4a, (x, y) => outer(x, y));
      floaters(40, { color: 0xffe3a8, size: 0.12, tex: glowTexture(), motion: 'drift', opacity: 0.5 });
      break;
    }
    case 'forest': {
      tufts(500, 0.3);
      trees(22, 0x5fb04a, 0x1f5f2c, (x, y) => border(x, y, 1.2) || rng() > 0.93, [1.2, 2.1], 0x6a4528);
      bushes(16, 0x5aa646, 0x246a30, (x, y) => outer(x, y) || rng() > 0.7);
      rocks(14, () => true);
      const mush = scatter(Math.round(30 * density), rng, [HX + 1, HY + 0.5], (x, y) => wideFree(x, y), 10);
      addInst(instances(geo(mushroomGeometry()), standard({ vertexColors: true, roughness: 0.6 }), mush, rng, { scale: [0.8, 1.9], castShadow: true }), true);
      // ferns: fans of long blades
      const fern = (() => { const parts: THREE.BufferGeometry[] = []; for (let i = 0; i < 7; i++) { const g = new THREE.ConeGeometry(0.05, 0.55, 3); g.translate(0, 0.27, 0); g.rotateZ(0.9); g.rotateY((i / 7) * 6.28); solid(g, 0x3f9e4a); parts.push(g); } return merge(parts); })();
      const fm = standard({ vertexColors: true, roughness: 0.8 }); addSway(fm, uTime, 0.05, 1.3);
      addInst(instances(geo(fern), fm, scatter(Math.round(70 * density), rng, wide, wideFree, 8), rng, { scale: [0.8, 1.7] }));
      flowers(70, [0xffffff, 0xffe066, 0xc7a6ff], true);
      floaters(60, { color: 0xf4ff9a, size: 0.17, tex: glowTexture(), motion: 'firefly', opacity: 0.95 });
      break;
    }
    case 'luminous': {
      tufts(380, 0.45);
      const glowCols = [0x7af0ff, 0xff9ad6, 0xb6ff8f, 0xffd27a];
      // luminous flowers (emissive heads)
      const lf = scatter(Math.round(120 * density), rng, wide, wideFree, 8);
      const head = geo(flowerHeadGeometry(6));
      const headM = d.add(new THREE.MeshBasicMaterial({ vertexColors: true }));
      const stemM = standard({ vertexColors: true, roughness: 0.8 }); addSway(stemM, uTime, 0.05, 1.5); addSway(headM, uTime, 0.05, 1.5);
      const heads = new THREE.InstancedMesh(head, headM, Math.max(1, lf.length)); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
      lf.forEach((p, i) => { const sc = 1 + rng() * 0.7; v.set(p[0], 0.36 * sc, -p[1]); s.setScalar(1.3 * sc); q.setFromEuler(new THREE.Euler(0, rng() * 6, 0)); m4.compose(v, q, s); heads.setMatrixAt(i, m4); heads.setColorAt(i, new THREE.Color(glowCols[i % 4]).multiplyScalar(1.4)); });
      heads.count = lf.length; heads.frustumCulled = false; group.add(instances(geo(stemGeometry(0.36)), stemM, lf, mulberry32(11), { scale: [1, 1.5] }), heads);
      if (!lq) lf.filter((_, i) => i % 5 === 0).forEach((p, i) => glowPool(p, glowCols[i % 4], 1.4, 0.45));
      // glowing mushrooms
      const mush = scatter(Math.round(26 * density), rng, [HX, HY], (x, y) => free(x, y, 0.2), 10);
      const mg = geo(mushroomGeometry());
      const mm = d.add(new THREE.MeshBasicMaterial({ vertexColors: true }));
      addInst(instances(mg, mm, mush, rng, { scale: [0.9, 1.8], tint: (i) => new THREE.Color(glowCols[i % 4]).multiplyScalar(0.9) }));
      // lanterns (tall ones at the border)
      const lan = scatter(Math.round(14 * (lq ? 0.6 : 1)), rng, [HX + 0.4, HY + 0.2], (x, y) => outer(x, y) && wideFree(x, y), 30);
      addInst(instances(geo(lanternGeometry()), d.add(new THREE.MeshBasicMaterial({ vertexColors: true })), lan, rng, { scale: [1.0, 1.4] }));
      lan.forEach((p) => glowPool(p, 0xffd27a, 2.4, 0.7));
      trees(10, 0x2e8a78, 0x10443e, border, [1.2, 1.8], 0x2a2230);
      rocks(8, () => true);
      floaters(70, { color: 0xb6ffe8, size: 0.2, tex: glowTexture(), motion: 'firefly', opacity: 0.95 });
      floaters(30, { color: 0x9ad8ff, size: 0.1, tex: glowTexture(), motion: 'rise', opacity: 0.6 });
      break;
    }
    case 'town': {
      // miniature buildings around the edges (tall props stay out of the walking area)
      const wallCols = [0xff8a5c, 0x7ac6e8, 0xffd166, 0xe27ca4, 0x9bd37a, 0xf4a6a0];
      const roofCols = [0x8a3b2e, 0x2e5f8a, 0x7a5a1e, 0x7a2e5a, 0x2e6a3a, 0x6a3a3a];
      const spots: Pt[] = [];
      for (let i = 0; i < 9; i++) spots.push([-HX + 0.9 + i * ((HX * 2 - 1.8) / 8), HY + 0.95], [-HX + 1.3 + i * ((HX * 2 - 2.6) / 8), -HY - 0.85]);
      [[-HX - 0.5, -2], [-HX - 0.5, 1.6], [HX + 0.5, -1.4], [HX + 0.5, 2.2]].forEach((p) => spots.push(p as Pt));
      spots.forEach((p, i) => {
        const w = 1.0 + rng() * 0.7, dd = 1.0 + rng() * 0.6, h = 0.9 + rng() * 1.0;
        const fac = facadeTexture(i);
        const body = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, dd)), d.add(new THREE.MeshStandardMaterial({ map: fac, color: new THREE.Color(wallCols[i % 6]).lerp(new THREE.Color(0xffffff), 0.35), roughness: 0.7 })));
        body.position.copy(W3(p, h / 2)); body.castShadow = !lq; body.receiveShadow = true;
        const roof = new THREE.Mesh(geo(new THREE.ConeGeometry(Math.hypot(w, dd) * 0.62, h * 0.4, 4)), standard({ color: roofCols[i % 6], roughness: 0.6 }));
        roof.rotation.y = Math.PI / 4; roof.position.copy(W3(p, h + h * 0.2)); roof.castShadow = !lq;
        group.add(body, roof);
      });
      // street lamps and little trees
      const lamps = scatter(Math.round(12 * density), rng, [HX, HY], (x, y) => outer(x, y) && wideFree(x, y), 30);
      addInst(instances(geo(lampPostGeometry()), standard({ vertexColors: true, roughness: 0.5 }), lamps, rng, { scale: [0.9, 1.1], castShadow: true }), true);
      lamps.forEach((p) => { if (!lq) glowPool([p[0] + 0.35, p[1]], 0xfff1b0, 1.3, 0.35); });
      trees(12, 0x8fd65a, 0x2c7a30, (x, y) => border(x, y, 1.0), [0.55, 0.9]);
            void 0;
      floaters(14, { color: 0xffffff, size: 0.1, tex: glowTexture(), motion: 'drift', opacity: 0.25 });
      break;
    }
    case 'finale': {
      const cols = [0xffd23f, 0xff5d8f, 0x4cc9f0, 0x80ed99, 0xc77dff, 0xffffff];
      stringLights([-HX + 0.3, HY - 0.3], [HX - 0.3, HY - 0.3], cols, 34, 1.7, 0.35);
      stringLights([-HX + 0.3, -HY + 0.3], [HX - 0.3, -HY + 0.3], cols, 34, 1.7, 0.35);
      bunting([-HX + 0.3, HY - 0.8], [HX - 0.3, HY - 0.8], cols, 26, 0.45, 1.5);
      balloons(scatter(Math.round(22 * density), rng, [HX, HY], (x, y) => outer(x, y) && wideFree(x, y), 30), cols);
      // wandering stage light pools
      const pools = [0xff5d8f, 0x4cc9f0, 0xffd23f, 0xc77dff].map((col, i) => glowPool([-4 + i * 2.6, (i % 2 ? 1 : -1) * 2.2], col, 4.6, 0.32));
      updaters.push((t) => pools.forEach((p, i) => { p.position.x = -4 + i * 2.6 + Math.sin(t * 0.3 + i * 1.7) * 2.4; p.position.z = -((i % 2 ? 1 : -1) * 2.2 + Math.cos(t * 0.25 + i) * 1.3); (p.material as THREE.SpriteMaterial).opacity = 0.26 + Math.sin(t * 0.9 + i) * 0.1; }));
      const conf = scatter(Math.round(200 * density), rng, [HX, HY], (x, y) => free(x, y, 0.1), 6);
      addInst(instances(geo(new THREE.PlaneGeometry(0.1, 0.06).rotateX(-Math.PI / 2)), d.add(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), conf, rng, { y: 0.015, scale: [0.8, 1.6], tint: (i) => new THREE.Color(cols[i % cols.length]) }));
      floaters(90, { color: 0xffffff, size: 0.12, tex: canvasTexture('confetti', 32, 32, () => {}), motion: 'fall', opacity: 0.9, additive: false });
      floaters(40, { color: 0xffe9a8, size: 0.14, tex: glowTexture(), motion: 'drift', opacity: 0.6 });
      break;
    }
  }
  void hsl; void bannerPoleGeometry; void houseGeometry; void trans;

  // ---- corridor surface ----
  const pTex = pathTexture(c.theme);
  const pathMaterial = d.add(new THREE.MeshStandardMaterial({ map: pTex, vertexColors: true, roughness: look.path.rough, metalness: look.path.metal, color: look.path.tint, emissive: c.theme === 'luminous' ? 0x103040 : 0x000000, emissiveIntensity: c.theme === 'luminous' ? 0.6 : 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));

  return {
    group, pathMaterial, pathUv: pathUv(c.theme, c.width), outlineColor: look.outline, fx: look.fx, night: look.night,
    update(t, dt) { uTime.value = t; for (const u of updaters) u(t, dt); },
    dispose() { group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose?.(); }); d.dispose(); group.clear(); },
  };
}

export function readableSpecial(plan: Plan): Pt[] { return [plan.start, ...plan.cps]; }
