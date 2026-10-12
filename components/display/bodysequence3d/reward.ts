import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { RewardKind } from '@/lib/bodysequence3d/stages';
import { glowTexture } from './textures';

/**
 * The "machine" the child powers up. Each completed sequence lights one part (a blueprint hologram until then), so
 * progress is always visible without any number. Parts live in the screen margins, never over the stepping lanes.
 * Everything is built from shared primitive geometry; parts own their materials so they can be lit independently.
 */
export interface Part {
  group: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  /** Emissive intensity when fully lit, per material. */
  full: number[];
  glow: THREE.Sprite | null;
  lit: number;
  target: number;
  popAt: number;
  spin?: THREE.Object3D[];
}

export interface Reward {
  group: THREE.Group;
  parts: Part[];
  /** World positions (x, z) good for bursts. */
  spots: [number, number][];
  update(dt: number, t: number, lit: number, final: boolean, calm: boolean): void;
  dispose(): void;
}

const GLOW_COLOR: Record<RewardKind, number> = { robot: 0x38d9ff, towers: 0xffc233, crystals: 0xb48cff, core: 0xff7a59, grand: 0xffc233 };

export function buildReward(kind: RewardKind, lq: boolean): Reward {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const parts: Part[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T): T => { geos.push(x); return x; };
  const glow = glowTexture();
  const allMats: THREE.Material[] = [];

  /** Blueprint (unlit) look: dark hologram steel with a faint cyan edge glow; lit look: full emissive colour. */
  const mat = (color: number, emissive: number, full = 1.4, metal = 0.5, rough = 0.32): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.12, metalness: metal, roughness: rough, transparent: true, opacity: 0.5 });
    m.userData.full = full;
    allMats.push(m);
    return m;
  };
  const newPart = (color: number): Part => {
    const grp = new THREE.Group();
    group.add(grp);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.renderOrder = 8;
    allMats.push(sprite.material);
    grp.add(sprite);
    const p: Part = { group: grp, mats: [], full: [], glow: sprite, lit: 0, target: 0, popAt: -1e9 };
    parts.push(p);
    return p;
  };
  const add = (p: Part, geo: THREE.BufferGeometry, m: THREE.MeshStandardMaterial, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number; shadow?: boolean } = {}) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    mesh.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    mesh.castShadow = o.shadow !== false && !lq;
    p.group.add(mesh);
    if (!p.mats.includes(m)) { p.mats.push(m); p.full.push(m.userData.full as number); }
    return mesh;
  };

  const spots: [number, number][] = [];

  const robot = (scale = 1) => {
    const base = newPart(0x38d9ff), torso = newPart(0x38d9ff), arms = newPart(0x38d9ff), head = newPart(0xffc233), crown = newPart(0xff7a59);
    const steel = mat(0x4f7fd8, 0x1fb6ff, 1.0, 0.7, 0.25), dark = mat(0x22306a, 0x1fb6ff, 0.6, 0.5, 0.4), core = mat(0xffe7a0, 0xffc233, 2.4, 0.1, 0.3), eye = mat(0xbafcff, 0x38d9ff, 2.6, 0.1, 0.3), coral = mat(0xffb3a0, 0xff7a59, 1.8, 0.3, 0.3);
    // platform + legs
    add(base, g(new RoundedBoxGeometry(2.3, 0.14, 4.7, 3, 0.07)), dark, 0, 0.07, 0, { shadow: false });
    for (const sx of [-1, 1]) {
      add(base, g(new RoundedBoxGeometry(0.52, 0.5, 1.15, 3, 0.1)), steel, sx * 0.4, 0.4, 1.55);
      add(base, g(new RoundedBoxGeometry(0.74, 0.3, 0.6, 3, 0.1)), dark, sx * 0.4, 0.28, 2.0);
    }
    // torso + chest core
    add(torso, g(new RoundedBoxGeometry(1.45, 0.78, 1.5, 4, 0.2)), steel, 0, 0.62, 0.35);
    add(torso, g(new THREE.SphereGeometry(0.3, 24, 16)), core, 0, 1.08, 0.38);
    add(torso, g(new RoundedBoxGeometry(1.0, 0.16, 0.34, 2, 0.06)), dark, 0, 1.02, 0.95);
    // arms
    for (const sx of [-1, 1]) {
      add(arms, g(new THREE.CapsuleGeometry(0.2, 1.0, 6, 14)), steel, sx * 1.02, 0.7, 0.3, { rx: Math.PI / 2 });
      add(arms, g(new THREE.SphereGeometry(0.27, 20, 14)), coral, sx * 1.02, 0.7, 1.15);
      add(arms, g(new THREE.SphereGeometry(0.24, 18, 12)), dark, sx * 1.02, 0.78, -0.35);
    }
    // head
    add(head, g(new RoundedBoxGeometry(1.25, 0.78, 1.0, 5, 0.3)), steel, 0, 0.95, -1.15);
    add(head, g(new RoundedBoxGeometry(0.98, 0.1, 0.36, 3, 0.04)), eye, 0, 1.3, -1.0);
    for (const sx of [-1, 1]) add(head, g(new THREE.SphereGeometry(0.15, 16, 12)), eye, sx * 0.28, 1.34, -1.2);
    // antenna + halo
    add(crown, g(new THREE.CylinderGeometry(0.035, 0.045, 0.6, 8)), steel, 0, 1.45, -1.75, { shadow: false });
    add(crown, g(new THREE.SphereGeometry(0.16, 16, 12)), coral, 0, 1.78, -1.75, { shadow: false });
    const halo = add(crown, g(new THREE.TorusGeometry(0.62, 0.035, 8, 48)), coral, 0, 1.62, -1.15, { rx: Math.PI / 2, shadow: false });
    crown.spin = [halo];
    group.scale.setScalar(scale);
    parts.forEach((p, i) => p.glow!.position.set(0, 1.1, [1.5, 0.4, 0.3, -1.15, -1.5][i]));
    parts.forEach((p) => p.glow!.scale.setScalar(2.4));
    spots.push([0, -1.2], [0, 0.4], [0, 1.6]);
  };

  const towers = () => {
    const zs = [-1.9, -0.95, 0, 0.95, 1.9];
    const cols = [0xffc233, 0xff9a1f, 0xff7a59, 0xff4fd8, 0x38d9ff];
    zs.forEach((z, i) => {
      const p = newPart(cols[i]);
      const body = mat(0x9fb6e8, cols[i], 1.5, 0.6, 0.25), trim = mat(0x22306a, cols[i], 0.8, 0.5, 0.4), gem = mat(0xe0f0ff, cols[i], 2.2, 0.1, 0.2);
      add(p, g(new THREE.CylinderGeometry(0.46, 0.52, 0.12, 8)), trim, 0, 0.06, z, { shadow: false });
      [0.4, 0.33, 0.26, 0.19].forEach((r, k) => add(p, g(new THREE.CylinderGeometry(r, r + 0.05, 0.26, 8)), k % 2 ? trim : body, 0, 0.27 + k * 0.28, z));
      add(p, g(new THREE.OctahedronGeometry(0.2, 0)), gem, 0, 1.58, z, { sy: 1.5 });
      p.glow!.position.set(0, 1.0, z); p.glow!.scale.setScalar(2.2);
      p.spin = [p.group.children[p.group.children.length - 1]];
      spots.push([0, z]);
    });
  };

  const crystals = () => {
    const zs = [-1.9, -0.95, 0, 0.95, 1.9];
    const cols = [0x38d9ff, 0x8a5cff, 0xff4fd8, 0xffc233, 0xff7a59];
    zs.forEach((z, i) => {
      const p = newPart(cols[i]);
      const m = mat(0x8fb8e8, cols[i], 1.8, 0.1, 0.12), base = mat(0x2a3b78, cols[i], 0.7, 0.5, 0.4);
      add(p, g(new THREE.CylinderGeometry(0.5, 0.58, 0.1, 6)), base, 0, 0.05, z, { shadow: false });
      const spec: [number, number, number, number, number][] = [[0, 0, 1.0, 0.34, 0.1], [-0.28, 0.12, 0.7, 0.24, 0.35], [0.3, -0.1, 0.62, 0.22, -0.3], [0.05, 0.3, 0.45, 0.18, 0.2]];
      spec.forEach(([x, dz, h, r, tilt]) => add(p, g(new THREE.OctahedronGeometry(r, 0)), m, x, 0.1 + h * 0.5, z + dz, { sy: h / r * 0.9, rz: tilt }));
      p.glow!.position.set(0, 0.7, z); p.glow!.scale.setScalar(2.0);
      spots.push([0, z]);
    });
  };

  const core = () => {
    const p0 = newPart(0xff7a59), p1 = newPart(0xffc233), p2 = newPart(0x38d9ff), p3 = newPart(0x8a5cff), p4 = newPart(0xffffff);
    const trim = mat(0x2a3b78, 0x38d9ff, 0.8, 0.5, 0.4);
    add(p0, g(new THREE.CylinderGeometry(1.15, 1.3, 0.16, 8)), trim, 0, 0.08, 0, { shadow: false });
    const ring = (p: Part, r: number, col: number, rx: number, rz: number) => { const m = mat(0xffffff, col, 2.0, 0.6, 0.25); const t = add(p, g(new THREE.TorusGeometry(r, 0.07, 10, 56)), m, 0, 1.15, 0, { rx, rz }); p.spin = [t]; return t; };
    ring(p0, 1.05, 0xff7a59, Math.PI / 2, 0); ring(p1, 0.85, 0xffc233, 0.4, 0.9); ring(p2, 0.65, 0x38d9ff, 1.2, -0.7);
    add(p3, g(new THREE.SphereGeometry(0.58, 32, 20)), mat(0xdcd0ff, 0x8a5cff, 1.3, 0.1, 0.1), 0, 1.15, 0);
    add(p4, g(new THREE.SphereGeometry(0.34, 24, 16)), mat(0xffffff, 0xffe9b0, 3.2, 0, 0.2), 0, 1.15, 0);
    parts.forEach((p) => { p.glow!.position.set(0, 1.15, 0); p.glow!.scale.setScalar(3.2); });
    spots.push([0, 0], [0, -1], [0, 1]);
  };

  if (kind === 'robot') robot();
  else if (kind === 'grand') robot(1.0);
  else if (kind === 'towers') towers();
  else if (kind === 'crystals') crystals();
  else core();

  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = false; });

  const baseOpacity = 0.5;
  return {
    group, parts, spots,
    update(dt, t, lit, final, calm) {
      parts.forEach((p, i) => {
        const want = final || i < lit ? 1 : 0;
        if (want === 1 && p.target === 0) p.popAt = t;
        p.target = want;
        p.lit += (p.target - p.lit) * Math.min(1, dt * 3.2);
        const k = p.lit;
        p.mats.forEach((m, mi) => { m.emissiveIntensity = 0.12 + (p.full[mi] - 0.12) * k; m.opacity = baseOpacity + (1 - baseOpacity) * k; });
        const pop = calm ? 0 : Math.max(0, 1 - (t - p.popAt) / 0.7);
        const s = 1 + 0.12 * Math.sin(pop * Math.PI);
        p.group.scale.setScalar(s);
        if (p.glow) (p.glow.material as THREE.SpriteMaterial).opacity = k * (0.35 + 0.15 * (calm ? 0 : Math.sin(t * 2 + i))) + (final ? 0.1 : 0);
        if (p.spin && !calm) p.spin.forEach((o, si) => { o.rotation.z += dt * (0.4 + k * 1.4) * (si % 2 ? -1 : 1); });
      });
    },
    dispose() { geos.forEach((x) => x.dispose()); allMats.forEach((m) => m.dispose()); },
  };
}

export { GLOW_COLOR };
