import * as THREE from 'three';
import { fitFor, hexCorners, type Layout } from '@/lib/safehexarena3d/geometry';
import type { Config, TileState } from '@/lib/safehexarena3d/engine';

/**
 * Safe Hex Arena 3D renderer (child Display). Pure presentation: it draws whatever tile states it is given.
 *
 * Two cameras:
 *  - FLOOR (default, the one used for real projection): orthographic, straight down, so a hexagon on screen has
 *    the true proportions of a hexagon on the floor. No camera movement during play; margin and scale come from config.
 *  - CINEMATIC: perspective preview only, never the physical floor mode.
 * Tiles are real extruded, bevelled hexagons with shadows. No texture downloads: icons are drawn once on small canvases.
 */
const TILE_R = 0.86; // top-face circumradius
const BEVEL = 0.07;
const DEPTH = 0.26;
const TOP_Y = DEPTH + BEVEL;
const BASE_Y = -0.22;

const COLORS = {
  safe: new THREE.Color('#2f72e6'),
  safeEmissive: new THREE.Color('#5fa2ff'),
  warn: new THREE.Color('#ffa21f'),
  warnEmissive: new THREE.Color('#ff8a00'),
  inactive: new THREE.Color('#1a2850'),
  safeHC: new THREE.Color('#4b97ff'),
  background: new THREE.Color('#050b1c'),
  backgroundHC: new THREE.Color('#000000'),
  base: new THREE.Color('#0a1432'),
};

export interface DrawInput {
  states: readonly TileState[];
  /** 0..1 progress through the warning period (drives the gradual amber transition). */
  progress: number;
  /** Therapist-confirmed tile of the child, or null. */
  childTile: number | null;
  /** Draw every tile as safe (used when Control is not connected). */
  allSafe: boolean;
  config: Config;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function makeTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 1 world unit = 256 / DECAL_SIZE px
const DECAL_SIZE = 1.8;
const PX = 256 / DECAL_SIZE;

/** Warning: diagonal hazard stripes inside the tile + a triangle with "!" (pattern and icon, not colour alone). */
function warningTexture() {
  return makeTexture((ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.save();
    hexPath(ctx, s / 2, s / 2, TILE_R * PX * 0.94);
    ctx.clip();
    ctx.lineWidth = 15;
    ctx.strokeStyle = 'rgba(70,32,0,0.55)';
    for (let x = -s; x < s * 2; x += 38) {
      ctx.beginPath();
      ctx.moveTo(x, s);
      ctx.lineTo(x + s, 0);
      ctx.stroke();
    }
    ctx.restore();
    hexPath(ctx, s / 2, s / 2, TILE_R * PX * 0.94);
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(70,32,0,0.8)';
    ctx.stroke();
    // icon plate
    ctx.fillStyle = '#fff4dc';
    ctx.beginPath();
    ctx.moveTo(s / 2, s / 2 - 52);
    ctx.lineTo(s / 2 + 50, s / 2 + 36);
    ctx.lineTo(s / 2 - 50, s / 2 + 36);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#fff4dc';
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = '#7a3200';
    ctx.font = 'bold 74px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', s / 2, s / 2 + 8);
  });
}

/** Inactive: dashed outline and a bar. Reads as "switched off", never as a hole. */
function inactiveTexture() {
  return makeTexture((ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    hexPath(ctx, s / 2, s / 2, TILE_R * PX * 0.9);
    ctx.setLineDash([22, 16]);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(190,210,255,0.85)';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(190,210,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(s / 2 - 34, s / 2 - 7, 68, 14, 7);
    ctx.fill();
  });
}

/** Safe: a quiet inner ring and a dot, so safe tiles also carry a pattern. */
function safeTexture() {
  return makeTexture((ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    hexPath(ctx, s / 2, s / 2, TILE_R * PX * 0.74);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(210,232,255,0.7)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(230,243,255,0.85)';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 9, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Marker for the tile the therapist confirmed the child is on: ring + footprints. */
function childTexture() {
  return makeTexture((ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    hexPath(ctx, s / 2, s / 2, TILE_R * PX * 0.98);
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    const foot = (x: number, y: number, rot: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(0, 6, 17, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(-15 + i * 10, -30 - (i === 0 || i === 3 ? 0 : 6), i === 0 ? 5 : 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    foot(s / 2 - 30, s / 2 + 4, -0.12);
    foot(s / 2 + 30, s / 2 - 6, 0.12);
  });
}

interface Tile {
  mesh: THREE.Mesh;
  top: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  decal: THREE.Mesh;
  decalMaterial: THREE.MeshBasicMaterial;
  warnAmt: number;
  inactAmt: number;
}

export function createArena(canvas: HTMLCanvasElement, layout: Layout, config: Config) {
  const size = layout.tiles;
  const high = config.quality === 'high';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: high, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = high ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = COLORS.background.clone();

  const bounds = layout.bounds;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minY + bounds.maxY) / 2;
  const arenaW = bounds.width;
  const arenaH = bounds.height;

  // lights
  const hemi = new THREE.HemisphereLight('#d6e6ff', '#1a2a5a', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2.3);
  sun.position.set(cx - 5, 12, cz - 4);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
  const sc = sun.shadow.camera;
  const ext = Math.max(arenaW, arenaH) * 0.75;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 5;
  scene.add(sun, sun.target);

  // base plate that catches the soft shadows
  const baseGeo = new THREE.PlaneGeometry(arenaW + 6, arenaH + 6);
  const baseMat = new THREE.MeshStandardMaterial({ color: COLORS.base, roughness: 0.95, metalness: 0 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.rotation.x = -Math.PI / 2;
  base.position.set(cx, BASE_Y, cz);
  base.receiveShadow = true;
  scene.add(base);

  // shared tile geometry
  const shape = new THREE.Shape();
  hexCorners({ x: 0, y: 0 }, TILE_R - BEVEL).forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  shape.closePath();
  const tileGeo = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: high ? 4 : 2, curveSegments: 1 });
  tileGeo.rotateX(-Math.PI / 2);
  // glowing top edge: a hexagonal ring just above the top face
  const ringGeo = new THREE.RingGeometry((TILE_R - 0.075) * 1, TILE_R - 0.02, 6, 1);
  ringGeo.rotateZ(Math.PI / 6);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.safeEmissive, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  const decalGeo = new THREE.PlaneGeometry(DECAL_SIZE, DECAL_SIZE);
  decalGeo.rotateX(-Math.PI / 2);

  const texWarn = warningTexture();
  const texInactive = inactiveTexture();
  const texSafe = safeTexture();
  const texChild = childTexture();

  const tiles: Tile[] = [];
  const decalMats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < size; i++) {
    const c = layout.centers[i];
    const material = new THREE.MeshStandardMaterial({ color: COLORS.safe, roughness: 0.38, metalness: 0.1, emissive: COLORS.safeEmissive, emissiveIntensity: 0.14, transparent: true });
    const mesh = new THREE.Mesh(tileGeo, material);
    mesh.position.set(c.x, 0, c.y);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const top = new THREE.Mesh(ringGeo, ringMat);
    top.position.set(c.x, TOP_Y + 0.004, c.y);
    const decalMaterial = new THREE.MeshBasicMaterial({ map: texSafe, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.5 });
    decalMats.push(decalMaterial);
    const decal = new THREE.Mesh(decalGeo, decalMaterial);
    decal.position.set(c.x, TOP_Y + 0.008, c.y);
    scene.add(mesh, top, decal);
    tiles.push({ mesh, top, material, decal, decalMaterial, warnAmt: 0, inactAmt: 0 });
  }

  // child marker
  const markerMat = new THREE.MeshBasicMaterial({ map: texChild, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
  const marker = new THREE.Mesh(decalGeo, markerMat);
  marker.position.y = TOP_Y + 0.016;
  marker.visible = false;
  scene.add(marker);

  // calibration grid: true cell outlines (circumradius 1, the physical cell), a centre cross and the display frame
  const grid = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 });
  for (let i = 0; i < size; i++) {
    const pts = hexCorners(layout.centers[i], 1).map((p) => new THREE.Vector3(p.x, TOP_Y + 0.03, p.y));
    grid.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  const cross = [new THREE.Vector3(cx - 0.4, TOP_Y + 0.03, cz), new THREE.Vector3(cx + 0.4, TOP_Y + 0.03, cz), new THREE.Vector3(cx, TOP_Y + 0.03, cz - 0.4), new THREE.Vector3(cx, TOP_Y + 0.03, cz + 0.4)];
  grid.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cross), gridMat));
  grid.visible = false;
  scene.add(grid);

  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const persp = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  let camera: THREE.Camera = ortho;
  let lastW = 0;
  let lastH = 0;
  let lastKey = '';

  function fitCamera(w: number, h: number, c: Config) {
    const aspect = w / h;
    const key = `${w}x${h}:${c.view}:${c.margin}:${c.scale}`;
    if (key === lastKey) return;
    lastKey = key;
    const fit = fitFor(layout, { aspect, margin: c.margin, scale: c.scale });
    const f = Math.max(0.2, (1 - (2 * c.margin) / 100) * (c.scale / 100));
    if (c.view === 'floor') {
      const halfH = fit.halfH;
      ortho.left = -halfH * aspect;
      ortho.right = halfH * aspect;
      ortho.top = halfH;
      ortho.bottom = -halfH;
      ortho.up.set(0, 0, -1);
      ortho.position.set(cx, 30, cz);
      ortho.lookAt(cx, 0, cz);
      ortho.updateProjectionMatrix();
      camera = ortho;
    } else {
      persp.aspect = aspect;
      const fovV = (persp.fov * Math.PI) / 180;
      const dist = Math.max((arenaH * 1.15) / (2 * f * Math.tan(fovV / 2)), (arenaW * 1.1) / (2 * f * Math.tan(fovV / 2) * aspect));
      const tilt = (52 * Math.PI) / 180;
      persp.position.set(cx, Math.sin(tilt) * dist, cz + Math.cos(tilt) * dist);
      persp.up.set(0, 1, 0);
      persp.lookAt(cx, 0, cz);
      persp.updateProjectionMatrix();
      camera = persp;
    }
  }

  const tmp = new THREE.Color();
  let frames = 0;
  let fpsWindowStart = performance.now();
  let fps = 0;
  let time = 0;

  function draw(input: DrawInput, dt: number) {
    const c = input.config;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (w !== lastW || h !== lastH) {
      renderer.setSize(w, h, false);
      lastW = w;
      lastH = h;
      lastKey = '';
    }
    fitCamera(w, h, c);
    time += dt;
    const hc = c.highContrast;
    const k = c.intensity / 100;
    const calm = c.reducedMotion;
    (scene.background as THREE.Color).copy(hc ? COLORS.backgroundHC : COLORS.background);
    baseMat.color.copy(hc ? new THREE.Color('#000000') : COLORS.base);
    grid.visible = c.grid;

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const st: TileState = input.allSafe ? 'SAFE' : input.states[i] ?? 'SAFE';
      let tw = 0;
      let ti = 0;
      let rate = calm ? 30 : 6;
      if (st === 'WARNING') tw = ease(clamp01(input.progress / 0.4));
      else if (st === 'INACTIVE') { tw = 0; ti = 1; }
      else if (st === 'RESTORING') rate = calm ? 30 : 2.2;
      const a = 1 - Math.exp(-rate * dt);
      t.warnAmt += (tw - t.warnAmt) * a;
      t.inactAmt += (ti - t.inactAmt) * a;

      tmp.copy(hc ? COLORS.safeHC : COLORS.safe).lerp(COLORS.warn, t.warnAmt).lerp(COLORS.inactive, t.inactAmt);
      t.material.color.copy(tmp);
      const breathe = calm || st !== 'WARNING' ? 1 : 1 + 0.07 * Math.sin(time * 1.6);
      tmp.copy(COLORS.safeEmissive).lerp(COLORS.warnEmissive, t.warnAmt);
      t.material.emissive.copy(tmp);
      t.material.emissiveIntensity = (0.12 + 0.26 * t.warnAmt + (hc ? 0.18 : 0)) * (1 - 0.8 * t.inactAmt) * breathe * k;
      t.material.opacity = 1 - (hc ? 0.62 : 0.7) * t.inactAmt;
      const casts = t.inactAmt < 0.5;
      if (t.mesh.castShadow !== casts) t.mesh.castShadow = casts;
      const ringMatOpacity = (1 - t.inactAmt) * (hc ? 0.95 : 0.5);
      t.top.visible = ringMatOpacity > 0.05;

      // decal: pattern/icon follows the state
      const warnShow = t.warnAmt * (1 - t.inactAmt);
      const map = warnShow > 0.35 ? texWarn : t.inactAmt > 0.35 ? texInactive : texSafe;
      if (t.decalMaterial.map !== map) { t.decalMaterial.map = map; t.decalMaterial.needsUpdate = true; }
      t.decalMaterial.opacity =
        (map === texWarn ? Math.min(1, warnShow * 1.15) : map === texInactive ? t.inactAmt : (1 - t.warnAmt) * (1 - t.inactAmt) * (hc ? 0.9 : 0.5)) * Math.max(0.55, k);
    }
    ringMat.opacity = (hc ? 0.95 : 0.5) * k;

    // child marker
    if (input.childTile !== null && input.childTile < size) {
      const target = layout.centers[input.childTile];
      if (!marker.visible) marker.position.set(target.x, marker.position.y, target.y);
      marker.visible = true;
      const m = calm ? 1 : 1 - Math.exp(-14 * dt);
      marker.position.x += (target.x - marker.position.x) * m;
      marker.position.z += (target.y - marker.position.z) * m;
      markerMat.opacity += (1 - markerMat.opacity) * (1 - Math.exp(-8 * dt));
    } else if (marker.visible) {
      markerMat.opacity -= markerMat.opacity * (1 - Math.exp(-10 * dt));
      if (markerMat.opacity < 0.02) marker.visible = false;
    }

    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - fpsWindowStart >= 1000) {
      fps = (frames * 1000) / (now - fpsWindowStart);
      frames = 0;
      fpsWindowStart = now;
    }
  }

  function stats() {
    const info = renderer.info;
    return { fps: Math.round(fps * 10) / 10, calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, tiles: size, view: camera === ortho ? 'floor' : 'cinematic' };
  }

  /** Screen position (0..1) of a tile centre, or of a point offset from it in layout units: proves the Display layout matches the Control map. */
  function project(index: number, dx = 0, dy = 0) {
    const c = layout.centers[index];
    const v = new THREE.Vector3(c.x + dx, TOP_Y, c.y + dy).project(camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  function dispose() {
    for (const t of tiles) { t.material.dispose(); t.decalMaterial.dispose(); }
    for (const m of [baseMat, ringMat, markerMat, gridMat]) m.dispose();
    for (const g of [baseGeo, tileGeo, ringGeo, decalGeo]) g.dispose();
    grid.children.forEach((o) => (o as THREE.Line).geometry.dispose());
    for (const t of [texWarn, texInactive, texSafe, texChild]) t.dispose();
    sun.shadow.map?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { draw, stats, project, dispose };
}
