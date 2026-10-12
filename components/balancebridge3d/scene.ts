import * as T from "three";
import {
  STAGES,
  routePoint,
  widthFraction,
  type State,
} from "@/lib/balancebridge3d/engine";
export interface SceneStats {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}
const palettes = [
  {
    ground: 0x5b963e,
    water: 0x38c8cb,
    path: 0xbb8750,
    leaf: 0x32834c,
    flower: 0xf6a6b8,
    light: 0xfff0cf,
  },
  {
    ground: 0x62964f,
    water: 0x6ab9aa,
    path: 0xf1dcc0,
    leaf: 0x337357,
    flower: 0xfb96c0,
    light: 0xffecdc,
  },
  {
    ground: 0xe8ca89,
    water: 0x35bdc3,
    path: 0xf7e0a4,
    leaf: 0x267e63,
    flower: 0xffd184,
    light: 0xffedd3,
  },
  {
    ground: 0xe9f5f8,
    water: 0x8ad6e4,
    path: 0xccecf3,
    leaf: 0x426a7c,
    flower: 0x97daf6,
    light: 0xe9f9ff,
  },
  {
    ground: 0x355e4b,
    water: 0x62afa4,
    path: 0xd9c89a,
    leaf: 0x275943,
    flower: 0xe7a1ec,
    light: 0xf4efd7,
  },
  {
    ground: 0x8185a7,
    water: 0xa6c4dc,
    path: 0xe4dbf2,
    leaf: 0x6c8097,
    flower: 0xc7a1f2,
    light: 0xe2deff,
  },
  {
    ground: 0xd2e2d8,
    water: 0xc8dfeb,
    path: 0xffedda,
    leaf: 0x789b8c,
    flower: 0xf6a7c9,
    light: 0xfff4e9,
  },
  {
    ground: 0x182f3f,
    water: 0x265265,
    path: 0x91b6bb,
    leaf: 0x244b55,
    flower: 0x90e9dc,
    light: 0xadbcff,
  },
  {
    ground: 0x729277,
    water: 0x60bfc1,
    path: 0xead2ac,
    leaf: 0x326651,
    flower: 0xfab4b8,
    light: 0xffdeb2,
  },
];
export function createBridge(
  host: HTMLDivElement,
  initial: State,
  onStats: (stats: SceneStats) => void,
) {
  let state = initial;
  let disposed = false;
  const theme = palettes[state.stage],
    kind = STAGES[state.stage].kind;
  let randSeed = 391 + state.stage * 97;
  const rand = () => {
    randSeed = (randSeed * 1664525 + 1013904223) >>> 0;
    return randSeed / 4294967296;
  };
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, state.config.quality === "low" ? 1 : 1.6),
  );
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = kind === "night" ? 1.3 : 1.02;
  renderer.shadowMap.enabled = state.config.quality === "high";
  renderer.shadowMap.type = T.PCFShadowMap;
  host.appendChild(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color(theme.ground);
  const camera = new T.OrthographicCamera(-7, 7, 4, -4, 0.1, 60);
  camera.position.set(0, 24, 0.001);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  scene.add(new T.HemisphereLight(theme.light, 0x36504c, 1.45));
  const sun = new T.DirectionalLight(theme.light, kind === "night" ? 1.2 : 2.4);
  sun.position.set(-5, 12, 5);
  sun.castShadow = state.config.quality === "high";
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -9,
    right: 9,
    top: 6,
    bottom: -6,
    near: 0.5,
    far: 30,
  });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  const own = <G extends T.BufferGeometry>(g: G) => {
    geometries.add(g);
    return g;
  };
  const mat = (color: number, roughness = 0.8, emissive = 0) => {
    const m = new T.MeshStandardMaterial({
      color,
      roughness,
      emissive,
      emissiveIntensity: emissive ? 0.35 : 0,
    });
    materials.add(m);
    return m;
  };
  const box = own(new T.BoxGeometry(1, 1, 1)),
    sphere = own(new T.SphereGeometry(1, 12, 8)),
    cone = own(new T.ConeGeometry(1, 1, 24)),
    cylinder = own(new T.CylinderGeometry(1, 1, 1, 16));
  const mesh = (
    g: T.BufferGeometry,
    m: T.Material,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = sx,
    sz = sx,
    parent: T.Object3D = scene,
  ) => {
    const obj = new T.Mesh(g, m);
    obj.position.set(x, y, z);
    obj.scale.set(sx, sy, sz);
    obj.castShadow = true;
    obj.receiveShadow = true;
    parent.add(obj);
    return obj;
  };
  const groundMat = mat(theme.ground),
    waterMat = mat(theme.water, 0.23),
    leafMat = mat(theme.leaf),
    bark = mat(0x796042),
    stone = mat(kind === "ice" ? 0xd9e8ed : 0xaaa89b),
    cream = mat(0xfff1ce),
    flowerMat = mat(theme.flower, 0.65, kind === "night" ? theme.flower : 0),
    gold = mat(0xeabf62, 0.4),
    pathMat = mat(theme.path, 0.65);
  // Fine original terrain texture and caustic-like water lines add detail without asset downloads.
  function texture(kind: "terrain" | "water") {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const x = c.getContext("2d")!;
    x.fillStyle = kind === "terrain" ? "#d8dacb" : "#80d6cf";
    x.fillRect(0, 0, 512, 512);
    if (kind === "terrain") {
      for (let i = 0; i < 22000; i++) {
        const shade = rand() > 0.5 ? 255 : 45;
        x.fillStyle = `rgba(${shade},${shade},${shade},${rand() * 0.11})`;
        x.fillRect(rand() * 512, rand() * 512, 1 + rand() * 3, 1 + rand() * 3);
      }
    } else {
      for (let i = 0; i < 42; i++) {
        x.strokeStyle = `rgba(224,255,238,${0.08 + rand() * 0.23})`;
        x.lineWidth = 0.5 + rand() * 1.2;
        x.beginPath();
        const y = rand() * 512;
        x.moveTo(0, y);
        for (let j = 0; j < 9; j++) {
          x.quadraticCurveTo(
            j * 64 + 25,
            y + rand() * 30 - 15,
            j * 64 + 64,
            y + rand() * 20 - 10,
          );
        }
        x.stroke();
      }
    }
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(kind === "water" ? 3 : 5, kind === "water" ? 3 : 4);
    textures.add(t);
    return t;
  }
  groundMat.map = texture("terrain");
  leafMat.map = groundMat.map;
  pathMat.map = groundMat.map;
  waterMat.map = texture("water");
  waterMat.color.set(theme.water);
  waterMat.metalness = 0.12;
  waterMat.emissiveIntensity = 0.5;
  cream.emissiveIntensity = 0.5;
  gold.emissiveIntensity = 0.5;
  // Procedural original texture: fine wood grain and inset weathered boards, no external art assets.
  const woodCanvas = document.createElement("canvas");
  woodCanvas.width = 256;
  woodCanvas.height = 128;
  const ctx = woodCanvas.getContext("2d")!;
  ctx.fillStyle = "#b78350";
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 130; i++) {
    ctx.strokeStyle = `rgba(${rand() > 0.5 ? "70,39,19" : "242,204,143"},${0.07 + rand() * 0.18})`;
    ctx.lineWidth = 0.5 + rand() * 1.5;
    ctx.beginPath();
    const y = rand() * 128;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      70,
      y + rand() * 12 - 6,
      190,
      y + rand() * 12 - 6,
      256,
      y,
    );
    ctx.stroke();
  }
  ctx.strokeStyle = "#684526";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 252, 124);
  for (const x of [10, 246])
    for (const y of [12, 116]) {
      ctx.fillStyle = "#5a5148";
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  const woodTex = new T.CanvasTexture(woodCanvas);
  woodTex.colorSpace = T.SRGBColorSpace;
  woodTex.anisotropy = 4;
  textures.add(woodTex);
  const wood = mat(0xc9a885);
  wood.map = woodTex;
  mesh(box, groundMat, 0, -0.12, 0, 14, 0.2, 8);
  const route = STAGES[state.stage].points.map((_, i) => {
    const p = routePoint(state.stage, i, state.config.routeChoice);
    const inset = Math.min(
      1,
      (4 * (1 - state.config.margin * 2) - 0.45) / 2.65,
    );
    return new T.Vector3(p.x, 0.11, p.z * inset);
  });
  const curve = new T.CatmullRomCurve3(route, false, "catmullrom", 0.18);
  const width = widthFraction(state.config) * 14;
  function ribbon(w: number, y: number, m: T.Material) {
    const vertices: number[] = [],
      uv: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= 100; i++) {
      const t = i / 100,
        p = curve.getPoint(t),
        v = curve.getTangent(t),
        normal = new T.Vector3(-v.z, 0, v.x).normalize();
      for (const side of [-1, 1]) {
        const q = p.clone().addScaledVector(normal, w * 0.5 * side);
        vertices.push(q.x, y, q.z);
        uv.push((side + 1) / 2, t * 8);
      }
      if (i < 100) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = own(new T.BufferGeometry());
    g.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    const obj = new T.Mesh(g, m);
    obj.receiveShadow = true;
    scene.add(obj);
    return obj;
  }
  function pond(x: number, z: number, sx: number, sz: number) {
    const o = mesh(sphere, waterMat, x, 0.015, z, sx, 0.025, sz);
    o.castShadow = false;
    return o;
  }
  if (kind === "wood") {
    pond(0, 0, 4.5, 5.2);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        mesh(
          sphere,
          groundMat,
          side * (3.5 + rand() * 0.5),
          0.02,
          -3.7 + i * 1.05,
          1.5,
          0.1,
          0.9,
        );
      }
    }
  }
  if (kind === "beach") {
    mesh(box, waterMat, 4.8, 0.005, 0, 5, 0.025, 8);
    for (let i = 0; i < 14; i++) {
      const foam = mesh(
        sphere,
        cream,
        2.8 + Math.sin(i) * 0.17,
        0.03,
        -4 + i * 0.6,
        0.16,
        0.008,
        0.36,
      );
      foam.castShadow = false;
    }
  }
  if (kind === "ice") {
    pond(0, 0, 4.2, 3.8);
    const cracks = mat(0xb3ddeb);
    for (let i = 0; i < 15; i++) {
      const o = mesh(
        box,
        cracks,
        (rand() - 0.5) * 7,
        0.04,
        (rand() - 0.5) * 6,
        0.018,
        0.005,
        0.3 + rand() * 0.7,
      );
      o.rotation.y = rand() * 6;
    }
  }
  if (
    kind === "garden" ||
    kind === "forest" ||
    kind === "night" ||
    kind === "castle"
  ) {
    for (const side of [-1, 1]) pond(side * 4.7, side * 1.8, 1.5, 0.8);
  }
  if (kind === "cloud") {
    for (let i = 0; i < 40; i++)
      mesh(
        sphere,
        cream,
        (rand() - 0.5) * 14,
        -0.015,
        (rand() - 0.5) * 8,
        0.5 + rand(),
        0.09,
        0.35 + rand() * 0.4,
      );
  }
  if (kind === "crystal")
    for (let i = 0; i < 8; i++)
      pond((i % 2 ? 1 : -1) * (3 + rand() * 2), -3 + i * 0.85, 0.7, 0.45);
  ribbon(
    width + 0.2,
    0.065,
    mat(
      kind === "night" ? 0x83c8c9 : 0xbac8a3,
      0.6,
      kind === "night" ? 0x4c9eac : 0,
    ),
  );
  if (kind === "wood" || kind === "castle") {
    for (let i = 0; i < 45; i++) {
      const t = i / 44,
        p = curve.getPoint(t),
        v = curve.getTangent(t);
      const plank = mesh(box, wood, p.x, 0.095, p.z, width, 0.12, 0.24);
      plank.rotation.y = Math.atan2(v.x, v.z);
    }
    for (let i = 0; i < 10; i++) {
      const t = i / 9,
        p = curve.getPoint(t),
        v = curve.getTangent(t),
        normal = new T.Vector3(-v.z, 0, v.x).normalize();
      for (const side of [-1, 1]) {
        const q = p
          .clone()
          .addScaledVector(normal, (width * 0.5 + 0.14) * side);
        mesh(cylinder, bark, q.x, 0.18, q.z, 0.065, 0.32, 0.065);
        mesh(sphere, gold, q.x, 0.36, q.z, 0.085, 0.025, 0.085);
      }
    }
  } else ribbon(width, 0.1, pathMat);
  if (kind === "wood" || kind === "garden") {
    const lily = mat(0x78a92d);
    for (let i = 0; i < 18; i++) {
      const x = (i % 2 ? 1 : -1) * (1.8 + rand() * 0.65),
        z = (rand() - 0.5) * 6;
      if (safeLily(x, z)) {
        mesh(
          cylinder,
          lily,
          x,
          0.045,
          z,
          0.12 + rand() * 0.13,
          0.025,
          0.12 + rand() * 0.13,
        );
        if (i % 3 === 0) mesh(sphere, flowerMat, x, 0.08, z, 0.08, 0.05, 0.08);
      }
    }
  }
  function safeLily(x: number, z: number) {
    return !route.some((p) => Math.hypot(p.x - x, p.z - z) < width * 0.5 + 0.5);
  }
  // Raised border stones and embedded trail lights mark the safe route without suggesting an elevated beam.
  for (let i = 0; i < 42; i++) {
    const t = i / 41,
      p = curve.getPoint(t),
      v = curve.getTangent(t),
      normal = new T.Vector3(-v.z, 0, v.x).normalize();
    for (const side of [-1, 1]) {
      const q = p.clone().addScaledVector(normal, (width * 0.5 + 0.08) * side);
      mesh(
        sphere,
        kind === "wood" ? gold : stone,
        q.x,
        0.1,
        q.z,
        0.075,
        0.045,
        0.09,
      );
    }
  }
  const safe = (x: number, z: number, margin = 0.4) => {
    let min = 100;
    for (let i = 0; i <= 60; i++) {
      const p = curve.getPoint(i / 60);
      min = Math.min(min, Math.hypot(p.x - x, p.z - z));
    }
    return min > width * 0.5 + margin;
  };
  const grassMaterial = mat(
    kind === "night" ? 0x377473 : kind === "ice" ? 0xe3f3f5 : 0x72aa53,
  );
  const grassGeo = own(new T.ConeGeometry(0.025, 0.22, 3));
  const grassCount = state.config.quality === "low" ? 500 : 1800;
  const grass = new T.InstancedMesh(grassGeo, grassMaterial, grassCount);
  const dummy = new T.Object3D();
  for (let i = 0; i < grassCount; i++) {
    let x = (rand() - 0.5) * 14,
      z = (rand() - 0.5) * 8;
    if (
      !safe(x, z, 0.2) ||
      (kind === "wood" && Math.abs(x) < 3) ||
      (kind === "beach" && x > 2.6)
    ) {
      x = 6.9;
      z = 3.9;
    }
    dummy.position.set(x, 0.09, z);
    dummy.rotation.set((rand() - 0.5) * 0.3, rand() * 6, (rand() - 0.5) * 0.3);
    dummy.scale.setScalar(0.65 + rand() * 0.8);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }
  scene.add(grass);
  const petalMaterials: T.MeshStandardMaterial[] = [];
  const petalGeo = own(new T.SphereGeometry(1, 6, 4)),
    flowerColors = [
      theme.flower,
      0xffd36e,
      kind === "night" ? 0x94baff : 0xf8f0e4,
      0xc3a1db,
    ];
  for (let c = 0; c < 4; c++) {
    const count = state.config.quality === "low" ? 60 : 170;
    const petalMaterial = mat(
      flowerColors[c],
      0.6,
      kind === "night" ? flowerColors[c] : 0,
    );
    petalMaterials.push(petalMaterial);
    const petals = new T.InstancedMesh(petalGeo, petalMaterial, count * 6);
    for (let i = 0; i < count; i++) {
      let x = (rand() - 0.5) * 13.5,
        z = (rand() - 0.5) * 7.6;
      while (
        !safe(x, z, 0.38) ||
        (kind === "wood" && Math.abs(x) < 3) ||
        (kind === "beach" && x > 2.5)
      ) {
        x = (rand() - 0.5) * 13.5;
        z = (rand() - 0.5) * 7.6;
      }
      const size = 0.045 + rand() * 0.035;
      for (let j = 0; j < 6; j++) {
        dummy.position.set(
          x + Math.sin((j * Math.PI) / 3) * size,
          0.12,
          z + Math.cos((j * Math.PI) / 3) * size,
        );
        dummy.rotation.set(0, (j * Math.PI) / 3, 0);
        dummy.scale.set(size * 0.55, 0.02, size);
        dummy.updateMatrix();
        petals.setMatrixAt(i * 6 + j, dummy.matrix);
      }
    }
    scene.add(petals);
  }
  const treeCanopies: T.Object3D[] = [];
  function tree(
    x: number,
    z: number,
    size: number,
    pine = false,
    palm = false,
  ) {
    const group = new T.Group();
    group.position.set(x, 0, z);
    scene.add(group);
    mesh(cylinder, bark, 0, 0.35, 0, 0.09, 0.7, 0.09, group);
    if (palm) {
      for (let i = 0; i < 7; i++) {
        const leaf = mesh(
          sphere,
          leafMat,
          Math.sin(i) * 0.45,
          0.55,
          Math.cos(i) * 0.45,
          0.13,
          0.035,
          0.65,
          group,
        );
        leaf.rotation.y = i;
      }
    } else if (pine) {
      for (let j = 0; j < 3; j++) {
        mesh(
          cone,
          leafMat,
          0,
          0.45 + j * 0.22,
          0,
          0.5 - j * 0.1,
          0.55,
          0.5 - j * 0.1,
          group,
        );
        if (kind === "ice")
          mesh(
            cone,
            cream,
            0,
            0.53 + j * 0.22,
            0,
            0.43 - j * 0.09,
            0.44,
            0.43 - j * 0.09,
            group,
          );
      }
    } else {
      for (let j = 0; j < 8; j++) {
        const a = j * 2.4;
        mesh(
          sphere,
          leafMat,
          Math.sin(a) * 0.27,
          0.55 + rand() * 0.2,
          Math.cos(a) * 0.27,
          0.36,
          0.24,
          0.36,
          group,
        );
      }
      mesh(
        sphere,
        kind === "garden" ? flowerMat : leafMat,
        0.03,
        0.75,
        0.02,
        0.4,
        0.23,
        0.4,
        group,
      );
    }
    group.scale.setScalar(size);
    treeCanopies.push(group);
  }
  function outsideRoute(x: number, z: number, radius: number) {
    const side = x < 0 ? -1 : 1;
    for (let n = 0; n < 40 && !safe(x, z, radius); n++) x += side * 0.18;
    return x;
  }
  const treeCount =
    kind === "beach" ? 12 : kind === "crystal" ? 5 : kind === "cloud" ? 7 : 30;
  for (let i = 0; i < treeCount; i++) {
    const x = (i % 2 ? 1 : -1) * (3.3 + rand() * 3.2),
      z = (rand() - 0.5) * 8;
    const size = 0.7 + rand() * 0.7;
    tree(
      outsideRoute(x, z, size * (kind === "beach" ? 1.2 : 0.75) + 0.1),
      z,
      size,
      kind === "ice",
      kind === "beach",
    );
  }
  for (let i = 0; i < 35; i++) {
    const x = (rand() - 0.5) * 13,
      z = (rand() - 0.5) * 7.5;
    if (!safe(x, z, 0.55)) continue;
    mesh(
      sphere,
      stone,
      x,
      0.08,
      z,
      0.14 + rand() * 0.3,
      0.12 + rand() * 0.2,
      0.14 + rand() * 0.3,
    );
  }
  const biomeCrystals: T.MeshStandardMaterial[] = [];
  if (kind === "ice" || kind === "crystal") {
    const colors =
      kind === "ice" ? [0x8ed9f0, 0xc5efff] : [0xb99cf3, 0x9ee7e2, 0xebc0ed];
    const crystalMaterials = colors.map((c) => mat(c, 0.24, c));
    biomeCrystals.push(...crystalMaterials);
    for (let i = 0; i < 50; i++) {
      const z = (rand() - 0.5) * 7.6,
        x = outsideRoute((i % 2 ? 1 : -1) * (2.7 + rand() * 3.7), z, 0.55);
      for (let j = 0; j < 3; j++) {
        const crystal = mesh(
          cone,
          crystalMaterials[i % colors.length],
          x + (j - 1) * 0.16,
          0.24,
          z,
          0.12,
          0.35 + rand() * 0.55,
          0.12,
        );
        crystal.rotation.z = (j - 1) * 0.2;
      }
    }
  }
  if (kind === "beach")
    for (let i = 0; i < 30; i++) {
      const x = (rand() - 0.5) * 11,
        z = (rand() - 0.5) * 7;
      if (safe(x, z)) {
        const shell = mesh(sphere, cream, x, 0.07, z, 0.13, 0.06, 0.1);
        shell.rotation.y = rand() * 6;
      }
    }
  if (
    kind === "garden" ||
    kind === "cloud" ||
    kind === "night" ||
    kind === "castle"
  ) {
    for (let i = 0; i < 4; i++) {
      const z = i < 2 ? -1.8 : 1.8,
        x = outsideRoute((i % 2 ? 1 : -1) * 3.05, z, 0.85);
      mesh(cylinder, cream, x, 0.07, z, 0.8, 0.14, 0.8);
      mesh(cylinder, waterMat, x, 0.15, z, 0.65, 0.03, 0.65);
      mesh(cylinder, cream, x, 0.3, z, 0.18, 0.3, 0.18);
      mesh(sphere, waterMat, x, 0.46, z, 0.3, 0.04, 0.3);
    }
  }
  if (kind === "castle") {
    const castle = new T.Group();
    castle.position.set(0, 0, -3.5);
    scene.add(castle);
    const wall = mat(0xffead2);
    mesh(box, wall, 0, 0.25, 0, 2.9, 0.5, 0.5, castle);
    mesh(box, mat(0x725646), 0, 0.2, 0.28, 0.6, 0.4, 0.03, castle);
    for (const x of [-1.45, 1.45]) {
      mesh(cylinder, wall, x, 0.45, 0, 0.32, 0.9, 0.32, castle);
      mesh(cone, mat(0x608b96, 0.5), x, 1.02, 0, 0.43, 0.4, 0.43, castle);
      mesh(cylinder, gold, x, 1.28, 0, 0.02, 0.25, 0.02, castle);
      mesh(box, flowerMat, x + 0.11, 1.35, 0, 0.22, 0.12, 0.02, castle);
    }
    for (let i = 0; i < 9; i++)
      mesh(box, wall, -1.15 + i * 0.29, 0.56, 0, 0.15, 0.16, 0.5, castle);
  }
  // Readable geometric footprint silhouettes, soles plus toes, resting flush on the walking surface.
  const footprintInk = mat(0x174d45);
  const markerPad = mat(0xffefcc);
  const markerMaterials: T.MeshStandardMaterial[] = [],
    markerGroups: T.Group[] = [];
  const glowMat = mat(0xffec9d, 0.5, 0xeec665),
    doneMat = mat(0x81dfbd, 0.5, 0x429a78),
    pendingMat = mat(0xf3eedb);
  const torusGeo = own(new T.TorusGeometry(0.37, 0.028, 6, 40));
  function footprint(parent: T.Group, x: number, side: number, m: T.Material) {
    const foot = new T.Group();
    foot.position.x = x;
    parent.add(foot);
    mesh(sphere, m, 0, 0.215, 0.07, 0.095, 0.018, 0.16, foot);
    mesh(sphere, m, side * 0.012, 0.215, -0.075, 0.08, 0.018, 0.09, foot);
    for (let j = 0; j < 5; j++)
      mesh(
        sphere,
        m,
        side * (0.075 - j * 0.033),
        0.215,
        -0.18 + Math.abs(j - 1) * 0.009,
        0.026 - j * 0.002,
        0.02,
        0.032 - j * 0.003,
        foot,
      );
  }
  route.forEach((p, i) => {
    const group = new T.Group();
    group.position.set(p.x, 0, p.z);
    scene.add(group);
    const m = mat(0xf3eedb, 0.6);
    markerMaterials.push(m);
    const ring = mesh(torusGeo, m, 0, 0.205, 0, 1, 1, 1, group);
    ring.rotation.x = -Math.PI / 2;
    mesh(cylinder, markerPad, 0, 0.17, 0, 0.38, 0.03, 0.38, group);
    const both =
      state.config.guidance === "both" ||
      state.config.guidance === "neutral" ||
      (STAGES[state.stage].hold.includes(i as never) &&
        state.config.holdSeconds > 0);
    if (both) {
      footprint(group, -0.12, -1, footprintInk);
      footprint(group, 0.12, 1, footprintInk);
    } else {
      const side =
        state.config.guidance === "alternating"
          ? i % 2
            ? 1
            : -1
          : state.config.guidance === "right"
            ? 1
            : state.config.guidance === "left"
              ? -1
              : 0;
      footprint(group, side * 0.07, side || 1, footprintInk);
    }
    markerGroups.push(group);
    if (i < route.length - 1) {
      const arrow = new T.Shape();
      arrow.moveTo(-0.08, 0);
      arrow.lineTo(-0.08, -0.16);
      arrow.lineTo(-0.18, -0.16);
      arrow.lineTo(0, -0.34);
      arrow.lineTo(0.18, -0.16);
      arrow.lineTo(0.08, -0.16);
      arrow.lineTo(0.08, 0);
      arrow.closePath();
      const geo = own(new T.ShapeGeometry(arrow));
      const ar = new T.Mesh(geo, glowMat);
      ar.rotation.x = -Math.PI / 2;
      const next = route[i + 1],
        v = next.clone().sub(p);
      ar.rotation.z = -Math.atan2(v.x, -v.z);
      ar.position.copy(p.clone().addScaledVector(v, 0.48));
      ar.position.y = 0.17;
      scene.add(ar);
    }
  });
  const butterflies: T.Group[] = [];
  for (let i = 0; i < (state.config.quality === "low" ? 8 : 22); i++) {
    const b = new T.Group();
    b.position.set(
      (i % 2 ? 1 : -1) * (2.4 + rand() * 3.4),
      0.5 + rand() * 0.4,
      (rand() - 0.5) * 7,
    );
    const wingMat = mat(
      kind === "night" ? 0xe2eda2 : i % 2 ? 0xf4c478 : 0xb9b3fc,
      0.4,
      kind === "night" ? 0xded585 : 0,
    );
    for (const side of [-1, 1]) {
      const wing = mesh(
        sphere,
        wingMat,
        side * 0.065,
        0,
        0,
        0.075,
        0.008,
        0.1,
        b,
      );
      wing.rotation.y = side * 0.35;
    }
    scene.add(b);
    butterflies.push(b);
  }
  const sparkGeo = own(new T.SphereGeometry(0.023, 6, 4));
  const sparks = new T.InstancedMesh(
    sparkGeo,
    kind === "ice" ? cream : glowMat,
    80,
  );
  scene.add(sparks);
  const ripple = mesh(
    own(new T.TorusGeometry(0.7, 0.018, 6, 60)),
    mat(0xffefd0, 0.5, 0xeecaa0),
    0,
    0.18,
    0,
  );
  ripple.rotation.x = -Math.PI / 2;
  ripple.visible = false;
  // Foot silhouettes share instanced geometry within each checkpoint while retaining their live color.
  scene.updateMatrixWorld(true);
  for (const group of markerGroups) {
    const inverse = group.matrixWorld.clone().invert();
    const grouped = new Map<T.BufferGeometry, Map<T.Material, T.Mesh[]>>();
    group.traverse((o) => {
      if (o instanceof T.Mesh && !Array.isArray(o.material)) {
        let byMaterial = grouped.get(o.geometry);
        if (!byMaterial) {
          byMaterial = new Map();
          grouped.set(o.geometry, byMaterial);
        }
        const list = byMaterial.get(o.material) || [];
        list.push(o);
        byMaterial.set(o.material, list);
      }
    });
    for (const [g, byMaterial] of grouped)
      for (const [m, objects] of byMaterial) {
        const batch = new T.InstancedMesh(g, m, objects.length);
        objects.forEach((o, i) => {
          batch.setMatrixAt(i, inverse.clone().multiply(o.matrixWorld));
          o.removeFromParent();
        });
        batch.castShadow = false;
        batch.receiveShadow = true;
        group.add(batch);
      }
  }
  // Batch static scenery by geometry/material. Keep live checkpoint and butterfly transforms separate.
  scene.updateMatrixWorld(true);
  const batches = new Map<T.BufferGeometry, Map<T.Material, T.Mesh[]>>();
  const excluded = new Set<T.Object3D>([
    ripple,
    ...markerGroups,
    ...butterflies,
  ]);
  const isLive = (o: T.Object3D): boolean =>
    excluded.has(o) || (!!o.parent && isLive(o.parent));
  scene.traverse((o) => {
    if (
      o instanceof T.Mesh &&
      !(o instanceof T.InstancedMesh) &&
      !Array.isArray(o.material) &&
      !isLive(o)
    ) {
      let byMaterial = batches.get(o.geometry);
      if (!byMaterial) {
        byMaterial = new Map();
        batches.set(o.geometry, byMaterial);
      }
      const list = byMaterial.get(o.material) || [];
      list.push(o);
      byMaterial.set(o.material, list);
    }
  });
  for (const [g, byMaterial] of batches)
    for (const [m, objects] of byMaterial) {
      const batch = new T.InstancedMesh(g, m, objects.length);
      objects.forEach((o, i) => {
        batch.setMatrixAt(i, o.matrixWorld);
        o.removeFromParent();
      });
      batch.castShadow = true;
      batch.receiveShadow = true;
      scene.add(batch);
    }
  let feedback = state.feedback,
    feedbackAt = -100;
  let nowSeconds = 0;
  let last = performance.now(),
    frames = 0,
    sampleAt = last;
  let frame = 0;
  const resize = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  function update(next: State) {
    if (next.feedback > feedback) {
      feedbackAt = nowSeconds;
      feedback = next.feedback;
    }
    state = next;
    markerMaterials.forEach((m, i) => {
      const done = state.checkpoints[i].outcome !== "pending";
      m.color.copy(
        (done ? doneMat : i === state.active ? glowMat : pendingMat).color,
      );
      m.emissive.copy(
        (done ? doneMat : i === state.active ? glowMat : pendingMat).emissive,
      );
      m.emissiveIntensity = i === state.active ? 0.6 : 0.15;
    });
  }
  update(state);
  function animate(at: number) {
    if (disposed) return;
    nowSeconds = at / 1000;
    const t =
      state.config.reduced ||
      state.status === "paused" ||
      state.status === "ready"
        ? 0
        : nowSeconds;
    butterflies.forEach((b, i) => {
      b.rotation.y = Math.sin(t * 0.4 + i) * 0.5;
      b.position.y = 0.7 + Math.sin(t * 0.9 + i) * 0.09;
      b.children.forEach((wing, j) => {
        wing.rotation.z = Math.sin(t * 3 + i) * (j ? 0.35 : -0.35);
      });
    });
    waterMat.map!.offset.set(Math.sin(t * 0.025) * 0.03, t * 0.006);
    const p = route[state.active];
    ripple.visible = nowSeconds - feedbackAt < 2.5 && !state.config.reduced;
    if (ripple.visible) {
      ripple.position.set(p.x, 0.18, p.z);
      ripple.scale.setScalar(1 + (nowSeconds - feedbackAt) * 0.4);
    }
    const rewards = state.checkpoints.filter((c) =>
      ["confirmed", "assisted"].includes(c.outcome),
    ).length;
    // Each biome rewards progress through its own ambient material and creature response.
    if (kind === "ice")
      waterMat.emissive.setRGB(
        0.02,
        0.04 + rewards * 0.012,
        0.06 + rewards * 0.018,
      );
    if (kind === "crystal") {
      flowerMat.emissiveIntensity = 0.2 + rewards * 0.1;
      biomeCrystals.forEach((m) => {
        m.emissiveIntensity = 0.35 + rewards * 0.08;
      });
    }
    if (kind === "night")
      petalMaterials.forEach((m) => {
        m.emissiveIntensity = 0.35 + rewards * 0.08;
      });
    if (kind === "garden")
      petalMaterials.forEach((m) => {
        m.emissive.copy(m.color);
        m.emissiveIntensity = rewards * 0.018;
      });
    if (kind === "castle")
      gold.emissive.setRGB(rewards * 0.04, rewards * 0.025, 0);
    if (kind === "forest" || kind === "garden")
      butterflies.forEach((b, i) => {
        b.position.x =
          (i % 2 ? 1 : -1) * (2.7 + Math.sin(i * 4) * 0.6) +
          Math.sin(t * 0.35 + i) * rewards * 0.055;
      });
    if (kind === "beach")
      waterMat.emissive.setRGB(0, rewards * 0.006, rewards * 0.007);
    if (kind === "cloud")
      cream.emissive.setRGB(rewards * 0.014, rewards * 0.01, rewards * 0.006);
    for (let i = 0; i < 80; i++) {
      const r = route[Math.min(rewards, route.length - 1)];
      dummy.position.set(
        r.x + Math.sin(i * 3.8 + t * 0.25) * (0.4 + (i % 7) * 0.13),
        0.17 + ((t * 0.12 + i * 0.037) % 1) * 0.8,
        r.z + Math.cos(i * 2.1 + t * 0.25) * 0.5,
      );
      dummy.scale.setScalar(i < rewards * 10 && !state.config.reduced ? 1 : 0);
      dummy.updateMatrix();
      sparks.setMatrixAt(i, dummy.matrix);
    }
    sparks.instanceMatrix.needsUpdate = true;
    markerGroups.forEach((b, i) => {
      b.scale.setScalar(
        i === state.active && state.status === "running"
          ? 1 + Math.sin(t * 2) * 0.025
          : 1,
      );
    });
    renderer.render(scene, camera);
    frames++;
    if (at - sampleAt >= 2000) {
      onStats({
        fps: Math.round((frames * 1000) / (at - sampleAt)),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      });
      frames = 0;
      sampleAt = at;
    }
    last = at;
    frame = requestAnimationFrame(animate);
  }
  frame = requestAnimationFrame(animate);
  return {
    update,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      scene.traverse((o) => {
        if (o instanceof T.InstancedMesh) o.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
    get lastFrame() {
      return last;
    },
  };
}
