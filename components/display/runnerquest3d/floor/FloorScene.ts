import * as THREE from "three";
import { decorFor, pathHalfWidth, waterFor, type DecorItem } from "@/lib/runnerquest3d/floorDecor";
import { cameraZ, frustumFor, gridCell, padRadius, regionX, rowZ, ROW_SPACING, type Frustum } from "@/lib/runnerquest3d/floorLayout";
import type { DisplayState } from "@/lib/runnerquest3d/protocol";
import type { FloorCalibration, FloorObjective, Lane, StageSpec } from "@/lib/runnerquest3d/types";
import { Own } from "../scene/own";
import { paletteFor } from "../scene/palette";
import { Sparkles } from "../scene/sparkles";
import { glowTexture, grassTexture, pathTexture } from "../scene/textures";
import { QUALITY, QUALITY_ORDER, type Quality, type SceneStats } from "../scene/types";

const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const LANES: readonly Lane[] = [-1, 0, 1];
/** Rows kept visible: one behind the child, the current one, and the road ahead. */
const ROWS_BEHIND = 2;
const ROWS_AHEAD = 3;
const PAD_H = 0.14;

export interface FloorStageInput { spec: StageSpec; stageIndex: number; seed: number; objectives: readonly FloorObjective[] }
export interface FloorSceneOptions { quality: Quality; autoQuality?: boolean; onContextLost?: () => void; onQualityChange?: (q: Quality) => void }

interface Colors {
  ground: number; path: number; idle: number; rim: number; target: number; targetEmissive: number; step: number; rest: number; done: number; skipped: number; icon: number; glow: number;
}
const NORMAL: Colors = { ground: 0xffffff, path: 0xb4a888, idle: 0xf7f2e6, rim: 0x6d5d3f, target: 0xffb81c, targetEmissive: 0xff9500, step: 0x58d6c0, rest: 0xb9a9ff, done: 0x6fd48a, skipped: 0xb9c0c8, icon: 0x4a2e12, glow: 0xffd45a };
const CONTRAST: Colors = { ground: 0x10162b, path: 0x232b4d, idle: 0x3e4770, rim: 0xffffff, target: 0xffee00, targetEmissive: 0xffee00, step: 0x00e5ff, rest: 0xff80ff, done: 0x00e676, skipped: 0x8a8f99, icon: 0x000000, glow: 0xffffff };

type IconName = "left" | "right" | "centre" | "step" | "rest" | "done" | "skip";

function iconTexture(own: Own, name: IconName): THREE.CanvasTexture {
  const S = 128, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 14;
  const arrow = (dir: 1 | -1) => {
    g.beginPath(); g.moveTo(S / 2 - dir * 34, S / 2); g.lineTo(S / 2 + dir * 30, S / 2); g.stroke();
    g.beginPath(); g.moveTo(S / 2 + dir * 6, S / 2 - 30); g.lineTo(S / 2 + dir * 36, S / 2); g.lineTo(S / 2 + dir * 6, S / 2 + 30); g.stroke();
  };
  switch (name) {
    case "left": arrow(-1); break;
    case "right": arrow(1); break;
    case "centre": g.beginPath(); g.arc(S / 2, S / 2, 24, 0, Math.PI * 2); g.fill(); g.lineWidth = 8; g.beginPath(); g.arc(S / 2, S / 2, 42, 0, Math.PI * 2); g.stroke(); break;
    case "step": // two footprints
      for (const [x, y, r] of [[42, 70, -0.2], [84, 52, 0.2]] as const) { g.save(); g.translate(x, y); g.rotate(r); g.beginPath(); g.ellipse(0, 0, 15, 26, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(0, -34, 10, 9, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      break;
    case "rest": // crescent
      g.beginPath(); g.arc(S / 2, S / 2, 38, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = "destination-out"; g.beginPath(); g.arc(S / 2 + 20, S / 2 - 12, 34, 0, Math.PI * 2); g.fill(); break;
    case "done": // star
      g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 20 : 44, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); } g.closePath(); g.fill(); break;
    case "skip": g.beginPath(); g.moveTo(S / 2 - 30, S / 2); g.lineTo(S / 2 + 30, S / 2); g.stroke(); break;
  }
  const t = own.tex(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Pad {
  region: Lane;
  group: THREE.Group;
  disc: THREE.Mesh; discMat: THREE.MeshStandardMaterial;
  rim: THREE.Mesh; rimMat: THREE.MeshBasicMaterial;
  icon: THREE.Mesh; iconMat: THREE.MeshBasicMaterial;
  glow: THREE.Mesh; glowMat: THREE.MeshBasicMaterial;
  scale: number; opacity: number;
}
interface Row { index: number; group: THREE.Group; pads: Pad[] }

/**
 * Premium FLOOR renderer: a stable orthographic top-down camera over a stylised journey. Pure presentation: it draws the
 * authoritative DisplayState it is given and owns every GPU resource it creates. The regions are flat, large and always inside
 * the safe area; scenery stays outside the clear zone (see lib/runnerquest3d/floorDecor.ts).
 */
export class FloorScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 80);
  private own = new Own();
  private stageOwn = new Own();
  private hemi = new THREE.HemisphereLight(0xffffff, 0x557a4a, 1.25);
  private sun = new THREE.DirectionalLight(0xffffff, 2.4);
  private root = new THREE.Group();
  private stageGroup = new THREE.Group();
  private grid = new THREE.Group();
  private avatar = new THREE.Group();
  private avatarParts: { body: THREE.Object3D; feet: THREE.Object3D[]; cap: THREE.Mesh } | null = null;
  private sparkles: Sparkles;
  private pulseRings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number; x: number; z: number; r: number }[] = [];
  private dots: THREE.InstancedMesh | null = null;
  private dotMat: THREE.MeshBasicMaterial | null = null;
  private icons: Record<IconName, THREE.CanvasTexture>;
  private glowTex: THREE.CanvasTexture;
  private discGeo: THREE.CylinderGeometry; private rimGeo: THREE.RingGeometry; private planeGeo: THREE.PlaneGeometry; private glowGeo: THREE.CircleGeometry;
  private rows: Row[] = [];
  private stage: FloorStageInput | null = null;
  private layoutKey = "";
  private contrast = false;
  private colors: Colors = NORMAL;
  private frustum: Frustum = frustumFor(16 / 9, { pad: "normal", range: "normal", margin: 0.05 });
  private gridKey = "";
  private quality: Quality;
  private lastNow = 0;
  private t = 0;
  private prog = 0;
  private ax = 0; private az = 0; private ayaw = 0;
  private lastCurrent = -1; private lastCue = -1; private lastRegionSeq = -1; private lastLifecycle = "";
  private cueFlash = 0;
  private frameMs: number[] = [];
  private frames = 0;
  private slowRun = 0;
  private disposed = false;
  private assetLoadMs = 0;
  private onLost = (e: Event) => { e.preventDefault(); this.opts.onContextLost?.(); };

  constructor(private canvas: HTMLCanvasElement, private opts: FloorSceneOptions) {
    const t0 = performance.now();
    this.quality = opts.quality;
    const q = QUALITY[this.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    canvas.addEventListener("webglcontextlost", this.onLost);
    const own = this.own;
    this.glowTex = glowTexture(own);
    this.icons = { left: iconTexture(own, "left"), right: iconTexture(own, "right"), centre: iconTexture(own, "centre"), step: iconTexture(own, "step"), rest: iconTexture(own, "rest"), done: iconTexture(own, "done"), skip: iconTexture(own, "skip") };
    this.discGeo = own.geom(new THREE.CylinderGeometry(1, 1, PAD_H, 48));
    this.rimGeo = own.geom(new THREE.RingGeometry(1, 1.1, 64).rotateX(-Math.PI / 2));
    this.planeGeo = own.geom(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    this.glowGeo = own.geom(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2));
    this.sparkles = new Sparkles(own);
    this.buildAvatar();
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.root, this.hemi, this.sun, this.sun.target, this.camera);
    this.root.add(this.stageGroup, this.avatar, this.sparkles.root);
    this.camera.add(this.grid);
    this.applyQuality(this.quality);
    this.assetLoadMs = performance.now() - t0;
  }

  getQuality(): Quality { return this.quality; }
  setQuality(q: Quality): void {
    if (q === this.quality || this.disposed) return;
    this.quality = q;
    this.applyQuality(q);
    this.layoutKey = ""; // scenery density follows quality
    this.opts.onQualityChange?.(q);
  }
  private applyQuality(q: Quality): void {
    const p = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.dpr));
    this.renderer.shadowMap.enabled = p.shadows > 0;
    this.sun.castShadow = p.shadows > 0;
    if (p.shadows > 0) { this.sun.shadow.mapSize.set(p.shadows, p.shadows); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.resize();
    this.scene.traverse((o) => { if (o instanceof THREE.Mesh && o.material) (o.material as THREE.Material).needsUpdate = true; });
  }

  resize(): void {
    const w = this.canvas.clientWidth || this.canvas.width || 1280, h = this.canvas.clientHeight || this.canvas.height || 720;
    this.renderer.setSize(w, h, false);
    this.gridKey = ""; // aspect changed
    this.canvasAspect = w / h;
  }
  private canvasAspect = 16 / 9;

  // ---------------------------------------------------------------- avatar
  private buildAvatar(): void {
    const own = this.own;
    const mat = (c: number, r = 0.6) => own.mat(new THREE.MeshStandardMaterial({ color: c, roughness: r }));
    const sphere = own.geom(new THREE.SphereGeometry(1, 24, 16));
    const bodyMat = mat(0xff8a3d, 0.55), skin = mat(0xffd2a1, 0.7), capMat = mat(0x14b8a6, 0.5), packMat = mat(0x7c5cff, 0.6), shoeMat = mat(0x3a2a1a, 0.8);
    const body = new THREE.Mesh(sphere, bodyMat); body.scale.set(0.62, 0.5, 0.74); body.position.y = 0.55;
    const head = new THREE.Mesh(sphere, skin); head.scale.setScalar(0.42); head.position.set(0, 0.95, -0.05);
    const cap = new THREE.Mesh(sphere, capMat); cap.scale.set(0.46, 0.3, 0.46); cap.position.set(0, 1.1, -0.02);
    const brim = new THREE.Mesh(own.geom(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 24)), capMat); brim.position.set(0, 1.0, -0.32); brim.scale.set(0.9, 1, 0.55);
    const pack = new THREE.Mesh(sphere, packMat); pack.scale.set(0.34, 0.3, 0.26); pack.position.set(0, 0.7, 0.55);
    const feet = [-1, 1].map((s) => { const f = new THREE.Mesh(sphere, shoeMat); f.scale.set(0.2, 0.14, 0.32); f.position.set(s * 0.26, 0.14, -0.5); return f; });
    const g = new THREE.Group();
    g.add(body, head, cap, brim, pack, ...feet);
    g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    g.scale.setScalar(1.25);
    this.avatar.add(g);
    this.avatarParts = { body: g, feet, cap };
  }

  // ---------------------------------------------------------------- stage
  setStage(input: FloorStageInput): void {
    this.stage = input;
    this.layoutKey = ""; // rebuilt on the next render with the current calibration
    this.prog = 0; this.lastCurrent = -1; this.lastCue = -1; this.lastRegionSeq = -1;
    this.ax = 0; this.az = 0;
  }

  private rebuild(cal: FloorCalibration): void {
    const input = this.stage!;
    const so = this.stageOwn;
    so.disposeAll();
    this.rows = [];
    this.pulseRings = [];
    while (this.stageGroup.children.length) this.stageGroup.remove(this.stageGroup.children[0]);
    this.dots = null; this.dotMat = null;
    const pal = paletteFor(input.spec.theme);
    const total = input.objectives.length;
    const r = padRadius(cal);
    const density = this.quality === "low" ? 0.45 : this.quality === "medium" ? 0.75 : 1;
    const len = total * ROW_SPACING + 40;
    const midZ = -(total * ROW_SPACING) / 2 + 6;

    // ground
    const groundTex = grassTexture(so, pal.grassA, pal.grassB);
    groundTex.repeat.set(110 / 5, (len + 70) / 5); // uniform texel density: no stretched streaks
    const groundMat = so.mat(new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, color: this.colors.ground }));
    const ground = new THREE.Mesh(this.planeGeo, groundMat);
    ground.scale.set(110, 1, len + 70); ground.position.set(0, 0, midZ); ground.receiveShadow = true;
    this.stageGroup.add(ground);

    // stone path under the regions + a starting plaza and the destination
    const half = pathHalfWidth(cal);
    const pTex = pathTexture(so);
    pTex.repeat.set((half * 2) / 3.2, len / 3.2);
    const pathMat = so.mat(new THREE.MeshStandardMaterial({ map: pTex, roughness: 0.95, color: this.colors.path }));
    const path = new THREE.Mesh(this.planeGeo, pathMat);
    path.scale.set(half * 2, 1, len - 10); path.position.set(0, 0.012, midZ); path.receiveShadow = true;
    const edgeMat = so.mat(new THREE.MeshStandardMaterial({ color: this.contrast ? 0xffffff : 0x8a7b58, roughness: 0.9 }));
    for (const s of [-1, 1]) {
      const edge = new THREE.Mesh(this.planeGeo, edgeMat);
      edge.scale.set(0.34, 1, len - 10); edge.position.set(s * (half + 0.12), 0.02, midZ); edge.receiveShadow = true;
      this.stageGroup.add(edge);
    }
    this.stageGroup.add(path);
    const destZ = rowZ(total);
    const destMat = so.mat(new THREE.MeshStandardMaterial({ color: this.contrast ? 0x00e676 : 0xffe9a8, roughness: 0.8, emissive: this.contrast ? 0x00e676 : 0xffc94d, emissiveIntensity: 0.25 }));
    const dest = new THREE.Mesh(so.geom(new THREE.CylinderGeometry(half * 0.9, half * 0.9, 0.1, 64)), destMat);
    dest.position.set(0, 0.05, destZ); dest.receiveShadow = true; dest.castShadow = false;
    this.stageGroup.add(dest);
    const star = new THREE.Mesh(this.planeGeo, so.mat(new THREE.MeshBasicMaterial({ map: this.icons.done, transparent: true, color: this.contrast ? 0x000000 : 0xf59e0b, depthWrite: false })));
    star.scale.set(half * 1.1, 1, half * 1.1); star.position.set(0, 0.11, destZ);
    this.stageGroup.add(star);

    // water
    const water = waterFor(input.spec.theme, total, cal);
    if (water && !this.contrast) {
      const wMat = so.mat(new THREE.MeshStandardMaterial({ color: pal.water, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.92 }));
      const geo = water.round ? so.geom(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 40)) : so.geom(new THREE.BoxGeometry(1, 0.06, 1));
      const m = new THREE.Mesh(geo, wMat);
      m.scale.set(water.w, 1, water.d); m.position.set(water.x, 0.03, water.z); m.receiveShadow = true;
      this.stageGroup.add(m);
    }

    // scenery (never in the clear zone) - instanced per kind
    if (!this.contrast) this.addDecor(decorFor(input.spec.theme, input.stageIndex, input.seed, total, cal, density), pal.crown, pal.pine, so);

    // rows of regions
    for (let i = 0; i < total; i++) this.rows.push(this.buildRow(i, input.objectives[i], cal, r, so));
    // soft direction dots (guidance)
    this.dotMat = so.mat(new THREE.MeshBasicMaterial({ color: this.colors.glow, transparent: true, opacity: 0.0, depthWrite: false }));
    this.dots = new THREE.InstancedMesh(so.geom(new THREE.CircleGeometry(0.2, 16).rotateX(-Math.PI / 2)), this.dotMat, 6);
    this.dots.frustumCulled = false; this.dots.position.y = 0.2;
    this.stageGroup.add(this.dots);
    // pulse rings (celebration + cue)
    for (let i = 0; i < 4; i++) {
      const mat = so.mat(new THREE.MeshBasicMaterial({ color: this.colors.glow, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      const mesh = new THREE.Mesh(this.rimGeo, mat);
      mesh.visible = false; mesh.position.y = 0.3;
      this.stageGroup.add(mesh);
      this.pulseRings.push({ mesh, mat, age: 99, x: 0, z: 0, r });
    }
  }

  private addDecor(items: DecorItem[], crown: number, pine: number, so: Own): void {
    const by = (k: DecorItem["kind"]) => items.filter((d) => d.kind === k);
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: DecorItem[], place: (d: DecorItem, m: THREE.Matrix4, c: THREE.Color) => void, cast = true) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4(), c = new THREE.Color();
      list.forEach((d, i) => { place(d, m, c); im.setMatrixAt(i, m); im.setColorAt(i, c); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = cast; im.receiveShadow = true;
      this.stageGroup.add(im);
    };
    const mat = (o: THREE.MeshStandardMaterialParameters = {}) => so.mat(new THREE.MeshStandardMaterial({ roughness: 0.85, ...o }));
    const sphere = so.geom(new THREE.SphereGeometry(1, 14, 10)), cone = so.geom(new THREE.ConeGeometry(1, 2.4, 12)), trunk = so.geom(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 8)), rock = so.geom(new THREE.DodecahedronGeometry(1, 0));
    const at = (d: DecorItem, y: number, sx: number, sy = sx, sz = sx, rot = 0) => new THREE.Matrix4().compose(new THREE.Vector3(d.x, y, d.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(sx, sy, sz));
    const trees = by("tree");
    inst(trunk, mat({ color: 0x6b4a2b }), trees, (d, m, c) => { m.copy(at(d, 0.6, d.s)); c.set(0xffffff); });
    inst(sphere, mat({ color: 0xffffff }), trees, (d, m, c) => { m.copy(at(d, 2.0 * d.s, 1.7 * d.s, 1.25 * d.s, 1.7 * d.s)); c.set(crown); c.offsetHSL(0, 0, (d.tint - 0.5) * 0.12); });
    const pines = by("pine");
    inst(trunk, mat({ color: 0x5a3f27 }), pines, (d, m, c) => { m.copy(at(d, 0.5, d.s)); c.set(0xffffff); });
    inst(cone, mat({ color: 0xffffff }), pines, (d, m, c) => { m.copy(at(d, 1.8 * d.s, 1.15 * d.s, 1.4 * d.s, 1.15 * d.s)); c.set(pine); c.offsetHSL(0, 0, (d.tint - 0.5) * 0.1); });
    inst(sphere, mat({ color: 0xffffff }), by("bush"), (d, m, c) => { m.copy(at(d, 0.35 * d.s, 0.85 * d.s, 0.6 * d.s, 0.85 * d.s)); c.set(crown); c.offsetHSL(0.02, 0, (d.tint - 0.5) * 0.1 - 0.04); });
    const FLOWERS = [0xff7aa8, 0xffd23f, 0xffffff, 0xb28cff, 0xff9a4d];
    inst(sphere, mat({ color: 0xffffff, roughness: 0.6 }), by("flower"), (d, m, c) => { m.copy(at(d, 0.14, 0.17 * d.s, 0.14 * d.s, 0.17 * d.s)); c.set(FLOWERS[Math.floor(d.tint * FLOWERS.length) % FLOWERS.length]); }, false);
    inst(rock, mat({ color: 0xffffff, roughness: 0.95 }), by("rock"), (d, m, c) => { m.copy(at(d, 0.22 * d.s, 0.6 * d.s, 0.36 * d.s, 0.5 * d.s, d.tint * 6)); c.set(0x8d949b); c.offsetHSL(0, 0, (d.tint - 0.5) * 0.12); });
    inst(sphere, mat({ color: 0xffffff, roughness: 0.9 }), by("snow"), (d, m, c) => { m.copy(at(d, 0.03, 1.4 * d.s, 0.04, 1.1 * d.s)); c.set(0xf4f9ff); }, false);
    inst(sphere, mat({ color: 0xffffff, emissive: 0xffb347, emissiveIntensity: 0.9 }), by("lantern"), (d, m, c) => { m.copy(at(d, 1.1 * d.s, 0.32 * d.s)); c.set(0xffd9a0); });
    const banners = by("banner");
    inst(so.geom(new THREE.BoxGeometry(0.1, 1.2, 0.1)), mat({ color: 0x8a6a42 }), banners, (d, m, c) => { m.copy(at(d, 0.6, 1)); c.set(0xffffff); });
    const BANNER = [0xff7aa8, 0x5ec8ff, 0xffd23f, 0x7cdb8a];
    inst(so.geom(new THREE.BoxGeometry(0.9, 0.05, 0.6)), mat({ color: 0xffffff }), banners, (d, m, c) => { m.copy(at(d, 1.25, 1)); m.setPosition(d.x + 0.45, 1.25, d.z); c.set(BANNER[Math.floor(d.tint * BANNER.length) % BANNER.length]); });
  }

  private buildRow(index: number, obj: FloorObjective, cal: FloorCalibration, r: number, so: Own): Row {
    const group = new THREE.Group();
    group.position.set(0, 0, rowZ(index));
    const pads: Pad[] = [];
    for (const region of LANES) {
      const g = new THREE.Group();
      g.position.x = regionX(region, cal);
      const discMat = so.mat(new THREE.MeshStandardMaterial({ color: this.colors.idle, roughness: 0.55, emissive: 0x000000, transparent: true }));
      const disc = new THREE.Mesh(this.discGeo, discMat);
      disc.scale.set(r, 1, r); disc.position.y = PAD_H / 2; disc.receiveShadow = true; disc.castShadow = false;
      const rimMat = so.mat(new THREE.MeshBasicMaterial({ color: this.colors.rim, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      const rim = new THREE.Mesh(this.rimGeo, rimMat);
      rim.scale.set(r, 1, r); rim.position.y = PAD_H + 0.012;
      const iconMat = so.mat(new THREE.MeshBasicMaterial({ map: this.icons.centre, transparent: true, color: this.colors.icon, depthWrite: false }));
      const icon = new THREE.Mesh(this.planeGeo, iconMat);
      icon.scale.set(r * 1.25, 1, r * 1.25); icon.position.y = PAD_H + 0.03; icon.visible = false;
      const glowMat = so.mat(new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, color: this.colors.glow, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      const glow = new THREE.Mesh(this.glowGeo, glowMat);
      glow.scale.set(r * 1.75, 1, r * 1.75); glow.position.y = 0.05;
      g.add(glow, disc, rim, icon);
      group.add(g);
      pads.push({ region, group: g, disc, discMat, rim, rimMat, icon, iconMat, glow, glowMat, scale: 1, opacity: 1 });
    }
    void obj;
    this.stageGroup.add(group);
    return { index, group, pads };
  }

  // ---------------------------------------------------------------- calibration helpers
  private updateGrid(cal: FloorCalibration): void {
    const key = `${this.canvasAspect.toFixed(4)}|${cal.grid}|${cal.margin}|${cal.widthCm}|${cal.heightCm}|${cal.pad}|${cal.range}|${this.contrast}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    while (this.grid.children.length) { const c = this.grid.children[0] as THREE.Mesh; this.grid.remove(c); c.geometry?.dispose(); (c.material as THREE.Material)?.dispose(); }
    this.grid.visible = cal.grid;
    if (!cal.grid) return;
    const f = this.frustum;
    const cell = gridCell(f, cal);
    const verts: number[] = [];
    const hw = f.width / 2, hh = f.height / 2;
    for (let x = 0; x <= hw + 1e-6; x += cell) { verts.push(x, -hh, 0, x, hh, 0); if (x > 0) verts.push(-x, -hh, 0, -x, hh, 0); }
    for (let y = 0; y <= hh + 1e-6; y += cell) { verts.push(-hw, y, 0, hw, y, 0); if (y > 0) verts.push(-hw, -y, 0, hw, -y, 0); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: this.contrast ? 0xffffff : 0x0d3b66, transparent: true, opacity: 0.45, depthTest: false }));
    lines.renderOrder = 10;
    // safe-area frame (the margin the therapist asked for) and a circle: if it looks oval on the floor, the projector is stretching the picture
    const sw = f.safe.width / 2, sh = f.safe.height / 2;
    const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-sw, -sh, 0), new THREE.Vector3(sw, -sh, 0), new THREE.Vector3(sw, sh, 0), new THREE.Vector3(-sw, sh, 0)]), new THREE.LineBasicMaterial({ color: 0xff3b30, depthTest: false }));
    frame.renderOrder = 11;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * f.safe.height * 0.22, Math.sin(a) * f.safe.height * 0.22, 0)); }
    const circle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff3b30, depthTest: false }));
    circle.renderOrder = 11;
    for (const o of [lines, frame, circle]) { o.position.z = -10; this.grid.add(o); }
  }

  private applyContrast(contrast: boolean): boolean {
    if (contrast === this.contrast) return false;
    this.contrast = contrast;
    this.colors = contrast ? CONTRAST : NORMAL;
    this.scene.background = new THREE.Color(contrast ? 0x10162b : 0xa8d8f0);
    this.renderer.toneMapping = contrast ? THREE.NoToneMapping : THREE.NeutralToneMapping; // exact, undimmed colours for high contrast
    this.scene.traverse((o) => { if (o instanceof THREE.Mesh && o.material) (o.material as THREE.Material).needsUpdate = true; });
    this.layoutKey = "";
    this.gridKey = "";
    return true;
  }

  // ---------------------------------------------------------------- frame
  render(state: DisplayState, nowMs: number): void {
    if (this.disposed || !this.stage || !state.floor) return;
    const floor = state.floor;
    const cal = floor.cal;
    const reduced = state.reducedMotion;
    const dt = Math.min(0.1, Math.max(0.0001, this.lastNow ? (nowMs - this.lastNow) / 1000 : 0.016));
    if (this.lastNow) this.trackFrame(nowMs - this.lastNow);
    this.lastNow = nowMs;
    this.t += dt;
    this.applyContrast(cal.highContrast);
    if (!this.scene.background) this.scene.background = new THREE.Color(this.contrast ? 0x10162b : 0xa8d8f0);

    // camera frustum (never stretched)
    const f = frustumFor(this.canvasAspect, cal);
    if (f.width !== this.frustum.width || f.height !== this.frustum.height) { this.frustum = f; this.gridKey = ""; }
    this.frustum = f;
    this.camera.left = -f.width / 2; this.camera.right = f.width / 2; this.camera.top = f.height / 2; this.camera.bottom = -f.height / 2;
    this.camera.updateProjectionMatrix();

    const key = `${this.stage.stageIndex}|${this.stage.seed}|${cal.pad}|${cal.range}|${this.contrast}|${this.quality}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      const pal = paletteFor(this.stage.spec.theme);
      this.rebuild(cal);
      this.hemi.color.setHex(this.contrast ? 0xffffff : pal.hemiSky); this.hemi.groundColor.setHex(this.contrast ? 0x808080 : pal.hemiGround); this.hemi.intensity = this.contrast ? 1.6 : pal.hemiI;
      this.sun.color.setHex(this.contrast ? 0xffffff : pal.sun); this.sun.intensity = this.contrast ? 0.6 : pal.sunI;
      this.renderer.toneMappingExposure = pal.exposure;
      if (!this.contrast) this.scene.background = new THREE.Color(pal.skyBottom);
    }
    this.updateGrid(cal);

    const total = floor.total;
    const cur = Math.min(floor.current, total);
    const finished = floor.current >= total;

    // events: completion pulse, cue replay
    const targetZ = rowZ(cur);
    if (this.lastCurrent >= 0 && floor.current > this.lastCurrent) {
      const idx = Math.min(this.lastCurrent, total - 1);
      const done = floor.outcomes[idx];
      const obj = this.stage.objectives[idx];
      const px = obj.kind === "region" && obj.target !== null ? regionX(obj.target, cal) : 0;
      if (done !== "s") {
        if (!reduced) { this.pulse(px, rowZ(idx), padRadius(cal), this.colors.glow); this.sparkles.spawn(px, 1.2, rowZ(idx)); }
        else this.pulse(px, rowZ(idx), padRadius(cal), this.colors.glow, true);
      }
    }
    if (finished && this.lastLifecycle !== state.lifecycle && (state.lifecycle === "stage-complete" || state.lifecycle === "completed") && !reduced) {
      for (let i = 0; i < 3; i++) this.sparkles.spawn((i - 1) * padRadius(cal) * 1.4, 1.4, rowZ(total));
    }
    if (floor.cueSeq !== this.lastCue) { if (this.lastCue !== -1) this.cueFlash = 1.6; this.lastCue = floor.cueSeq; }
    this.lastCurrent = floor.current; this.lastLifecycle = state.lifecycle;
    this.cueFlash = Math.max(0, this.cueFlash - dt);

    // progress + camera
    this.prog = damp(this.prog, cur, reduced ? 30 : 2.6, dt);
    const cz = cameraZ(this.prog, f);
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0, 30, cz);
    this.camera.lookAt(0, 0, cz);
    this.sun.position.set(-9, 22, cz + 8);
    this.sun.target.position.set(0, 0, cz);
    const sc = this.sun.shadow.camera;
    const sw = f.width * 0.75, sh = f.height * 0.85;
    if (sc.right !== sw || sc.top !== sh) { sc.left = -sw; sc.right = sw; sc.top = sh; sc.bottom = -sh; sc.near = 1; sc.far = 70; sc.updateProjectionMatrix(); }

    // rows
    const pulse = reduced ? 0 : Math.sin(this.t * 2.4) * 0.5 + 0.5;
    for (const row of this.rows) {
      const rel = row.index - cur;
      const visible = rel >= -ROWS_BEHIND && rel <= ROWS_AHEAD && !(finished && rel < -1);
      row.group.visible = visible;
      if (!visible) continue;
      const obj = this.stage.objectives[row.index];
      const outcome = floor.outcomes[row.index] ?? ".";
      for (const pad of row.pads) this.stylePad(pad, obj, outcome, rel, pulse, floor.region, cal.guidance, reduced, dt);
    }

    // avatar
    const wantX = finished ? 0 : regionX(floor.region, cal);
    const wantZ = finished ? rowZ(total) : targetZ;
    const px = this.ax, pz = this.az;
    const rate = reduced ? 30 : 3.4;
    this.ax = damp(this.ax, wantX, rate, dt); this.az = damp(this.az, wantZ, rate, dt);
    const vx = (this.ax - px) / dt, vz = (this.az - pz) / dt, speed = Math.hypot(vx, vz);
    if (speed > 0.25) this.ayaw = damp(this.ayaw, Math.atan2(-vx, -vz), 8, dt);
    else this.ayaw = damp(this.ayaw, 0, 3, dt);
    const celebrate = finished && !reduced ? Math.abs(Math.sin(this.t * 3)) * 0.18 : 0;
    this.avatar.position.set(this.ax, celebrate, this.az);
    this.avatar.rotation.y = this.ayaw;
    if (this.avatarParts) {
      const walk = reduced ? 0 : Math.min(1, speed / 3);
      this.avatarParts.feet.forEach((fo, i) => { fo.position.z = -0.5 + Math.sin(this.t * 9 + i * Math.PI) * 0.22 * walk; });
      this.avatarParts.body.position.y = reduced ? 0 : Math.sin(this.t * 2) * 0.012 + Math.abs(Math.sin(this.t * 9)) * 0.05 * walk;
    }

    // guidance dots: a soft dotted path from the child to the lit region
    this.updateDots(floor, cal, finished, reduced, dt);
    // pulse rings
    for (const p of this.pulseRings) {
      if (p.age >= 1.1) { p.mesh.visible = false; continue; }
      p.age += dt;
      const k = Math.min(1, p.age / 1.1);
      p.mesh.visible = true;
      p.mesh.position.set(p.x, 0.3, p.z);
      const s = p.r * (reduced ? 1.35 : 1 + k * 0.9);
      p.mesh.scale.set(s, 1, s);
      p.mat.opacity = (reduced ? 0.6 : 0.85) * (1 - k);
    }
    this.sparkles.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.frames++;
  }

  private pulse(x: number, z: number, r: number, color: number, still = false): void {
    const p = this.pulseRings.find((q) => q.age >= 1.1) ?? this.pulseRings[0];
    if (!p) return;
    p.age = still ? 0.3 : 0; p.x = x; p.z = z; p.r = r; p.mat.color.setHex(color);
  }

  private stylePad(pad: Pad, obj: FloorObjective, outcome: string, rel: number, pulse: number, childRegion: Lane, guidance: boolean, reduced: boolean, dt: number): void {
    const c = this.colors;
    const isCurrent = rel === 0;
    const targeted = obj.kind === "region" && obj.target === pad.region;
    const centre = pad.region === 0;
    let color = c.idle, emissive = 0, scale = 1, opacity = 1, icon: IconName | null = null, rim = c.rim, rimOpacity = 0.55, glow = 0;
    const iconColor = c.icon;
    if (rel < 0) { // already visited: only the pad that was used remains, as a small badge
      const usedRegion = obj.kind === "region" ? obj.target : 0;
      const show = pad.region === usedRegion;
      opacity = show ? 0.9 : 0;
      scale = show ? 0.62 : 0.4;
      color = outcome === "s" ? c.skipped : c.done; icon = outcome === "s" ? "skip" : outcome === "r" ? "rest" : "done"; rimOpacity = 0.6;
    } else if (isCurrent) {
      if (obj.kind === "region") {
        if (targeted) { color = c.target; emissive = 0.5 + pulse * 0.35; scale = 1 + pulse * 0.035; icon = pad.region < 0 ? "left" : pad.region > 0 ? "right" : "centre"; rim = c.rim; rimOpacity = 1; glow = 0.55 + pulse * 0.25 + (this.cueFlash > 0 ? 0.3 : 0); }
        else { opacity = guidance ? 0.82 : 0.9; icon = null; }
      } else if (obj.kind === "step") {
        if (centre) { color = c.step; emissive = 0.4 + pulse * 0.3; scale = 1 + pulse * 0.04; icon = "step"; rimOpacity = 1; glow = 0.5 + pulse * 0.2; }
        else opacity = 0.55;
      } else { // rest: everything calm, a moon on the centre
        if (centre) { color = c.rest; emissive = 0.3 + pulse * 0.15; icon = "rest"; rimOpacity = 1; glow = 0.4; }
        else opacity = 0.5;
      }
      if (this.cueFlash > 0 && (targeted || (centre && obj.kind !== "region"))) { glow = Math.max(glow, 0.9); scale *= reduced ? 1.04 : 1 + 0.06 * Math.sin(this.cueFlash * 9); }
      if (childRegion === pad.region && !targeted && obj.kind === "region") { rimOpacity = 0.95; } // where the child currently is
    } else { // ahead: a calm preview of the next waypoints only
      const near = rel <= 2;
      if (!near) opacity = 0;
      const lit = obj.kind === "region" ? targeted : obj.kind === "step" ? centre : centre;
      opacity = near ? (lit ? 0.62 - rel * 0.1 : 0.22) : 0;
      color = lit ? (obj.kind === "step" ? c.step : obj.kind === "rest" ? c.rest : c.target) : c.idle;
      scale = lit ? 0.82 : 0.7;
      icon = lit ? (obj.kind === "region" ? (pad.region < 0 ? "left" : pad.region > 0 ? "right" : "centre") : obj.kind === "step" ? "step" : "rest") : null;
      rimOpacity = lit ? 0.5 : 0.2;
    }
    pad.scale = damp(pad.scale, scale, reduced ? 40 : 6, dt);
    pad.opacity = damp(pad.opacity, opacity, reduced ? 40 : 6, dt);
    pad.group.visible = pad.opacity > 0.02;
    pad.group.scale.set(pad.scale, 1, pad.scale);
    pad.discMat.color.setHex(color);
    pad.discMat.emissive.setHex(emissive > 0 ? (this.contrast || color !== c.target ? color : c.targetEmissive) : 0x000000);
    pad.discMat.emissiveIntensity = this.contrast ? Math.min(0.6, emissive) : emissive;
    pad.discMat.opacity = Math.min(1, pad.opacity);
    pad.rimMat.color.setHex(rim); pad.rimMat.opacity = rimOpacity * Math.min(1, pad.opacity * 1.2);
    pad.glowMat.opacity = glow * Math.min(1, pad.opacity);
    pad.glow.visible = glow > 0.01;
    pad.icon.visible = icon !== null;
    if (icon) { pad.iconMat.map = this.icons[icon]; pad.iconMat.color.setHex(iconColor); pad.iconMat.opacity = Math.min(1, pad.opacity + 0.15); pad.iconMat.needsUpdate = false; }
  }

  private updateDots(floor: NonNullable<DisplayState["floor"]>, cal: FloorCalibration, finished: boolean, reduced: boolean, dt: number): void {
    if (!this.dots || !this.dotMat) return;
    const obj = this.stage!.objectives[Math.min(floor.current, this.stage!.objectives.length - 1)];
    const show = cal.guidance && !finished && obj.kind === "region" && obj.target !== null && obj.target !== floor.region;
    this.dotMat.opacity = damp(this.dotMat.opacity, show ? 0.75 : 0, 6, dt);
    this.dots.visible = this.dotMat.opacity > 0.02;
    if (!this.dots.visible) return;
    const x0 = this.ax, z0 = this.az, x1 = regionX(obj.target!, cal), z1 = rowZ(floor.current);
    const m = new THREE.Matrix4();
    const n = 6, off = reduced ? 0 : (this.t * 0.9) % 1;
    for (let i = 0; i < n; i++) {
      const k = ((i + off) / n);
      const s = 0.55 + 0.45 * Math.sin(Math.PI * k);
      m.compose(new THREE.Vector3(x0 + (x1 - x0) * k, 0, z0 + (z1 - z0) * k), new THREE.Quaternion(), new THREE.Vector3(s, 1, s));
      this.dots.setMatrixAt(i, m);
    }
    this.dots.instanceMatrix.needsUpdate = true;
  }

  private trackFrame(ms: number): void {
    if (ms > 1000) return;
    this.frameMs.push(ms);
    if (this.frameMs.length > 240) this.frameMs.shift();
    if (this.opts.autoQuality && this.frameMs.length >= 120) {
      const avg = this.frameMs.slice(-120).reduce((a, b) => a + b, 0) / 120;
      this.slowRun = avg > 27 ? this.slowRun + 1 : 0;
      if (this.slowRun > 90) {
        this.slowRun = 0;
        const i = QUALITY_ORDER.indexOf(this.quality);
        if (i > 0) { this.frameMs = []; this.setQuality(QUALITY_ORDER[i - 1]); }
      }
    }
  }

  stats(): SceneStats {
    const f = this.frameMs;
    const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
    const info = this.renderer.info;
    return {
      fps: avg ? 1000 / avg : 0, frameMsAvg: avg, frameMsMax: f.length ? Math.max(...f) : 0,
      drawCalls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures,
      quality: this.quality, pixelRatio: this.renderer.getPixelRatio(), shadows: this.renderer.shadowMap.enabled, assetLoadMs: this.assetLoadMs, frames: this.frames,
    };
  }
  resetFrameStats(): void { this.frameMs = []; }
  resourceCounts() { const a = this.own.counts(), b = this.stageOwn.counts(); return { geometries: a.geometries + b.geometries, materials: a.materials + b.materials, textures: a.textures + b.textures }; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.scene.traverse((o) => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    while (this.grid.children.length) { const c = this.grid.children[0] as THREE.Mesh; this.grid.remove(c); c.geometry?.dispose(); (c.material as THREE.Material)?.dispose(); }
    this.stageOwn.disposeAll();
    this.own.disposeAll();
    this.scene.clear();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
