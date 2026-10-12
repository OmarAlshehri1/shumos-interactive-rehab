import * as THREE from "three";
import { LANE_WIDTH } from "@/lib/runnerquest3d/types";
import { hashSeed, mulberry32 } from "@/lib/runnerquest3d/rng";
import type { Own } from "./own";
import type { Palette } from "./palette";
import { dashTexture, glowTexture, grassTexture, pathTexture, skyTexture } from "./textures";
import type { QualityPreset } from "./types";

const CELL = 2.5;
export const PATH_HALF = LANE_WIDTH * 1.5 + 0.35;

interface CellInfo {
  treeL?: { x: number; s: number; kind: number; tint: number }; treeR?: { x: number; s: number; kind: number; tint: number };
  bushL?: { x: number; s: number; tint: number }; bushR?: { x: number; s: number; tint: number };
  flowers: { x: number; z: number; color: number; s: number }[];
  rock?: { x: number; s: number; r: number };
  fence: boolean;
}
const FLOWER_COLORS = [0xff7aa8, 0xffd23f, 0xffffff, 0xb28cff, 0xff9a4d];
function cellInfo(c: number): CellInfo {
  const r = mulberry32(hashSeed("cell", c));
  const info: CellInfo = { flowers: [], fence: c % 2 === 0 };
  if (r() < 0.62) info.treeL = { x: -(7.5 + r() * 15), s: 0.85 + r() * 0.8, kind: r() < 0.38 ? 1 : 0, tint: r() };
  if (r() < 0.62) info.treeR = { x: 7.5 + r() * 15, s: 0.85 + r() * 0.8, kind: r() < 0.38 ? 1 : 0, tint: r() };
  if (r() < 0.5) info.bushL = { x: -(PATH_HALF + 1.1 + r() * 2.2), s: 0.6 + r() * 0.6, tint: r() };
  if (r() < 0.5) info.bushR = { x: PATH_HALF + 1.1 + r() * 2.2, s: 0.6 + r() * 0.6, tint: r() };
  if (r() < 0.8) {
    const side = r() < 0.5 ? -1 : 1, cx = side * (PATH_HALF + 0.9 + r() * 5), color = FLOWER_COLORS[Math.floor(r() * FLOWER_COLORS.length)];
    for (let i = 0; i < 4; i++) info.flowers.push({ x: cx + (r() - 0.5) * 1.3, z: (r() - 0.5) * 2, color, s: 0.7 + r() * 0.6 });
  }
  if (r() < 0.22) info.rock = { x: (r() < 0.5 ? -1 : 1) * (PATH_HALF + 1.5 + r() * 9), s: 0.4 + r() * 0.8, r: r() * 6 };
  return info;
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);

/** Ground, path, lane regions, sky, hills, clouds, landmarks, scenery instancing, particles. */
export class World {
  readonly root = new THREE.Group();
  readonly backdrop = new THREE.Group(); // follows camera (hills/clouds/landmarks)
  private own: Own;
  private q: QualityPreset;
  private reduced = false;
  private ground!: THREE.Mesh;
  private pathMesh!: THREE.Mesh;
  private groundTex!: THREE.CanvasTexture;
  private pathTex!: THREE.CanvasTexture;
  private lanes: THREE.Mesh[] = [];
  private dividers: THREE.Mesh[] = [];
  private edgeL!: THREE.Mesh;
  private edgeR!: THREE.Mesh;
  private skyTex?: THREE.CanvasTexture;
  private trunks!: THREE.InstancedMesh; private crowns!: THREE.InstancedMesh; private pineA!: THREE.InstancedMesh; private pineB!: THREE.InstancedMesh;
  private bushes!: THREE.InstancedMesh; private flowers!: THREE.InstancedMesh; private rocks!: THREE.InstancedMesh; private posts!: THREE.InstancedMesh; private rails!: THREE.InstancedMesh;
  private clouds: THREE.Group[] = [];
  private windmill!: THREE.Group; private blades!: THREE.Group;
  private particles?: THREE.Points;
  private particleBase: Float32Array = new Float32Array(0);
  private baseCell = Number.NaN;
  private palette!: Palette;
  private cells: number;
  private bridge?: THREE.Group;
  private water?: THREE.Mesh;
  private t = 0;

  constructor(own: Own, scene: THREE.Scene, q: QualityPreset) {
    this.own = own;
    this.q = q;
    this.cells = q.cells;
    scene.add(this.root, this.backdrop);
    this.buildStatic();
  }

  private buildStatic(): void {
    const own = this.own;
    this.groundTex = grassTexture(own, "#4fa84a", "#6cc15a");
    this.pathTex = pathTexture(own);
    const unit = own.geom(new THREE.PlaneGeometry(1, 1));
    unit.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(unit, own.mat(new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 1 })));
    this.ground.receiveShadow = true;
    this.pathMesh = new THREE.Mesh(unit, own.mat(new THREE.MeshStandardMaterial({ map: this.pathTex, roughness: 0.95 })));
    this.pathMesh.receiveShadow = true;
    this.pathMesh.position.y = 0.01;
    this.root.add(this.ground, this.pathMesh);

    const tints = [0x69b7ff, 0x7be0a0, 0xffbf73];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(unit, own.mat(new THREE.MeshBasicMaterial({ color: tints[i], transparent: true, opacity: 0.16, depthWrite: false })));
      m.position.set((i - 1) * LANE_WIDTH, 0.02, 0);
      this.lanes.push(m); this.root.add(m);
    }
    const dash = dashTexture(own);
    for (const x of [-LANE_WIDTH / 2, LANE_WIDTH / 2]) {
      const m = new THREE.Mesh(unit, own.mat(new THREE.MeshBasicMaterial({ map: dash, transparent: true, opacity: 0.55, depthWrite: false })));
      m.position.set(x, 0.025, 0);
      this.dividers.push(m); this.root.add(m);
    }
    const curb = own.mat(new THREE.MeshStandardMaterial({ color: 0xbfb4a0, roughness: 0.9 }));
    const curbG = own.geom(new THREE.BoxGeometry(0.34, 0.16, 1));
    this.edgeL = new THREE.Mesh(curbG, curb); this.edgeR = new THREE.Mesh(curbG, curb);
    this.edgeL.position.set(-PATH_HALF - 0.1, 0.08, 0); this.edgeR.position.set(PATH_HALF + 0.1, 0.08, 0);
    this.edgeL.receiveShadow = this.edgeR.receiveShadow = true;
    this.root.add(this.edgeL, this.edgeR);

    // Scenery instances.
    const N = this.cells;
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, count: number, cast: boolean) => {
      const im = new THREE.InstancedMesh(g, m, count);
      im.castShadow = cast; im.receiveShadow = false; im.frustumCulled = false; im.count = 0;
      this.root.add(im); return im;
    };
    const std = (c: number, rough = 0.85) => own.mat(new THREE.MeshStandardMaterial({ color: c, roughness: rough }));
    this.trunks = mk(own.geom(new THREE.CylinderGeometry(0.14, 0.22, 1.7, 7).translate(0, 0.85, 0)), std(0x7a5236), N * 2, true);
    this.crowns = mk(own.geom(new THREE.IcosahedronGeometry(1.15, 1).translate(0, 2.35, 0)), std(0xffffff), N * 2, true);
    this.pineA = mk(own.geom(new THREE.ConeGeometry(1.15, 1.9, 9).translate(0, 2.0, 0)), std(0xffffff), N * 2, true);
    this.pineB = mk(own.geom(new THREE.ConeGeometry(0.85, 1.7, 9).translate(0, 3.1, 0)), std(0xffffff), N * 2, true);
    this.bushes = mk(own.geom(new THREE.IcosahedronGeometry(0.6, 1).translate(0, 0.38, 0)), std(0xffffff), N * 2, false);
    this.flowers = mk(own.geom(new THREE.SphereGeometry(0.12, 7, 5).translate(0, 0.28, 0)), std(0xffffff, 0.6), N * 4, false);
    this.rocks = mk(own.geom(new THREE.DodecahedronGeometry(0.5, 0).translate(0, 0.2, 0)), std(0x9a9a92, 0.95), N, true);
    this.posts = mk(own.geom(new THREE.BoxGeometry(0.13, 0.95, 0.13).translate(0, 0.47, 0)), std(0xa57a52), N * 2, true);
    this.rails = mk(own.geom(new THREE.BoxGeometry(CELL * 2, 0.07, 0.06)), std(0xb98c5f), N * 4, false);

    // Hills (backdrop; parallax follows camera).
    const hillMat = (c: number) => own.mat(new THREE.MeshStandardMaterial({ color: c, roughness: 1, fog: true }));
    const hillGeo = own.geom(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2));
    const rh = mulberry32(404);
    for (let i = 0; i < 22; i++) {
      const far = i % 3 === 0 ? 1 : 0;
      const m = new THREE.Mesh(hillGeo, hillMat(far ? 0x8cc4a8 : 0x5fae67));
      m.name = `hill${far}`; m.userData.far = far;
      const x = -330 + (i / 21) * 660 + (rh() - 0.5) * 30;
      m.position.set(x, -1, -175 - rh() * 60 - far * 40);
      m.scale.set(46 + rh() * 50, 12 + rh() * 20 + far * 6, 50 + rh() * 40);
      m.rotation.y = rh() * 3;
      this.backdrop.add(m);
    }
    // Windmill landmark.
    this.windmill = new THREE.Group();
    const wm = std(0xf4ead8, 0.8), roof = std(0xc4553b, 0.7), wood = std(0x8a5a36);
    const tower = new THREE.Mesh(own.geom(new THREE.CylinderGeometry(2.2, 3.4, 11, 12).translate(0, 5.5, 0)), wm);
    const cap = new THREE.Mesh(own.geom(new THREE.ConeGeometry(3, 3.2, 12).translate(0, 12.6, 0)), roof);
    this.blades = new THREE.Group(); this.blades.position.set(0, 10.4, -2.7);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(own.geom(new THREE.BoxGeometry(1.1, 9.5, 0.2).translate(0, 4.9, 0)), wood);
      b.rotation.z = (i * Math.PI) / 2; this.blades.add(b);
    }
    this.windmill.add(tower, cap, this.blades);
    this.windmill.position.set(-58, 3, -140); this.windmill.scale.setScalar(1.25);
    this.backdrop.add(this.windmill);
    // Clouds.
    const cloudMat = own.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false }));
    const cloudGeo = own.geom(new THREE.SphereGeometry(1, 14, 10));
    const r = mulberry32(77);
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const s = new THREE.Mesh(cloudGeo, cloudMat);
        s.position.set((k - n / 2) * 5 + r() * 2, r() * 2, r() * 3); const sc = 4 + r() * 4; s.scale.set(sc * 1.4, sc * 0.75, sc);
        g.add(s);
      }
      g.position.set(-190 + i * 48 + r() * 20, 62 + r() * 22, -210 - r() * 90);
      g.userData.speed = 0.4 + r() * 0.5;
      this.clouds.push(g); this.backdrop.add(g);
    }
    // Particles (pollen / butterflies as soft glow points).
    if (this.q.particles > 0) {
      const n = this.q.particles;
      const pos = new Float32Array(n * 3), base = new Float32Array(n * 3);
      const rp = mulberry32(3);
      for (let i = 0; i < n; i++) { base[i * 3] = (rp() - 0.5) * 30; base[i * 3 + 1] = 0.6 + rp() * 4.5; base[i * 3 + 2] = -rp() * 55; }
      this.particleBase = base;
      const geo = own.geom(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.particles = new THREE.Points(geo, own.mat(new THREE.PointsMaterial({ size: 0.22, map: glowTexture(own), color: 0xfff1b0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));
      this.particles.frustumCulled = false;
      this.root.add(this.particles);
    }
  }

  /** Applies a stage palette and length. */
  setStage(p: Palette, length: number, reducedMotion: boolean, bridgeAt: number[]): void {
    this.palette = p; this.reduced = reducedMotion;
    const own = this.own;
    const len = length + 320, zMid = 90 - len / 2;
    this.own.drop(this.groundTex); // regenerate with palette
    this.groundTex = grassTexture(own, p.grassA, p.grassB);
    (this.ground.material as THREE.MeshStandardMaterial).map = this.groundTex;
    (this.ground.material as THREE.MeshStandardMaterial).needsUpdate = true;
    this.groundTex.repeat.set(60, len / 8);
    this.ground.scale.set(480, 1, len); this.ground.position.set(0, 0, zMid);
    this.pathTex.repeat.set(2.4, len / 3);
    this.pathMesh.scale.set(PATH_HALF * 2, 1, len); this.pathMesh.position.set(0, 0.01, zMid);
    this.lanes.forEach((m) => { m.scale.set(LANE_WIDTH - 0.16, 1, len); m.position.z = zMid; });
    const dashTex = (this.dividers[0].material as THREE.MeshBasicMaterial).map!;
    dashTex.repeat.set(1, len / 3);
    this.dividers.forEach((m) => { m.scale.set(0.16, 1, len); m.position.z = zMid; });
    this.edgeL.scale.set(1, 1, len); this.edgeR.scale.set(1, 1, len); this.edgeL.position.z = this.edgeR.position.z = zMid;
    // Sky + fog set by the scene (needs scene ref); backdrop hill colours:
    this.backdrop.children.forEach((c) => {
      if (c instanceof THREE.Mesh && c.name.startsWith("hill")) (c.material as THREE.MeshStandardMaterial).color.setHex(c.userData.far ? p.hillFar : p.hill);
    });
    this.own.drop(this.skyTex);
    this.skyTex = skyTexture(own, p.skyTop, p.skyBottom);
    // Bridges (visual landmarks), one pooled group.
    this.buildBridges(bridgeAt, p);
    this.baseCell = Number.NaN;
  }

  skyTexture(): THREE.Texture { return this.skyTex!; }

  private bridgeRes: Array<THREE.BufferGeometry | THREE.Material> = [];

  private buildBridges(zs: number[], p: Palette): void {
    if (this.bridge) { this.root.remove(this.bridge); this.bridge = undefined; }
    this.bridgeRes.forEach((r) => this.own.release(r));
    this.bridgeRes = [];
    const g = new THREE.Group();
    const mat = <T extends THREE.Material>(m: T) => { this.bridgeRes.push(this.own.mat(m)); return m; };
    const geo = <T extends THREE.BufferGeometry>(x: T) => { this.bridgeRes.push(this.own.geom(x)); return x; };
    const wood = mat(new THREE.MeshStandardMaterial({ color: 0xb2814f, roughness: 0.85 }));
    const woodD = mat(new THREE.MeshStandardMaterial({ color: 0x8b5f38, roughness: 0.9 }));
    const water = mat(new THREE.MeshStandardMaterial({ color: p.water, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }));
    const planksG = geo(new THREE.BoxGeometry(PATH_HALF * 2 + 0.4, 0.14, 0.34)), railG = geo(new THREE.BoxGeometry(0.14, 0.14, 11)), postG = geo(new THREE.BoxGeometry(0.18, 1.0, 0.18)), waterG = geo(new THREE.PlaneGeometry(400, 16).rotateX(-Math.PI / 2));
    for (const z of zs) {
      const w = new THREE.Mesh(waterG, water); w.position.set(0, 0.05, z); w.receiveShadow = true; g.add(w);
      for (let i = 0; i < 28; i++) { const pl = new THREE.Mesh(planksG, i % 2 ? wood : woodD); pl.position.set(0, 0.2, z - 6.2 + i * 0.44); pl.castShadow = true; pl.receiveShadow = true; g.add(pl); }
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(railG, wood); rail.position.set(sx * (PATH_HALF + 0.15), 0.95, z); rail.castShadow = true; g.add(rail);
        for (let k = -2; k <= 2; k++) { const po = new THREE.Mesh(postG, woodD); po.position.set(sx * (PATH_HALF + 0.15), 0.6, z + k * 2.4); po.castShadow = true; g.add(po); }
      }
    }
    this.root.add(g); this.bridge = g;
  }

  setReduced(v: boolean): void { this.reduced = v; }

  private rebuildScenery(base: number): void {
    const p = this.palette;
    let nt = 0, nc = 0, npa = 0, nb = 0, nf = 0, nr = 0, np = 0, nrl = 0;
    const put = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, rotY: number, color?: THREE.Color) => {
      tmpQ.setFromAxisAngle(UP, rotY); tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(sx, sy, sx)); im.setMatrixAt(i, tmpM);
      if (color) im.setColorAt(i, color);
    };
    const crown = new THREE.Color(p.crown), pine = new THREE.Color(p.pine);
    for (let k = 0; k < this.cells; k++) {
      const c = base + k, z = -c * CELL, info = cellInfo(c);
      for (const t of [info.treeL, info.treeR]) {
        if (!t) continue;
        const rot = t.tint * 6;
        put(this.trunks, nt++, t.x, 0, z, t.s * 0.9, t.s, rot);
        if (t.kind === 0) { tmpC.copy(crown).offsetHSL((t.tint - 0.5) * 0.06, 0, (t.tint - 0.5) * 0.12); put(this.crowns, nc++, t.x, 0, z, t.s, t.s * 0.95, rot, tmpC); }
        else { tmpC.copy(pine).offsetHSL((t.tint - 0.5) * 0.04, 0, (t.tint - 0.5) * 0.1); put(this.pineA, npa, t.x, 0, z, t.s, t.s, rot, tmpC); put(this.pineB, npa, t.x, 0, z, t.s, t.s, rot, tmpC); npa++; }
      }
      for (const b of [info.bushL, info.bushR]) if (b) { tmpC.copy(crown).offsetHSL(0.02, 0.05, (b.tint - 0.5) * 0.14 - 0.02); put(this.bushes, nb++, b.x, 0, z + (b.tint - 0.5) * 2, b.s * 1.3, b.s, b.tint * 6, tmpC); }
      for (const f of info.flowers) { tmpC.setHex(f.color); put(this.flowers, nf++, f.x, 0, z + f.z, f.s, f.s, 0, tmpC); }
      if (info.rock) { tmpC.setHex(0x9a9a92).offsetHSL(0, 0, (info.rock.r / 6 - 0.5) * 0.1); put(this.rocks, nr++, info.rock.x, 0, z, info.rock.s * 1.3, info.rock.s, info.rock.r, tmpC); }
      if (info.fence) {
        for (const sx of [-1, 1]) {
          const x = sx * (PATH_HALF + 0.75);
          put(this.posts, np++, x, 0, z, 1, 1, 0);
          tmpQ.setFromAxisAngle(UP, Math.PI / 2);
          for (const y of [0.35, 0.72]) { tmpM.compose(tmpV.set(x, y, z - CELL), tmpQ, tmpS.set(1, 1, 1)); this.rails.setMatrixAt(nrl++, tmpM); }
        }
      }
    }
    const done = (im: THREE.InstancedMesh, n: number) => { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; };
    done(this.trunks, nt); done(this.crowns, nc); done(this.pineA, npa); done(this.pineB, npa); done(this.bushes, nb); done(this.flowers, nf); done(this.rocks, nr); done(this.posts, np); done(this.rails, nrl);
  }

  /** Called every frame with the runner's world z (negative forward) and camera position. */
  update(dt: number, distance: number, camPos: THREE.Vector3): void {
    this.t += dt;
    const cell = Math.floor(distance / CELL) - 10;
    if (cell !== this.baseCell && this.palette) { this.baseCell = cell; this.rebuildScenery(cell); }
    // Backdrop rides with the camera with slight parallax so hills feel far away.
    this.backdrop.position.set(camPos.x * 0.85, 0, camPos.z);
    if (!this.reduced) {
      this.blades.rotation.z -= dt * 0.35;
      for (const c of this.clouds) { c.position.x += c.userData.speed * dt * 0.9; if (c.position.x > 260) c.position.x = -260; }
    }
    if (this.particles) {
      const a = this.particles.geometry.attributes.position as THREE.BufferAttribute;
      const show = !this.reduced;
      this.particles.visible = show;
      if (show) {
        const n = this.particleBase.length / 3;
        for (let i = 0; i < n; i++) {
          let z = this.particleBase[i * 3 + 2] + 10; // relative window ahead of the runner
          z = ((z - (distance % 55)) % 55 + 55) % 55 - 45;
          a.setXYZ(i, this.particleBase[i * 3] + Math.sin(this.t * 0.6 + i) * 0.6, this.particleBase[i * 3 + 1] + Math.sin(this.t * 0.9 + i * 1.7) * 0.35, -distance + z);
        }
        a.needsUpdate = true;
      }
    }
  }
}
