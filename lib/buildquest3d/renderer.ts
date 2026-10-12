import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CAMERA, STAGES, unproject, type Piece, type Vec3 } from "./stages";
import type { State } from "./gameplay";

export interface Metrics {
  fps: number;
  frameMs: number;
  frameP95Ms: number;
  frameMaxMs: number;
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  frames: number;
}
/** Renderer consumes accepted state only; no selection, placement or scoring callbacks. */
export class Workshop {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(
    -CAMERA.width / 2,
    CAMERA.width / 2,
    CAMERA.height / 2,
    -CAMERA.height / 2,
    0.1,
    100,
  );
  private assembly = new THREE.Group();
  private pieces = new Map<string, THREE.Group>();
  private ghosts = new Map<string, THREE.Group>();
  private cursor = new THREE.Group();
  private stage = -1;
  private frame = 0;
  private timer = 0;
  private frameTimes: number[] = [];
  private environment: THREE.WebGLRenderTarget;
  private woodTexture: THREE.CanvasTexture;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private lastRun = -1;
  private reward = new THREE.Group();
  private rewardTime = 0;
  private wasComplete = false;
  metrics: Metrics = {
    fps: 0,
    frameMs: 0,
    frameP95Ms: 0,
    frameMaxMs: 0,
    triangles: 0,
    drawCalls: 0,
    geometries: 0,
    textures: 0,
    frames: 0,
  };
  constructor(
    private canvas: HTMLCanvasElement,
    quality: "high" | "low" = "high",
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality === "high",
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, quality === "high" ? 1.6 : 1),
    );
    this.renderer.shadowMap.enabled = quality === "high";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.scene.background = new THREE.Color("#e7eeea");
    this.scene.fog = new THREE.Fog("#e7eeea", 30, 60);
    this.camera.position.set(0, 14, 16);
    this.camera.lookAt(0, 0, 0);
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.55;
    room.dispose();
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xf7fcff, 0xc3b299, 0.7));
    const key = new THREE.DirectionalLight(0xfff0de, 2.2);
    key.position.set(-4, 13, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.0003;
    key.shadow.radius = 4;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xb2d7e7, 0.8);
    fill.position.set(9, 6, -6);
    this.scene.add(fill);
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 512;
    textureCanvas.height = 256;
    const ctx = textureCanvas.getContext("2d")!;
    ctx.fillStyle = "#f0dfc1";
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 85; i++) {
      ctx.strokeStyle = `rgba(124,84,40,${0.025 + (i % 4) * 0.008})`;
      ctx.lineWidth = 0.4 + (i % 3) * 0.3;
      ctx.beginPath();
      for (let x = 0; x <= 512; x += 8) {
        const y = i * 3.1 + Math.sin(x * 0.014 + i * 0.61) * 1.5;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    this.woodTexture = new THREE.CanvasTexture(textureCanvas);
    this.woodTexture.colorSpace = THREE.SRGBColorSpace;
    this.woodTexture.wrapS = this.woodTexture.wrapT = THREE.RepeatWrapping;
    this.woodTexture.repeat.set(2, 2);
    const wood = this.material("#c8a780", 0.46, 0.05);
    wood.map = this.woodTexture;
    this.mesh(
      new RoundedBoxGeometry(16.5, 0.45, 9, 5, 0.15),
      wood,
      [0, -0.25, 0],
      this.scene,
    );
    this.mesh(
      new RoundedBoxGeometry(16.6, 0.15, 9.1, 4, 0.06),
      this.material("#ad8765", 0.65),
      [0, -0.52, 0],
      this.scene,
    );
    const floor = this.mesh(
      new THREE.PlaneGeometry(200, 200),
      this.material("#dbe4de", 0.9),
      [0, -2.8, 0],
      this.scene,
    );
    floor.rotation.x = -Math.PI / 2;
    for (const x of [-7.1, 7.1])
      for (const z of [-3.3, 3.3])
        this.mesh(
          new RoundedBoxGeometry(0.3, 2.3, 0.3, 3, 0.06),
          this.material("#56706b", 0.45, 0.4),
          [x, -1.7, z],
          this.scene,
        );
    // Inlaid work mats and quiet workbench detailing, never interactive clutter.
    this.mesh(
      new RoundedBoxGeometry(7.2, 0.12, 7.2, 5, 0.16),
      this.material("#5c7d78", 0.85),
      [-3.9, 0.05, 0],
      this.scene,
    );
    this.mesh(
      new RoundedBoxGeometry(5.9, 0.12, 7.2, 5, 0.16),
      this.material("#ece5d6", 0.9),
      [3.9, 0.05, 0],
      this.scene,
    );
    for (let i = 0; i < 5; i++)
      this.mesh(
        new RoundedBoxGeometry(0.012, 0.012, 8.7, 1, 0.004),
        this.material("#b39472", 0.9),
        [-1 + i * 0.055, -0.014, 0],
        this.scene,
      );
    for (const x of [-7.6, 7.6])
      for (const z of [-3.9, 3.9]) {
        const m = this.mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 0.012, 16),
          this.material("#9a9885", 0.3, 0.7),
          [x, -0.014, z],
          this.scene,
        );
        m.castShadow = false;
      }
    // Pencil tray behind the board.
    this.mesh(
      new RoundedBoxGeometry(2.2, 0.18, 0.7, 4, 0.08),
      this.material("#7c9d97"),
      [5.5, 0.12, -4],
      this.scene,
    );
    for (let i = 0; i < 3; i++) {
      const pencil = this.mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 1.5, 12),
        this.material(["#e4b863", "#ed8675", "#7c9eae"][i]),
        [5.5, 0.27, -4.2 + i * 0.15],
        this.scene,
      );
      pencil.rotation.z = Math.PI / 2;
    }
    this.scene.add(this.assembly);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.29, 0.035, 12, 48),
      new THREE.MeshBasicMaterial({ color: "#fffaf0", depthTest: false }),
    );
    ring.renderOrder = 10;
    this.cursor.add(ring);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 12),
      new THREE.MeshBasicMaterial({ color: "#375f5a", depthTest: false }),
    );
    this.cursor.add(dot);
    this.scene.add(this.cursor);
    this.resize();
  }
  private material(color: string, roughness = 0.32, metalness = 0.12) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }
  private mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    at: Vec3,
    parent: THREE.Object3D,
  ) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(...at);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  private block(p: Piece, ghost = false): THREE.Group {
    const group = new THREE.Group(),
      [w, h, d] = p.size;
    let geometry: THREE.BufferGeometry;
    if (p.shape === "triangle-flat") {
      geometry = new THREE.ExtrudeGeometry(this.footprint(p), {
        depth: h,
        bevelEnabled: true,
        bevelSize: 0.045,
        bevelThickness: 0.035,
        bevelSegments: 3,
        steps: 1,
      });
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, -h / 2, 0);
    } else if (p.shape === "circle" || p.shape === "wheel")
      geometry = new THREE.CylinderGeometry(w / 2, w / 2, h, 48, 1);
    else if (p.shape === "triangle" || p.shape === "flag") {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, -h / 2);
      shape.lineTo(w / 2, -h / 2);
      shape.lineTo(0, h / 2);
      shape.closePath();
      geometry = new THREE.ExtrudeGeometry(shape, {
        depth: d,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.045,
        bevelThickness: 0.045,
      });
      geometry.translate(0, 0, -d / 2);
    } else
      geometry = new RoundedBoxGeometry(
        w,
        h,
        d,
        5,
        Math.min(0.09, w * 0.08, h * 0.08, d * 0.08),
      );
    const material = new THREE.MeshStandardMaterial({
      color: ghost ? "#dceee7" : p.color,
      roughness: ghost ? 0.8 : 0.29,
      metalness: 0.12,
      transparent: ghost,
      opacity: ghost ? 0.17 : 1,
      depthWrite: !ghost,
    });
    const mesh = this.mesh(geometry, material, [0, 0, 0], group);
    if (p.shape === "wheel") mesh.rotation.x = Math.PI / 2;
    if (ghost) {
      mesh.castShadow = false;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 25),
        new THREE.LineBasicMaterial({
          color: "#dceee7",
          transparent: true,
          opacity: 0.55,
        }),
      );
      edges.rotation.copy(mesh.rotation);
      group.add(edges);
    } else if (p.shape === "wheel") {
      const hub = this.mesh(
        new THREE.CylinderGeometry(w * 0.19, w * 0.19, h + 0.025, 24),
        this.material("#e9daba", 0.22, 0.6),
        [0, 0, 0],
        group,
      );
      hub.rotation.x = Math.PI / 2;
    }
    return group;
  }
  private footprint(p: Piece, padding = 0): THREE.Shape {
    const shape = new THREE.Shape(),
      w = p.size[0] + padding,
      d = p.size[2] + padding;
    if (p.shape === "circle") shape.absarc(0, 0, w / 2, 0, Math.PI * 2, false);
    else if (p.shape === "triangle-flat") {
      shape.moveTo(-w / 2, -d / 2);
      shape.lineTo(w / 2, -d / 2);
      shape.lineTo(0, d / 2);
      shape.closePath();
    } else {
      shape.moveTo(-w / 2, -d / 2);
      shape.lineTo(w / 2, -d / 2);
      shape.lineTo(w / 2, d / 2);
      shape.lineTo(-w / 2, d / 2);
      shape.closePath();
    }
    return shape;
  }
  /** Actual cutout geometry gives shape stages a recessed socket, with a fitted dark floor. */
  private socket(p: Piece) {
    const board = this.footprint({
      ...p,
      shape: "box",
      size: [p.size[0] + 0.55, 0.1, p.size[2] + 0.55],
    });
    const hole = this.footprint(p, 0.08);
    board.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(board, {
      depth: 0.13,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.02,
      bevelSegments: 2,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    this.mesh(
      geometry,
      this.material("#d4ddc5", 0.58),
      [p.target[0], 0.11, p.target[2]],
      this.assembly,
    );
    const floor = new THREE.ShapeGeometry(hole, 48);
    floor.rotateX(-Math.PI / 2);
    this.mesh(
      floor,
      this.material("#385950", 0.82),
      [p.target[0], 0.115, p.target[2]],
      this.assembly,
    );
  }
  private clearStage() {
    this.disposeTree(this.assembly);
    this.assembly.clear();
    this.pieces.clear();
    this.ghosts.clear();
    this.assembly.position.set(0, 0, 0);
    this.reward = new THREE.Group();
    this.rewardTime = 0;
    this.wasComplete = false;
  }
  private load(s: State) {
    this.clearStage();
    this.stage = s.stage;
    this.lastRun = s.run;
    for (const p of STAGES[s.stage].pieces) {
      const block = this.block(p);
      const scale = Math.min(
        1,
        1.85 / Math.max(p.size[0], p.size[2]),
        1.65 / p.size[1],
      );
      block.scale.setScalar(scale);
      block.position.set(...p.source);
      this.assembly.add(block);
      this.pieces.set(p.id, block);
      const ghost = this.block(p, true);
      ghost.position.set(...p.target);
      this.assembly.add(ghost);
      this.ghosts.set(p.id, ghost);
      if (STAGES[s.stage].kind === "shapes") this.socket(p);
    }
    this.decorate(STAGES[s.stage].kind);
    this.assembly.add(this.reward);
  }
  private decorate(kind: string) {
    const dark = this.material("#294c50", 0.35, 0.15),
      white = this.material("#f5f0e3", 0.42);
    const attach = (
      id: string,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      at: Vec3,
    ) => {
      const group = this.pieces.get(`${STAGES[this.stage].id}:${id}`);
      if (group) this.mesh(geometry, material, at, group);
    };
    if (kind === "house") {
      attach(
        "wall-right",
        new RoundedBoxGeometry(0.45, 0.95, 0.07, 3, 0.05),
        dark,
        [0, -0.34, 1.025],
      );
      attach(
        "wall-left",
        new RoundedBoxGeometry(0.62, 0.62, 0.07, 3, 0.04),
        white,
        [0, 0.16, 1.025],
      );
    }
    if (kind === "car") {
      attach(
        "cabin",
        new RoundedBoxGeometry(1.28, 0.62, 0.06, 3, 0.06),
        dark,
        [0, 0.06, 0.78],
      );
      for (const x of [-1.3, 1.3])
        attach("body", new THREE.SphereGeometry(0.12, 16, 12), white, [
          x,
          0.1,
          0.93,
        ]);
    }
    if (kind === "robot") {
      for (const x of [-0.32, 0.32])
        attach("head", new THREE.SphereGeometry(0.12, 16, 12), dark, [
          x,
          0.1,
          0.57,
        ]);
      attach(
        "head",
        new RoundedBoxGeometry(0.45, 0.065, 0.06, 3, 0.02),
        dark,
        [0, -0.24, 0.57],
      );
      attach(
        "body",
        new THREE.CylinderGeometry(0.2, 0.2, 0.04, 24),
        white,
        [0, 0, 0.63],
      );
    }
    if (kind === "castle") {
      for (const id of ["tower-left", "tower-right"])
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          attach(
            id,
            new RoundedBoxGeometry(0.25, 0.32, 0.25, 3, 0.04),
            this.material("#ebd99a"),
            [Math.sin(a) * 0.48, 1.39, Math.cos(a) * 0.48],
          );
        }
      attach(
        "wall",
        new RoundedBoxGeometry(0.75, 1.25, 0.07, 3, 0.22),
        dark,
        [0, -0.22, 0.44],
      );
      attach(
        "flag",
        new THREE.CylinderGeometry(0.045, 0.045, 1.8, 12),
        dark,
        [-0.6, -0.15, 0],
      );
    }
    if (kind === "bridge") {
      this.mesh(
        new RoundedBoxGeometry(0.62, 0.3, 0.43, 3, 0.07),
        this.material("#ec9b61"),
        [0, 0.18, 0],
        this.reward,
      );
      this.mesh(
        new RoundedBoxGeometry(0.32, 0.23, 0.37, 3, 0.05),
        dark,
        [0, 0.42, 0],
        this.reward,
      );
      for (const x of [-0.2, 0.2])
        for (const z of [-0.22, 0.22]) {
          const w = this.mesh(
            new THREE.CylinderGeometry(0.11, 0.11, 0.09, 16),
            dark,
            [x, 0.1, z],
            this.reward,
          );
          w.rotation.x = Math.PI / 2;
        }
      this.reward.visible = false;
    }
    if (kind === "tower" || kind === "castle" || kind === "house") {
      const glow = new THREE.Mesh(
        new THREE.TorusGeometry(kind === "tower" ? 1.8 : 2.9, 0.025, 8, 64),
        new THREE.MeshBasicMaterial({
          color: "#e5c76c",
          transparent: true,
          opacity: 0.65,
        }),
      );
      glow.rotation.x = Math.PI / 2;
      glow.position.set(-3.8, 0.14, 0.5);
      this.reward.add(glow);
      this.reward.visible = false;
    }
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  }
  render(s: State, dt: number, time: number) {
    if (s.stage !== this.stage || s.run !== this.lastRun) this.load(s);
    const complete = s.status === "complete",
      motion = !this.reduced && complete;
    if (complete && !this.wasComplete) this.rewardTime = time;
    this.wasComplete = complete;
    const rewardElapsed = Math.max(0, time - this.rewardTime),
      kind = STAGES[s.stage].kind;
    this.reward.visible = complete && kind !== "car" && kind !== "robot";
    if (kind === "bridge") {
      this.reward.position.set(
        this.reduced ? -3.8 : -5.7 + Math.min(1, rewardElapsed / 4) * 3.8,
        2.2,
        0.5,
      );
    }
    if (kind === "car")
      this.assembly.position.x = motion
        ? Math.sin((Math.min(rewardElapsed, 3) * Math.PI) / 3) * 0.35
        : 0;
    for (const p of STAGES[s.stage].pieces) {
      const block = this.pieces.get(p.id)!,
        ghost = this.ghosts.get(p.id)!;
      const placed = s.placed.includes(p.id),
        selected = s.selected === p.id;
      const target = placed
        ? p.target
        : selected
          ? unproject(s.pointer, 1.4)
          : p.source;
      const sourceScale = Math.min(
        1,
        1.85 / Math.max(p.size[0], p.size[2]),
        1.65 / p.size[1],
      );
      block.scale.lerp(
        new THREE.Vector3().setScalar(placed ? 1 : sourceScale),
        this.reduced ? 1 : 1 - Math.exp(-dt * 10),
      );
      const destination = new THREE.Vector3(...target);
      // Only visual interpolation; accepted state determines all endpoints.
      block.position.lerp(
        destination,
        this.reduced ? 1 : 1 - Math.exp(-dt * 12),
      );
      block.rotation.z =
        motion &&
        STAGES[s.stage].kind === "robot" &&
        p.id.endsWith(":arm-right")
          ? 0.18 * Math.sin(time * 2)
          : 0;
      block.rotation.y =
        selected && !this.reduced ? 0.025 * Math.sin(time * 2) : 0;
      if (motion && kind === "robot" && p.id.endsWith(":arm-right"))
        block.rotation.z = 0.22 * Math.sin(Math.min(rewardElapsed, 4) * 3);
      for (const child of block.children)
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshStandardMaterial
        ) {
          child.material.emissive.set(
            placed
              ? "#2c684d"
              : selected || s.hover === p.id
                ? "#294c50"
                : "#000000",
          );
          child.material.emissiveIntensity = placed
            ? 0.12
            : selected
              ? 0.28
              : s.hover === p.id
                ? 0.12
                : 0;
        }
      ghost.visible = !placed;
      ghost.traverse((o) => {
        if (
          o instanceof THREE.Mesh &&
          o.material instanceof THREE.MeshStandardMaterial
        )
          o.material.opacity =
            s.config.assistance === "low" ? 0.1 : selected ? 0.27 : 0.16;
      });
    }
    this.cursor.visible = s.status === "running" && s.inputReady;
    const cursor = unproject(s.pointer, 1.5);
    this.cursor.position.set(...cursor);
    this.cursor.quaternion.copy(this.camera.quaternion);
    this.cursor.scale.setScalar(1 + (s.dwell / s.config.dwellMs) * 0.5);
    this.renderer.render(this.scene, this.camera);
    this.frame++;
    this.timer += dt;
    this.frameTimes.push(dt * 1000);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    if (this.timer >= 1) {
      this.metrics = {
        fps: this.frame / this.timer,
        frameMs:
          this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length,
        frameP95Ms:
          [...this.frameTimes].sort((a, b) => a - b)[
            Math.floor((this.frameTimes.length - 1) * 0.95)
          ] ?? 0,
        frameMaxMs: Math.max(...this.frameTimes),
        triangles: this.renderer.info.render.triangles,
        drawCalls: this.renderer.info.render.calls,
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures,
        frames: this.metrics.frames + this.frame,
      };
      this.frame = 0;
      this.timer = 0;
    }
  }
  private disposeTree(root: THREE.Object3D) {
    const materials = new Set<THREE.Material>(),
      geometries = new Set<THREE.BufferGeometry>();
    root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(m);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }
  dispose() {
    this.disposeTree(this.scene);
    this.scene.traverse((o) => {
      if (o instanceof THREE.DirectionalLight) {
        o.shadow.map?.dispose();
        o.shadow.mapPass?.dispose();
      }
    });
    this.environment.dispose();
    this.woodTexture.dispose();
    this.scene.clear();
    this.renderer.dispose();
  }
}
