import * as THREE from 'three';
import { mulberry32 } from '@/lib/footsteps3d/rng';
import { dist, type Layout, type Maze, type Pt } from '@/lib/footmaze3d/mazes';
import type { StarFx, ThemeId } from '@/lib/footmaze3d/stages';
import { canvasTexture, glowTexture, groundTexture, hsl, pathTexture, pathUv, ringTexture, wingTexture } from './textures';
import { addSway, balloonGeometry, bannerPoleGeometry, blobGeometry, Disposer, flowerHeadGeometry, houseGeometry, instances, lampPostGeometry, merge, mushroomGeometry, palmGeometry, ribbonGeometry, rockGeometry, shellGeometry, solid, stemGeometry, treeGeometry, trans } from './kit';

export type Quality = 'high' | 'balanced' | 'low';

export interface WorldCtx {
  theme: ThemeId;
  maze: Maze;
  layout: Layout;
  width: number;
  quality: Quality;
  reduced: boolean;
  highContrast: boolean;
  seed: number;
}

export interface World3D {
  group: THREE.Group;
  pathMaterial: THREE.MeshStandardMaterial;
  fx: { kind: StarFx; colors: number[] };
  night: boolean;
  /** Where a landmark stands (for the destination glow). */
  update(t: number, dt: number): void;
  dispose(): void;
}

interface Look {
  bg: number;
  sun: number; sunI: number; sunDir: [number, number, number];
  hemiSky: number; hemiGround: number; hemiI: number;
  exposure: number;
  outline: number;
  night: boolean;
  fx: { kind: StarFx; colors: number[] };
}

const LOOK: Record<ThemeId, Look> = {
  garden: { bg: 0x5a9a3c, sun: 0xfff1d0, sunI: 2.6, sunDir: [-6, 14, 7], hemiSky: 0xcfe9ff, hemiGround: 0x7aa05a, hemiI: 1.25, exposure: 1.02, outline: 0x4a3f2a, night: false, fx: { kind: 'sparkle', colors: [0xffe27a, 0xffffff, 0xfff0b0] } },
  beach: { bg: 0x2aa9c9, sun: 0xfff3d2, sunI: 3.1, sunDir: [-4, 15, 5], hemiSky: 0xbfe9ff, hemiGround: 0xe6c887, hemiI: 1.35, exposure: 1.08, outline: 0x6a4a28, night: false, fx: { kind: 'bubbles', colors: [0xbff4ff, 0xffffff, 0x8fe3ff] } },
  house: { bg: 0x6a4a30, sun: 0xffe2b8, sunI: 2.2, sunDir: [-5, 14, 8], hemiSky: 0xffe9d0, hemiGround: 0xa87a50, hemiI: 1.25, exposure: 1.04, outline: 0x4a2c18, night: false, fx: { kind: 'petals', colors: [0xffd6a0, 0xffb3d1, 0xffffff, 0xffe27a] } },
  forest: { bg: 0x1f4a2c, sun: 0xfff0c2, sunI: 2.1, sunDir: [-5, 13, 6], hemiSky: 0xc8e8c0, hemiGround: 0x4a6a3a, hemiI: 1.15, exposure: 0.98, outline: 0x3a2818, night: false, fx: { kind: 'fireflies', colors: [0xf8ff9a, 0xc8ff7a, 0xffffff] } },
  festival: { bg: 0x3b7fd4, sun: 0xfff6e0, sunI: 2.5, sunDir: [-5, 14, 8], hemiSky: 0xd8ecff, hemiGround: 0xc9a070, hemiI: 1.3, exposure: 1.05, outline: 0x22314f, night: false, fx: { kind: 'confetti', colors: [0xff4d6d, 0x3ec6ff, 0xffd23f, 0x6be585, 0xb06bff] } },
  butterfly: { bg: 0x5a9a4c, sun: 0xfff0d8, sunI: 2.4, sunDir: [-7, 13, 8], hemiSky: 0xffe9f2, hemiGround: 0x84b060, hemiI: 1.3, exposure: 1.04, outline: 0x6a4a50, night: false, fx: { kind: 'butterflies', colors: [0xffb3d1, 0xffffff, 0xffd6e8, 0xe9b8ff] } },
  crystal: { bg: 0x061a22, sun: 0x9fc4ff, sunI: 1.0, sunDir: [6, 14, 4], hemiSky: 0x5a7ab8, hemiGround: 0x10343a, hemiI: 0.85, exposure: 1.12, outline: 0x0a2430, night: true, fx: { kind: 'crystals', colors: [0x7af0ff, 0xff9ad6, 0xb6ff8f, 0xffffff] } },
  town: { bg: 0x39475c, sun: 0xfff1d6, sunI: 2.5, sunDir: [-6, 14, 8], hemiSky: 0xd6e4ff, hemiGround: 0x7a7a88, hemiI: 1.2, exposure: 1.02, outline: 0x1d2433, night: false, fx: { kind: 'bells', colors: [0xffd23f, 0xffffff, 0x7bdff2, 0xff9e7d] } },
  palace: { bg: 0x1a1240, sun: 0xffe2b0, sunI: 2.0, sunDir: [-4, 13, 6], hemiSky: 0xb8a8ff, hemiGround: 0x3a2a70, hemiI: 1.05, exposure: 1.1, outline: 0x2a1a50, night: true, fx: { kind: 'grand', colors: [0xffd23f, 0xff5d8f, 0x4cc9f0, 0x80ed99, 0xc77dff, 0xffffff] } },
};

export const themeBackground = (t: ThemeId) => LOOK[t].bg;
export const themeExposure = (t: ThemeId) => LOOK[t].exposure;
export const themeFx = (t: ThemeId) => LOOK[t].fx;

const HX = 8.8, HY = 5.2, CS = 0.07;
const COLS = Math.ceil((HX * 2) / CS), ROWS = Math.ceil((HY * 2) / CS);

/** Distance to an axis-aligned corridor centre line in the L-infinity norm: square ends and crisp rectangular walls. */
function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = Math.max(Math.min(a[0], b[0]) - px, px - Math.max(a[0], b[0]), 0);
  const dy = Math.max(Math.min(a[1], b[1]) - py, py - Math.max(a[1], b[1]), 0);
  return Math.max(dx, dy);
}

interface Raster { corridor: Uint8Array; band: Uint8Array; wallT: number }

/** Rasterises walkable corridor / room / waiting-zone area and the wall band around it (course units, 0.2 cells). */
function rasterize(c: WorldCtx, wallT: number): Raster {
  const { maze, layout, width } = c;
  const corridor = new Uint8Array(COLS * ROWS), band = new Uint8Array(COLS * ROWS);
  const half = width / 2;
  const cell = (i: number, j: number): Pt => [-HX + (i + 0.5) * CS, -HY + (j + 0.5) * CS];
  const paint = (x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => number) => {
    const i0 = Math.max(0, Math.floor((x0 + HX) / CS)), i1 = Math.min(COLS - 1, Math.ceil((x1 + HX) / CS));
    const j0 = Math.max(0, Math.floor((y0 + HY) / CS)), j1 = Math.min(ROWS - 1, Math.ceil((y1 + HY) / CS));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [x, y] = cell(i, j), d = inside(x, y);
      if (d <= half + 1e-6) corridor[j * COLS + i] = 1;
      else if (d <= half + wallT) band[j * COLS + i] = 1;
    }
  };
  for (const e of maze.edges) {
    const a = layout.pos[e.a], b = layout.pos[e.b], r = half + wallT + 0.1;
    paint(Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, (x, y) => segDist(x, y, a, b));
  }
  for (const n of maze.nodes) {
    const p = layout.pos[n.id];
    const grow = n.type === 'room' || n.type === 'finish' ? 0.3 : 0;
    const r = half + grow + wallT + 0.1;
    paint(p[0] - r, p[1] - r, p[0] + r, p[1] + r, (x, y) => Math.max(Math.abs(x - p[0]), Math.abs(y - p[1])) - grow);
  }
  for (let k = 0; k < corridor.length; k++) if (corridor[k]) band[k] = 0;
  return { corridor, band, wallT };
}

interface Rect { x0: number; y0: number; x1: number; y1: number }

/** Greedy rectangle cover of the wall band: horizontal runs, merged with identical runs in the next row. */
function wallRects(r: Raster): Rect[] {
  const out: Rect[] = [];
  let open = new Map<string, { i0: number; i1: number; j0: number }>();
  for (let j = 0; j <= ROWS; j++) {
    const next = new Map<string, { i0: number; i1: number; j0: number }>();
    if (j < ROWS) {
      let i = 0;
      while (i < COLS) {
        if (!r.band[j * COLS + i]) { i++; continue; }
        const s = i;
        while (i < COLS && r.band[j * COLS + i]) i++;
        const key = `${s}-${i}`;
        const prev = open.get(key);
        next.set(key, prev ?? { i0: s, i1: i, j0: j });
        if (prev) open.delete(key);
      }
    }
    for (const run of open.values()) out.push({ x0: -HX + run.i0 * CS, x1: -HX + run.i1 * CS, y0: -HY + run.j0 * CS, y1: -HY + j * CS });
    open = next;
  }
  return out;
}

function boxGeo(rc: Rect, h: number, base: number, cap: number, capH: number, rng: () => number, jitter = 0.06): THREE.BufferGeometry {
  const w = rc.x1 - rc.x0, dpt = rc.y1 - rc.y0;
  const g = new THREE.BoxGeometry(w, h, dpt);
  g.translate((rc.x0 + rc.x1) / 2, h / 2, -(rc.y0 + rc.y1) / 2);
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position'), col = new Float32Array(pos.count * 3);
  const b = new THREE.Color(base), c = new THREE.Color(cap), j = 1 + (rng() - 0.5) * jitter * 2;
  for (let i = 0; i < pos.count; i++) {
    const top = pos.getY(i) > h - capH;
    const k = top ? c : b;
    const shade = top ? 1.05 : 0.86;
    col[i * 3] = k.r * shade * j; col[i * 3 + 1] = k.g * shade * j; col[i * 3 + 2] = k.b * shade * j;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const RAINBOW = [0xff4d6d, 0xff9a3c, 0xffd23f, 0x6be585, 0x3ec6ff, 0x7a6bff, 0xc77dff];
const CANDY = [0xff4d6d, 0x3ec6ff, 0xffd23f, 0x6be585, 0xb06bff];
const PASTEL = [0xf6b6c6, 0xf8d9a0, 0xbfe3f2, 0xcfe8b5, 0xe1c7ee, 0xffe2c0];

interface WallStyle {
  h: number;
  /** Colour of the wall body for a rectangle. */
  body: (rc: Rect, i: number, rng: () => number) => number;
  cap: (rc: Rect, i: number, rng: () => number) => number;
  capH: number;
  /** Leafy blobs along the top. */
  foliage?: { light: number; dark: number; size: number; step: number; lift: number };
  /** Small flowers on top. */
  flowers?: number[];
  rough: number;
  metal?: number;
  emissive?: number;
}

const lighten = (hex: number, k = 0.28) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k).getHex();
const WALLS: Record<ThemeId, WallStyle> = {
  garden: { h: 0.62, body: () => 0x2f7d32, cap: () => 0x4fa043, capH: 0.1, foliage: { light: 0x8bd35a, dark: 0x2f7d32, size: 0.5, step: 0.38, lift: 0.5 }, flowers: [0xff5d8f, 0xffffff, 0xffd23f], rough: 0.9 },
  beach: { h: 0.5, body: (rc, i) => [0xd9b877, 0xcfae6c, 0xe0c283][i % 3], cap: (rc, i) => [0xf2dca0, 0xedd496, 0xf7e7b8][i % 3], capH: 0.14, rough: 0.95 },
  house: { h: 0.82, body: () => 0xb77b4a, cap: (rc) => [0xf6cfd9, 0xfde9c9, 0xd3ebf5, 0xeadbf6][Math.abs(Math.round((rc.x0 * 1.3 + rc.y0 * 0.7) / 2)) % 4], capH: 0.3, rough: 0.8 },
  forest: { h: 0.72, body: () => 0x24602f, cap: () => 0x3f8a3f, capH: 0.1, foliage: { light: 0x58a850, dark: 0x1d4a26, size: 0.56, step: 0.4, lift: 0.55 }, rough: 0.95 },
  festival: { h: 0.62, body: (rc, i) => CANDY[i % CANDY.length], cap: (rc, i) => lighten(CANDY[i % CANDY.length], 0.32), capH: 0.25, rough: 0.45 },
  butterfly: { h: 0.55, body: () => 0x3b8f4a, cap: () => 0x66bd63, capH: 0.1, foliage: { light: 0xa6e08a, dark: 0x3b8f4a, size: 0.46, step: 0.36, lift: 0.46 }, flowers: [0xff9ec2, 0xffd6e8, 0xe9b8ff, 0xfff0a0, 0xffffff], rough: 0.85 },
  crystal: { h: 0.3, body: () => 0x14485a, cap: () => 0x2a8fb0, capH: 0.2, rough: 0.3, metal: 0.2, emissive: 0x0a3a4a },
  town: { h: 0.9, body: (rc, i) => PASTEL[i % PASTEL.length], cap: (rc, i) => [0xc9524a, 0x5a6fa8, 0xd9893a][i % 3], capH: 0.3, rough: 0.75 },
  palace: { h: 0.86, body: (rc) => RAINBOW[Math.abs(Math.floor(((rc.x0 + rc.x1) / 2 + 9) / 2.5)) % 7], cap: (rc) => lighten(RAINBOW[Math.abs(Math.floor(((rc.x0 + rc.x1) / 2 + 9) / 2.5)) % 7], 0.3), capH: 0.3, rough: 0.28, metal: 0.25 },
};

export function buildWorld(c: WorldCtx): World3D {
  const look = LOOK[c.theme];
  const d = new Disposer();
  const group = new THREE.Group();
  const rng = mulberry32(c.seed ^ (c.theme.length * 7919));
  const low = c.quality === 'low' || c.reduced;
  const uTime = { value: 0 };
  const { maze, layout, width } = c;
  const half = width / 2;
  const style = WALLS[c.theme];

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemiI);
  const sun = new THREE.DirectionalLight(look.sun, look.sunI);
  sun.position.set(...look.sunDir);
  sun.castShadow = !low;
  sun.shadow.mapSize.set(c.quality === 'high' ? 2048 : 1024, c.quality === 'high' ? 2048 : 1024);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -11; sc.right = 11; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 50;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  group.add(hemi, sun, sun.target);

  // ---- ground ----
  const gTex = groundTexture(c.theme);
  gTex.repeat.set(7, 4.5);
  const ground = new THREE.Mesh(d.add(new THREE.PlaneGeometry(42, 27)), d.add(new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.95, color: c.highContrast ? 0x9a9a9a : 0xffffff })));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = !low;
  group.add(ground);

  // ---- corridors (ribbon per edge, joined by caps) ----
  const pTex = pathTexture(c.theme);
  const uv = pathUv(c.theme, width);
  const pathMaterial = d.add(new THREE.MeshStandardMaterial({ map: pTex, roughness: c.theme === 'crystal' || c.theme === 'palace' ? 0.4 : 0.85, metalness: c.theme === 'palace' ? 0.15 : 0, vertexColors: true, color: 0xffffff, emissive: c.theme === 'crystal' ? 0x0a3a50 : 0x000000, emissiveIntensity: c.theme === 'crystal' ? 0.5 : 0 }));
  pathMaterial.userData.keep = true;
  const ribbons: THREE.BufferGeometry[] = [], outlines: THREE.BufferGeometry[] = [];
  for (const e of maze.edges) {
    const a = layout.pos[e.a], b = layout.pos[e.b];
    ribbons.push(ribbonGeometry([a, b], width, 0.02, uv.v, uv.u));
    outlines.push(ribbonGeometry([a, b], width + (c.highContrast ? 0.5 : 0.36), 0.012, 2));
  }
  const capGeos: THREE.BufferGeometry[] = [], capOut: THREE.BufferGeometry[] = [];
  for (const n of maze.nodes) {
    const p = layout.pos[n.id];
    const gro = n.type === 'room' || n.type === 'finish' ? 0.3 : 0;
    const geo = new THREE.PlaneGeometry(width + gro * 2, width + gro * 2);
    geo.rotateX(-Math.PI / 2);
    const g2 = geo.clone();
    const uvA = geo.getAttribute('uv');
    for (let i = 0; i < uvA.count; i++) uvA.setXY(i, (geo.getAttribute('position').getX(i) + p[0]) / 3.2, (-geo.getAttribute('position').getZ(i) + p[1]) / 3.2);
    geo.translate(p[0], 0.017, -p[1]);
    g2.scale(1 + 0.3 / (half + gro), 1, 1 + 0.3 / (half + gro));
    g2.translate(p[0], 0.011, -p[1]);
    capGeos.push(geo); capOut.push(g2);
  }
  const floorGeo = d.add(merge([...capGeos, ...ribbons]));
  const floor = new THREE.Mesh(floorGeo, pathMaterial);
  floor.receiveShadow = !low;
  floor.renderOrder = 2;
  const outGeo = d.add(merge([...capOut, ...outlines]));
  const outMat = d.add(new THREE.MeshBasicMaterial({ vertexColors: false, color: c.highContrast ? 0xffffff : look.outline, transparent: true, opacity: c.highContrast ? 0.95 : 0.7, depthWrite: false }));
  const outline = new THREE.Mesh(outGeo, outMat);
  outline.renderOrder = 1;
  group.add(outline, floor);

  // rooms get a soft carpet tint and a warm glow (the highlighted destination room is gold)
  const glowTex = glowTexture();
  const decals: THREE.Mesh[] = [];
  const planeGeo = d.add(new THREE.PlaneGeometry(1, 1));
  planeGeo.rotateX(-Math.PI / 2);
  const decal = (tex: THREE.Texture, w: number, h: number, color: number, opacity: number, y: number, add = false) => {
    const m = new THREE.Mesh(planeGeo, d.add(new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false })));
    m.scale.set(w, 1, h); m.position.y = y; m.renderOrder = 3; return m;
  };
  const zoneTex = canvasTexture('fm:zone', 256, 256, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 12; ctx.setLineDash([26, 18]);
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.4, 0, 7); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.4, 0, 7); ctx.fill();
  });
  for (const n of maze.nodes) {
    const p = layout.pos[n.id];
    if (n.type === 'wait') {
      const z = decal(zoneTex, width * 1.0, width * 1.0, 0xffd36a, 0.9, 0.03);
      z.position.x = p[0]; z.position.z = -p[1]; z.name = 'zone'; group.add(z); decals.push(z);
    } else if (n.type === 'room') {
      const isFinish = false;
      const z = decal(glowTex, width * 2.3, width * 2.3, isFinish ? 0xffd23f : 0xffe7b0, 0.2, 0.025, true);
      z.position.x = p[0]; z.position.z = -p[1]; group.add(z);
    } else if (n.type === 'finish') {
      const z = decal(glowTex, width * 3.2, width * 3.2, 0xffd23f, 0.55, 0.028, true);
      z.position.x = p[0]; z.position.z = -p[1]; z.name = 'fglow'; group.add(z); decals.push(z);
    }
  }

  // ---- walls ----
  const wallT = c.theme === 'crystal' ? 0.5 : 0.46;
  const ras = rasterize(c, wallT);
  const rects = wallRects(ras);
  const region = (rc: Rect) => (Math.floor((rc.x0 + rc.x1) / 4 + 6) * 7 + Math.floor((rc.y0 + rc.y1) / 4 + 4)) & 0xffff;
  const wallParts = rects.map((rc) => { const i = region(rc); return boxGeo(rc, style.h, style.body(rc, i, rng), style.cap(rc, i, rng), style.capH, rng, 0.02); });
  const wallGeo = d.add(merge(wallParts));
  const wallMat = d.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: style.rough, metalness: style.metal ?? 0, emissive: style.emissive ?? 0x000000, emissiveIntensity: style.emissive ? 0.6 : 0 }));
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.castShadow = !low; walls.receiveShadow = !low;
  group.add(walls);

  const swayMats: THREE.Material[] = [];
  const foliageMat = (rough = 0.9) => { const m = d.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough })); addSway(m, uTime, 0.04, 1.4); swayMats.push(m); return m; };

  // leafy tops and flowers along the walls
  const anchor = (rc: Rect, step: number): Pt[] => {
    const w = rc.x1 - rc.x0, h = rc.y1 - rc.y0, out: Pt[] = [];
    if (w >= h) { const n = Math.max(1, Math.round(w / step)); for (let k = 0; k < n; k++) out.push([rc.x0 + ((k + 0.5) * w) / n, (rc.y0 + rc.y1) / 2]); }
    else { const n = Math.max(1, Math.round(h / step)); for (let k = 0; k < n; k++) out.push([(rc.x0 + rc.x1) / 2, rc.y0 + ((k + 0.5) * h) / n]); }
    return out;
  };
  if (style.foliage) {
    const f = style.foliage;
    const pts = rects.flatMap((rc) => anchor(rc, f.step * (low ? 1.5 : 1)));
    const geo = d.add(blobGeometry(f.size * 0.5, 7, 1, 0.8, 0.3, f.light, f.dark));
    const mesh = instances(geo, foliageMat(), pts, rng, { scale: [0.8, 1.35], y: style.h * 0.55, castShadow: false, receiveShadow: false });
    group.add(mesh);
    if (style.flowers) {
      const fpts = pts.filter(() => rng() < 0.5);
      const fh = d.add(merge([trans(flowerHeadGeometry(6), 0, 0, 0, 0.5, 0.5, 0.5)]));
      const fl = instances(fh, d.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })), fpts, rng, { scale: [0.7, 1.2], y: style.h + f.lift * 0.28, tint: (i, r) => new THREE.Color(style.flowers![Math.floor(r() * style.flowers!.length)]) });
      group.add(fl);
    }
  }
  if (c.theme === 'beach') {
    const pts = rects.flatMap((rc) => anchor(rc, 0.9)).filter(() => rng() < 0.4);
    group.add(instances(d.add(shellGeometry()), d.add(new THREE.MeshStandardMaterial({ roughness: 0.5, vertexColors: true })), pts, rng, { scale: [1.2, 2], y: style.h, tint: (i, r) => new THREE.Color([0xffd9c9, 0xfff0e0, 0xffb6c1, 0xcdeffa][Math.floor(r() * 4)]) }));
  }
  if (c.theme === 'crystal') {
    const cg = d.add(new THREE.OctahedronGeometry(0.34, 0)); cg.scale(0.7, 1.6, 0.7); cg.translate(0, 0.6, 0);
    const pts = rects.flatMap((rc) => anchor(rc, 0.62 * (low ? 1.5 : 1)));
    const cm = d.add(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82, emissive: 0x1f6f9a, emissiveIntensity: 0.9 }));
    const crystals = instances(cg, cm, pts, rng, { scale: [0.6, 1.5], y: 0.05, tilt: 0.3, tint: (i, r) => new THREE.Color().setHSL(0.48 + r() * 0.22, 0.85, 0.62), castShadow: false });
    group.add(crystals);
  }
  if (c.theme === 'town') {
    // little rooftop details: chimneys and signs along the building rows
    const chim = d.add(merge([solid(new THREE.BoxGeometry(0.16, 0.34, 0.16), 0x8a4a3a)]));
    const pts = rects.flatMap((rc) => anchor(rc, 1.6)).filter(() => rng() < 0.45);
    group.add(instances(chim, d.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })), pts, rng, { scale: [0.9, 1.2], y: style.h + 0.14 }));
  }
  if (c.theme === 'palace') {
    // gold finials along the marble
    const fin = d.add(merge([solid(new THREE.SphereGeometry(0.1, 10, 8), 0xffd23f)]));
    const pts = rects.flatMap((rc) => anchor(rc, 1.1)).filter(() => rng() < 0.55);
    group.add(instances(fin, d.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.6, emissive: 0x6a4a00, emissiveIntensity: 0.4 })), pts, rng, { scale: [0.9, 1.3], y: style.h + 0.1 }));
  }

  // ---- decor in the free space around the maze ----
  const occ = (x: number, y: number) => {
    const i = Math.floor((x + HX) / CS), j = Math.floor((y + HY) / CS);
    return i < 0 || j < 0 || i >= COLS || j >= ROWS ? false : ras.corridor[j * COLS + i] === 1 || ras.band[j * COLS + i] === 1;
  };
  const free = (r: number) => (x: number, y: number) => {
    for (let a = 0; a < 8; a++) if (occ(x + Math.cos((a * Math.PI) / 4) * r, y + Math.sin((a * Math.PI) / 4) * r)) return false;
    return !occ(x, y);
  };
  const near = (x: number, y: number) => Math.min(...maze.nodes.map((n) => dist(layout.pos[n.id], [x, y]))) > width * 0.9;
  const spots = (count: number, r: number, wide = false, outside = false): Pt[] => {
    const half2: [number, number] = wide ? [11.5, 7] : [8.6, 4.9], inner = free(r);
    const out: Pt[] = [];
    for (let i = 0; i < count; i++) for (let k = 0; k < 18; k++) {
      const x = (rng() * 2 - 1) * half2[0], y = (rng() * 2 - 1) * half2[1];
      if (!inner(x, y) || !near(x, y)) continue;
      if (outside && Math.abs(x) < 8.1 && Math.abs(y) < 4.6) continue;
      out.push([x, y]); break;
    }
    return out;
  };
  const dens = low ? 0.5 : 1;
  const N = (n: number) => Math.round(n * dens);
  const std = (rough = 0.85) => d.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough }));
  const tintBy = (list: number[]) => (i: number, r: () => number) => new THREE.Color(list[Math.floor(r() * list.length)]);
  const add = (m: THREE.Object3D) => group.add(m);

  const trees = (light: number, dark: number, count: number, sc: [number, number], trunk = 0x7a5230) => {
    const geo = d.add(treeGeometry(5, light, dark, trunk, 1));
    const m = instances(geo, foliageMat(), spots(N(count), 0.9, true), rng, { scale: sc, castShadow: !low });
    add(m);
  };
  const flowersAt = (count: number, colors: number[]) => {
    const pts = spots(N(count), 0.18);
    const head = d.add(merge([trans(flowerHeadGeometry(6), 0, 0.3, 0, 0.55, 0.55, 0.55)])), stem = d.add(stemGeometry(0.3));
    add(instances(head, foliageMat(0.7), pts, rng, { scale: [0.8, 1.25], tint: tintBy(colors) }));
    add(instances(stem, std(), pts, rng, { scale: [0.9, 1.1] }));
  };
  const rocks = (count: number) => add(instances(d.add(rockGeometry(3)), std(0.95), spots(N(count), 0.3, true), rng, { scale: [0.8, 1.7], castShadow: !low }));
  const balloons = (count: number, colors: number[]) => {
    const g = d.add(balloonGeometry());
    const m = instances(g, d.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 })), spots(N(count), 0.3, true, true), rng, { scale: [1.1, 1.7], tint: tintBy(colors), castShadow: !low });
    add(m);
  };
  const poles = (count: number, colors: number[]) => add(instances(d.add(bannerPoleGeometry()), d.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide })), spots(N(count), 0.3, true, true), rng, { scale: [1, 1.3], tint: tintBy(colors), castShadow: !low }));
  const lamps = (count: number) => add(instances(d.add(lampPostGeometry()), std(0.5), spots(N(count), 0.3, true, true), rng, { scale: [1, 1.2], castShadow: !low }));

  switch (c.theme) {
    case 'garden':
      trees(0x8bd35a, 0x2f7d32, 12, [1, 1.5]); flowersAt(110, [0xff5d8f, 0xffffff, 0xffd23f, 0xb06bff]); rocks(8); break;
    case 'beach': {
      const palm = d.add(palmGeometry(2));
      add(instances(palm, foliageMat(0.8), spots(N(9), 1.5, true), rng, { scale: [1, 1.5], castShadow: !low }));
      rocks(10);
      const shells = d.add(shellGeometry());
      add(instances(shells, std(0.5), spots(N(60), 0.15), rng, { scale: [1, 1.8], tint: tintBy([0xffd9c9, 0xfff0e0, 0xffb6c1, 0xcdeffa]) }));
      const umb = d.add(merge([solid(trans(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), 0, 0.6, 0), 0xeeeeee), solid(trans(new THREE.ConeGeometry(0.7, 0.3, 10), 0, 1.25, 0), 0xffffff)]));
      add(instances(umb, std(0.6), spots(N(6), 0.8, true, true), rng, { scale: [1, 1.3], tint: tintBy([0xff6a6a, 0x3ec6ff, 0xffd23f]), castShadow: !low }));
      break;
    }
    case 'house': {
      const pot = d.add(merge([solid(trans(new THREE.CylinderGeometry(0.2, 0.15, 0.28, 10), 0, 0.14, 0), 0xc4693a), blobGeometry(0.28, 4, 1, 0.9, 0.3, 0x7ac074, 0x2f7d32).translate(0, 0.5, 0)]));
      add(instances(pot, std(0.8), spots(N(10), 0.4, true), rng, { scale: [1, 1.5], castShadow: !low }));
      lamps(6);
      const toy = d.add(merge([solid(new THREE.BoxGeometry(0.28, 0.28, 0.28).translate(0, 0.14, 0), 0xffffff)]));
      add(instances(toy, std(0.6), spots(N(26), 0.2), rng, { scale: [0.8, 1.4], tint: tintBy(CANDY), castShadow: !low }));
      break;
    }
    case 'forest': {
      trees(0x4a9a48, 0x1d4a26, 20, [1.1, 1.8], 0x5a3a20);
      add(instances(d.add(mushroomGeometry()), std(0.6), spots(N(34), 0.2), rng, { scale: [1, 2.2] }));
      rocks(14); flowersAt(40, [0xffe27a, 0xffffff]); break;
    }
    case 'festival': {
      balloons(16, CANDY); poles(10, CANDY); lamps(6); break;
    }
    case 'butterfly': {
      flowersAt(200, [0xff9ec2, 0xffd6e8, 0xe9b8ff, 0xfff0a0, 0xffffff]);
      trees(0xffc0d8, 0xc86a9a, 8, [0.9, 1.3], 0x7a5a50); break;
    }
    case 'crystal': {
      const cg = d.add(new THREE.OctahedronGeometry(0.4, 0)); cg.scale(0.7, 1.8, 0.7); cg.translate(0, 0.7, 0);
      const cm = d.add(new THREE.MeshStandardMaterial({ roughness: 0.15, transparent: true, opacity: 0.85, emissive: 0x2a7fb0, emissiveIntensity: 0.9 }));
      add(instances(cg, cm, spots(N(28), 0.5, true), rng, { scale: [0.8, 2.2], tilt: 0.25, tint: (i, r) => new THREE.Color().setHSL(0.45 + r() * 0.3, 0.85, 0.62) }));
      rocks(12); break;
    }
    case 'town': {
      lamps(10); trees(0x6dbd62, 0x2f7d32, 9, [0.7, 1]);
      const hs = [houseGeometry(1.1, 1.1, 0.8, 0xf6b6c6, 0xc9524a), houseGeometry(1.2, 0.9, 0.9, 0xbfe3f2, 0x5a6fa8), houseGeometry(1, 1, 0.7, 0xf8d9a0, 0xd9893a)].map((g) => d.add(g));
      hs.forEach((g, k) => add(instances(g, std(0.75), spots(N(3), 0.8, true, true).filter((_, i) => i % 3 === k || true), rng, { scale: [1, 1.3], castShadow: !low })));
      balloons(6, CANDY); break;
    }
    case 'palace': {
      poles(10, RAINBOW);
      const col = d.add(merge([solid(trans(new THREE.CylinderGeometry(0.16, 0.2, 1.4, 14), 0, 0.7, 0), 0xf4f0ff), solid(trans(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 14), 0, 1.45, 0), 0xffd23f), solid(trans(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 14), 0, 0.05, 0), 0xffd23f)]));
      add(instances(col, d.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.2 })), spots(N(10), 0.5, true, true), rng, { scale: [1, 1.3], castShadow: !low }));
      break;
    }
  }

  // ---- destination landmark beside the finish ----
  // It stands on whichever side of the finish has room inside the picture and is not a corridor: first straight on from the
  // last corridor, then the two sides, then back.
  const fin = maze.byId[maze.finish];
  const fp = layout.pos[fin.id];
  const nb = layout.pos[maze.adj[fin.id][0]];
  const dir: Pt = [fp[0] - nb[0], fp[1] - nb[1]];
  const dl = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / dl, uy = dir[1] / dl;
  const lmScale = Math.min(1.25, (width / 1.6) * 0.95);
  const reach = half + 0.3 + 0.75 * lmScale + 0.25;
  const inside = (x: number, y: number) => Math.abs(x) < 7.8 && Math.abs(y) < 4.3;
  const onCorridor = (x: number, y: number) => {
    for (const [ox, oy] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
      const i = Math.floor((x + ox + HX) / CS), j = Math.floor((y + oy + HY) / CS);
      if (i >= 0 && j >= 0 && i < COLS && j < ROWS && ras.corridor[j * COLS + i]) return true;
    }
    return false;
  };
  const cands: Pt[] = [[ux, uy], [-uy, ux], [uy, -ux], [-ux, -uy]];
  let spot: Pt | null = null;
  for (const [cx, cy] of cands) {
    const x = fp[0] + cx * reach, y = fp[1] + cy * reach;
    if (inside(x, y) && !onCorridor(x, y)) { spot = [x, y]; break; }
  }
  // boxed in on every side (the finish sits in the maze's corner): a small landmark stands at the back of the finish room, behind the star
  const boxedIn = spot === null;
  const lm = boxedIn ? lmScale * 0.55 : lmScale;
  const [lx, ly] = spot ?? [fp[0] + ux * half * 0.55, fp[1] + uy * half * 0.55];
  const landmark = buildLandmark(c.theme, d, uTime);
  landmark.position.set(lx, 0, -ly);
  landmark.scale.setScalar(lm);
  add(landmark);

  // ---- ambient life ----
  const ambient = buildAmbient(c.theme, d, rng, low, group, uTime);

  return {
    group, pathMaterial, fx: look.fx, night: look.night,
    update(t, dt) {
      uTime.value = t;
      ambient(t, dt);
      for (const z of decals) {
        if (z.name === 'zone') { const k = 1 + Math.sin(t * 2 + z.position.x) * 0.03; z.scale.set(width * 1.0 * k, 1, width * 1.0 * k); z.rotation.y = c.reduced ? 0 : t * 0.15; }
        if (z.name === 'fglow') (z.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(t * 2) * 0.12;
      }
      landmark.userData.tick?.(t);
    },
    dispose() { d.dispose(); group.traverse((o) => { const m = o as THREE.InstancedMesh; if (m.isInstancedMesh) m.dispose(); }); },
  };
}

// ---------------------------------------------------------------------------------------------------------------------

function buildLandmark(theme: ThemeId, d: Disposer, uTime: { value: number }): THREE.Group {
  const g = new THREE.Group();
  const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => d.add(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o }));
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true) => { const o = new THREE.Mesh(d.add(geo), m); o.position.set(x, y, z); o.castShadow = cast; g.add(o); return o; };
  const beam = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.5, 0.9, 3, 18, 1, true)), d.add(new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
  beam.position.y = 1.5;
  switch (theme) {
    case 'garden': { // fountain
      mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.28, 24), std(0xcfd6dd, { roughness: 0.5 }), 0, 0.14);
      mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 24), std(0x59c8f0, { roughness: 0.2, metalness: 0.1, emissive: 0x1a6a90, emissiveIntensity: 0.5 }), 0, 0.2, 0, false);
      mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.9, 12), std(0xcfd6dd), 0, 0.6);
      mesh(new THREE.SphereGeometry(0.2, 14, 10), std(0x9fe6ff, { emissive: 0x3aa7d0, emissiveIntensity: 0.7 }), 0, 1.15);
      break;
    }
    case 'beach': { // treasure chest
      mesh(new THREE.BoxGeometry(1.1, 0.5, 0.75), std(0x9a5a2a), 0, 0.25);
      mesh(new THREE.BoxGeometry(1.14, 0.22, 0.79), std(0xb06a30), 0, 0.6);
      mesh(new THREE.BoxGeometry(1.0, 0.1, 0.65), std(0xc98a4a), 0, 0.76);
      mesh(new THREE.BoxGeometry(1.12, 0.1, 0.16), std(0xffc42e, { metalness: 0.7, roughness: 0.3 }), 0, 0.4);
      mesh(new THREE.SphereGeometry(0.2, 12, 8), std(0xffd23f, { emissive: 0xff9a00, emissiveIntensity: 0.9 }), 0, 0.78, 0, false);
      break;
    }
    case 'house': { // bed with a glowing moon lamp
      mesh(new THREE.BoxGeometry(1.4, 0.3, 0.95), std(0x8a5a36), 0, 0.15);
      mesh(new THREE.BoxGeometry(1.3, 0.22, 0.85), std(0xf8f4ff), 0, 0.4);
      mesh(new THREE.BoxGeometry(1.3, 0.14, 0.5), std(0x6fb6ff), 0.2, 0.52);
      mesh(new THREE.BoxGeometry(0.4, 0.14, 0.7), std(0xffffff), -0.5, 0.56);
      mesh(new THREE.SphereGeometry(0.2, 14, 10), std(0xfff3c4, { emissive: 0xffd36a, emissiveIntensity: 1 }), 0.7, 0.85, 0.5, false);
      break;
    }
    case 'forest': { // tree house
      mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.8, 10), std(0x6a4426), 0, 0.9);
      mesh(new THREE.SphereGeometry(0.95, 14, 10), std(0x3f8a3f, { roughness: 0.9 }), 0, 2.1);
      mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), std(0xd9a066), 0, 1.4);
      mesh(new THREE.ConeGeometry(0.55, 0.35, 4), std(0xc9524a), 0, 1.82).rotation.y = Math.PI / 4;
      mesh(new THREE.SphereGeometry(0.12, 10, 8), std(0xfff3c4, { emissive: 0xffd36a, emissiveIntensity: 1.2 }), 0.2, 1.4, 0.38, false);
      break;
    }
    case 'festival': { // carousel
      mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.2, 20), std(0xffd23f), 0, 0.1);
      mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 8), std(0xf4f1e8), 0, 0.9);
      mesh(new THREE.ConeGeometry(1.15, 0.7, 12), std(0xff4d6d), 0, 1.85);
      mesh(new THREE.SphereGeometry(0.14, 10, 8), std(0xffd23f, { emissive: 0xff9a00, emissiveIntensity: 0.8 }), 0, 2.3, 0, false);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; mesh(new THREE.SphereGeometry(0.22, 10, 8), std([0x3ec6ff, 0x6be585, 0xb06bff, 0xff9a3c][k]), Math.cos(a) * 0.65, 0.6, Math.sin(a) * 0.65); }
      g.userData.tick = (t: number) => { g.rotation.y = Math.sin(t * 0.5) * 0.15; };
      break;
    }
    case 'butterfly': { // giant flower
      const petals = new THREE.Group();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const p = new THREE.Mesh(d.add(new THREE.SphereGeometry(0.34, 12, 8)), std([0xff9ec2, 0xffc0d8][k % 2], { roughness: 0.5 })); p.scale.set(1.6, 0.4, 1); p.position.set(Math.cos(a) * 0.62, 0.36, Math.sin(a) * 0.62); p.rotation.y = -a; p.castShadow = true; petals.add(p); }
      g.add(petals);
      mesh(new THREE.SphereGeometry(0.3, 14, 10), std(0xffd23f, { emissive: 0xffa000, emissiveIntensity: 0.5 }), 0, 0.5);
      g.userData.tick = (t: number) => { petals.rotation.y = t * 0.12; };
      break;
    }
    case 'crystal': { // crystal tower
      const m = std(0x9fe9ff, { roughness: 0.12, transparent: true, opacity: 0.88, emissive: 0x3fb4e0, emissiveIntensity: 1.1 });
      for (const [x, z, s] of [[0, 0, 1], [0.55, 0.2, 0.6], [-0.5, 0.25, 0.7], [0.1, -0.5, 0.55]] as [number, number, number][]) { const o = mesh(new THREE.OctahedronGeometry(0.5 * s, 0), m, x, 0.9 * s + 0.2, z); o.scale.set(0.8, 2.3, 0.8); }
      g.userData.tick = (t: number) => { g.rotation.y = t * 0.2; };
      break;
    }
    case 'town': { // town hall with a flag
      mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), std(0xf6e3c0), 0, 0.45);
      mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), std(0xe9d2a2), 0, 1.1);
      mesh(new THREE.ConeGeometry(0.42, 0.55, 4), std(0xc9524a), 0, 2.0).rotation.y = Math.PI / 4;
      mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), std(0xffffff), 0, 1.35, 0.27).rotation.x = Math.PI / 2;
      mesh(new THREE.BoxGeometry(0.4, 0.22, 0.02), std(0x3ec6ff), 0.22, 2.45);
      mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), std(0xeeeeee), 0, 2.3);
      break;
    }
    case 'palace': { // throne under a rainbow
      mesh(new THREE.BoxGeometry(1.5, 0.2, 1.2), std(0xf4f0ff, { roughness: 0.3 }), 0, 0.1);
      mesh(new THREE.BoxGeometry(1.1, 0.2, 0.9), std(0xffd23f, { metalness: 0.6, roughness: 0.3 }), 0, 0.3);
      mesh(new THREE.BoxGeometry(0.6, 0.35, 0.5), std(0xc77dff, { metalness: 0.2 }), 0, 0.57);
      mesh(new THREE.BoxGeometry(0.6, 0.9, 0.12), std(0xc77dff, { metalness: 0.2 }), 0, 0.95, -0.2);
      mesh(new THREE.SphereGeometry(0.1, 10, 8), std(0xffd23f, { emissive: 0xff9a00, emissiveIntensity: 0.9 }), 0, 1.5, -0.2, false);
      RAINBOW.forEach((col, k) => { const t = new THREE.Mesh(d.add(new THREE.TorusGeometry(1.15 + k * 0.1, 0.05, 6, 28, Math.PI)), d.add(new THREE.MeshBasicMaterial({ color: col }))); t.position.y = 0.4; t.position.z = -0.35; g.add(t); });
      break;
    }
  }
  g.add(beam);
  g.userData.beam = beam;
  void uTime;
  return g;
}

/** Gentle ambient life. Returns an updater. */
function buildAmbient(theme: ThemeId, d: Disposer, rng: () => number, low: boolean, group: THREE.Group, uTime: { value: number }): (t: number, dt: number) => void {
  void uTime;
  // drifting motes (fireflies / dust / sparkles) in the theme's colours
  const moteCount = low ? 0 : theme === 'forest' || theme === 'crystal' ? 46 : theme === 'palace' || theme === 'festival' ? 36 : theme === 'butterfly' ? 14 : 18;
  const palette: Record<ThemeId, number[]> = {
    garden: [0xfff3b0, 0xffffff], beach: [0xffffff, 0xbff4ff], house: [0xffe9b8, 0xffffff], forest: [0xf8ff9a, 0xc8ff7a], festival: [0xff4d6d, 0xffd23f, 0x3ec6ff],
    butterfly: [0xffd6e8, 0xffffff], crystal: [0x7af0ff, 0xff9ad6, 0xb6ff8f], town: [0xffffff, 0xffe9a0], palace: [0xffd23f, 0xff5d8f, 0x4cc9f0, 0xc77dff],
  };
  const motes: { m: THREE.Sprite; x: number; y: number; z: number; sp: number; ph: number }[] = [];
  const tex = glowTexture();
  for (let i = 0; i < moteCount; i++) {
    const mat = d.add(new THREE.SpriteMaterial({ map: tex, color: palette[theme][i % palette[theme].length], transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    const s = new THREE.Sprite(mat); const sz = 0.2 + rng() * 0.22; s.scale.set(sz, sz, 1);
    const o = { m: s, x: (rng() * 2 - 1) * 9, z: (rng() * 2 - 1) * 5, y: 0.5 + rng() * 1.6, sp: 0.2 + rng() * 0.4, ph: rng() * 6.3 };
    motes.push(o); group.add(s);
  }
  // butterflies (stronger in the butterfly garden, a few elsewhere in gardens)
  const nB = low ? 0 : theme === 'butterfly' ? 14 : theme === 'garden' || theme === 'beach' || theme === 'forest' ? 3 : 0;
  const wingGeo = d.add(new THREE.PlaneGeometry(0.4, 0.32)); wingGeo.rotateX(-Math.PI / 2); wingGeo.translate(0.2, 0, 0);
  const bfs: { g: THREE.Group; l: THREE.Object3D; r: THREE.Object3D; cx: number; cz: number; rad: number; sp: number; ph: number }[] = [];
  for (let i = 0; i < nB; i++) {
    const hue = [330, 45, 280, 200, 20][i % 5];
    const mat = d.add(new THREE.MeshBasicMaterial({ map: wingTexture(hue), transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, toneMapped: false }));
    const g = new THREE.Group();
    const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
    r.scale.x = -1;
    const lg = new THREE.Group(), rg = new THREE.Group(); lg.add(l); rg.add(r);
    g.add(lg, rg);
    const o = { g, l: lg, r: rg, cx: (rng() * 2 - 1) * 7, cz: (rng() * 2 - 1) * 4, rad: 0.8 + rng() * 2.2, sp: 0.35 + rng() * 0.5, ph: rng() * 6.3 };
    bfs.push(o); group.add(g);
  }
  return (t, dt) => {
    void dt;
    for (const o of motes) {
      const a = t * o.sp + o.ph;
      o.m.position.set(o.x + Math.sin(a) * 0.6, o.y + Math.sin(a * 1.3) * 0.25, o.z + Math.cos(a * 0.9) * 0.5);
      (o.m.material as THREE.SpriteMaterial).opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(a * 2.2));
    }
    for (const b of bfs) {
      const a = t * b.sp + b.ph;
      b.g.position.set(b.cx + Math.cos(a) * b.rad, 0.9 + Math.sin(a * 2.1) * 0.12, b.cz + Math.sin(a * 1.3) * b.rad * 0.7);
      b.g.rotation.y = -a + Math.PI / 2;
      const flap = Math.sin(t * 16 + b.ph) * 0.9;
      b.l.rotation.z = flap; b.r.rotation.z = -flap;
    }
  };
}

export { ringTexture, hsl };
