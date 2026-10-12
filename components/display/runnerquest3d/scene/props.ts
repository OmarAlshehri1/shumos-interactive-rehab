import * as THREE from "three";
import { LANE_WIDTH, type Encounter, type Lane } from "@/lib/runnerquest3d/types";
import { CHECKPOINT_AR, FINISH_AR } from "@/lib/runnerquest3d/arabic";
import type { Own } from "./own";
import { bannerTexture, glowTexture, rampTexture } from "./textures";

const laneX = (l: Lane) => l * LANE_WIDTH;

export interface PropHandle {
  group: THREE.Group;
  encounter: Encounter;
  /** Animated bits: pulsing glow / bar tint on armed. */
  bar?: THREE.Mesh;
  glow?: THREE.Mesh[];
  stripeMat?: THREE.MeshStandardMaterial;
}

/** Builds every prop for a stage once; visibility is toggled by distance. */
export class Props {
  readonly root = new THREE.Group();
  readonly handles: PropHandle[] = [];
  destination: THREE.Group | null = null;
  private fireworks?: THREE.Points;
  private own: Own;
  private glowTex: THREE.CanvasTexture;
  private ramp: THREE.CanvasTexture;
  private lanterns: THREE.Mesh[] = [];

  constructor(own: Own) {
    this.own = own;
    this.glowTex = glowTexture(own);
    this.ramp = rampTexture(own);
  }

  private std(color: number, rough = 0.7, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    return this.own.mat(new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra }));
  }
  private box(w: number, h: number, d: number) { return this.own.geom(new THREE.BoxGeometry(w, h, d)); }
  private mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true) {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; return o;
  }

  /** Soft warning pad on the ground ahead of a blocked lane. */
  private pad(color: number, lane: Lane, width: number, length: number, opacity: number): THREE.Mesh {
    const g = this.own.geom(new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2));
    const m = this.own.mat(new THREE.MeshBasicMaterial({ color, map: this.ramp, transparent: true, opacity, depthWrite: false }));
    const p = new THREE.Mesh(g, m);
    p.position.set(laneX(lane), 0.035, length / 2 - 0.2);
    return p;
  }

  private rock(own: Own, lane: Lane, seed: number): THREE.Group {
    const g = new THREE.Group();
    const stone = this.std(0x8d8f93, 0.92), moss = this.std(0x4f9a4c, 0.9), flag = this.std(0xff7a1a, 0.6, { emissive: 0xff7a1a, emissiveIntensity: 0.25 });
    const big = this.mesh(own.geom(new THREE.IcosahedronGeometry(0.95, 1)), stone, laneX(lane), 0.78, 0); big.scale.set(1.05, 0.95, 0.9); big.rotation.y = seed;
    const small = this.mesh(own.geom(new THREE.IcosahedronGeometry(0.55, 1)), stone, laneX(lane) + 0.62, 0.42, 0.35); small.rotation.y = seed * 2;
    const top = this.mesh(own.geom(new THREE.SphereGeometry(0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4)), moss, laneX(lane) - 0.08, 1.38, 0); top.scale.set(1, 0.7, 0.85);
    const pole = this.mesh(this.own.geom(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6)), this.std(0xe9e3d6), laneX(lane) + 0.1, 2.05, 0);
    const fl = this.mesh(this.own.geom(new THREE.PlaneGeometry(0.55, 0.34)), this.own.mat(new THREE.MeshStandardMaterial({ color: 0xff7a1a, side: THREE.DoubleSide, emissive: 0xff7a1a, emissiveIntensity: 0.3 })), laneX(lane) + 0.38, 2.4, 0);
    void flag;
    g.add(big, small, top, pole, fl);
    return g;
  }

  private logBarrier(lane: Lane): THREE.Group {
    const g = new THREE.Group();
    const wood = this.std(0xa5703e, 0.85), band = this.std(0xff7a1a, 0.6, { emissive: 0xff7a1a, emissiveIntensity: 0.2 }), light = this.std(0xfff4de, 0.6);
    const logG = this.own.geom(new THREE.CylinderGeometry(0.24, 0.24, LANE_WIDTH - 0.5, 12).rotateZ(Math.PI / 2));
    g.add(this.mesh(logG, wood, laneX(lane), 0.26, 0.12), this.mesh(logG, wood, laneX(lane), 0.26, -0.32), this.mesh(logG, wood, laneX(lane), 0.72, -0.1));
    const stripeG = this.box(0.34, 0.18, 0.14);
    for (let i = 0; i < 4; i++) g.add(this.mesh(stripeG, i % 2 ? light : band, laneX(lane) - 0.78 + i * 0.52, 0.99, -0.1));
    for (const sx of [-1, 1]) g.add(this.mesh(this.box(0.16, 1.15, 0.16), wood, laneX(lane) + sx * 0.88, 0.58, -0.1));
    return g;
  }

  private hurdle(width: number, centerX: number): { g: THREE.Group; bar: THREE.Mesh; stripe: THREE.MeshStandardMaterial } {
    const g = new THREE.Group();
    const post = this.std(0xf4efe4, 0.6);
    const stripe = this.std(0xff7a1a, 0.55, { emissive: 0xff7a1a, emissiveIntensity: 0.22 });
    const nSeg = Math.max(2, Math.round(width / 0.45));
    const segW = (width - 0.3) / nSeg;
    const bar = this.mesh(this.box(width - 0.2, 0.22, 0.22), this.std(0xf4efe4, 0.5), centerX, 0.62, 0);
    g.add(bar);
    for (let i = 0; i < nSeg; i += 2) g.add(this.mesh(this.box(segW + 0.002, 0.225, 0.225), stripe, centerX - (width - 0.3) / 2 + segW * (i + 0.5) + 0.05, 0.62, 0));
    for (const sx of [-1, 1]) {
      g.add(this.mesh(this.box(0.2, 0.9, 0.2), post, centerX + sx * (width / 2 - 0.12), 0.45, 0));
      g.add(this.mesh(this.box(0.3, 0.07, 0.5), post, centerX + sx * (width / 2 - 0.12), 0.035, 0));
      g.add(this.mesh(this.own.geom(new THREE.SphereGeometry(0.11, 10, 8)), stripe, centerX + sx * (width / 2 - 0.12), 0.97, 0));
    }
    return { g, bar, stripe };
  }

  private fence(lane: Lane): THREE.Group {
    const g = new THREE.Group();
    const wood = this.std(0xe8d7b6, 0.8);
    const w = LANE_WIDTH - 0.2;
    for (let i = 0; i < 7; i++) g.add(this.mesh(this.box(0.2, 1.15 + (i % 2) * 0.08, 0.1), wood, laneX(lane) - w / 2 + (i + 0.5) * (w / 7), 0.6, 0));
    g.add(this.mesh(this.box(w, 0.1, 0.1), wood, laneX(lane), 0.4, 0.05), this.mesh(this.box(w, 0.1, 0.1), wood, laneX(lane), 0.85, 0.05));
    return g;
  }

  private archGate(lane: Lane): { g: THREE.Group; glow: THREE.Mesh[] } {
    const g = new THREE.Group();
    const teal = this.std(0x14b8a6, 0.4, { emissive: 0x14b8a6, emissiveIntensity: 0.45 }), gold = this.std(0xffd23f, 0.4, { emissive: 0xffc400, emissiveIntensity: 0.4 });
    for (const sx of [-1, 1]) g.add(this.mesh(this.box(0.24, 2.7, 0.24), teal, laneX(lane) + sx * (LANE_WIDTH / 2 - 0.1), 1.35, 0));
    g.add(this.mesh(this.box(LANE_WIDTH + 0.1, 0.28, 0.28), teal, laneX(lane), 2.75, 0));
    const star = this.mesh(this.own.geom(new THREE.OctahedronGeometry(0.28)), gold, laneX(lane), 3.2, 0, false); star.scale.y = 1.3; g.add(star);
    const col = this.mesh(this.own.geom(new THREE.CylinderGeometry(LANE_WIDTH * 0.46, LANE_WIDTH * 0.46, 2.6, 24, 1, true).translate(0, 1.3, 0)), this.own.mat(new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })), laneX(lane), 0, 0, false);
    const pad = this.pad(0x2dd4bf, lane, LANE_WIDTH - 0.3, 14, 0.5);
    g.add(col, pad);
    return { g, glow: [col, pad, star] };
  }

  private marker(lane: Lane): { g: THREE.Group; glow: THREE.Mesh[] } {
    const g = new THREE.Group();
    const ring = this.mesh(this.own.geom(new THREE.TorusGeometry(0.92, 0.13, 10, 40).rotateX(-Math.PI / 2)), this.std(0xffd23f, 0.4, { emissive: 0xffc400, emissiveIntensity: 0.55 }), laneX(lane), 0.07, 0, false);
    const disc = this.mesh(this.own.geom(new THREE.CircleGeometry(0.92, 36).rotateX(-Math.PI / 2)), this.own.mat(new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.55, depthWrite: false })), laneX(lane), 0.04, 0, false);
    const shape = new THREE.Shape(); shape.moveTo(0, 0.5); shape.lineTo(0.42, -0.2); shape.lineTo(0.16, -0.2); shape.lineTo(0.16, -0.5); shape.lineTo(-0.16, -0.5); shape.lineTo(-0.16, -0.2); shape.lineTo(-0.42, -0.2); shape.closePath();
    const arrow = this.mesh(this.own.geom(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2)), this.own.mat(new THREE.MeshBasicMaterial({ color: 0xff9a1a, side: THREE.DoubleSide })), laneX(lane), 0.06, 0, false);
    arrow.scale.setScalar(1.5);
    const beam = this.mesh(this.own.geom(new THREE.CylinderGeometry(0.85, 0.85, 3.2, 24, 1, true).translate(0, 1.6, 0)), this.own.mat(new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })), laneX(lane), 0, 0, false);
    const star = this.mesh(this.own.geom(new THREE.OctahedronGeometry(0.3)), this.std(0xffd23f, 0.4, { emissive: 0xffc400, emissiveIntensity: 0.6 }), laneX(lane), 3.0, 0, false);
    star.scale.y = 1.3;
    g.add(ring, disc, arrow, beam, star);
    return { g, glow: [ring, disc, star] };
  }

  private flags(width: number, y: number, count: number): THREE.Group {
    const g = new THREE.Group();
    const colors = [0xff6b6b, 0xffd23f, 0x4dd0e1, 0x7be08f, 0xb28cff];
    const fg = this.own.geom((() => { const s = new THREE.Shape(); s.moveTo(-0.22, 0); s.lineTo(0.22, 0); s.lineTo(0, -0.5); s.closePath(); return new THREE.ShapeGeometry(s); })());
    for (let i = 0; i < count; i++) {
      const m = this.own.mat(new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 0.7 }));
      const f = new THREE.Mesh(fg, m); f.position.set(-width / 2 + (i + 0.5) * (width / count), y - Math.sin((i / count) * Math.PI) * 0.0, 0); g.add(f);
    }
    return g;
  }

  private checkpoint(): THREE.Group {
    const g = new THREE.Group();
    const w = LANE_WIDTH * 3 + 1.6;
    const wood = this.std(0xf0e6cf, 0.6), accent = this.std(0x14b8a6, 0.45, { emissive: 0x14b8a6, emissiveIntensity: 0.3 });
    for (const sx of [-1, 1]) {
      g.add(this.mesh(this.box(0.32, 3.4, 0.32), wood, sx * (w / 2), 1.7, 0), this.mesh(this.own.geom(new THREE.SphereGeometry(0.28, 14, 10)), accent, sx * (w / 2), 3.5, 0));
    }
    g.add(this.mesh(this.box(w + 0.4, 0.3, 0.3), accent, 0, 3.15, 0));
    const tex = bannerTexture(this.own, CHECKPOINT_AR.split(" — ")[0], "#14b8a6");
    const plane = this.mesh(this.own.geom(new THREE.PlaneGeometry(4.6, 1.15)), this.own.mat(new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })), 0, 3.95, 0.05, false);
    plane.rotation.y = Math.PI; // text faces the camera behind the runner? (camera is at +z looking -z; plane normal +z faces camera)
    plane.rotation.y = 0;
    g.add(plane);
    const bunting = this.flags(w, 2.95, 16); g.add(bunting);
    return g;
  }

  /** Finish destination; the final stage gets a fuller festival. */
  private makeDestination(theme: string, final: boolean): THREE.Group {
    const g = new THREE.Group();
    const stone = this.std(0xe9e2d2, 0.8), roof = this.std(0xd9534a, 0.6), gold = this.std(0xffd23f, 0.4, { emissive: 0xffc400, emissiveIntensity: 0.35 }), teal = this.std(0x14b8a6, 0.5);
    // plaza
    g.add(this.mesh(this.own.geom(new THREE.CylinderGeometry(9, 9.4, 0.3, 40)), this.std(0xe8d9b6, 0.9), 0, 0.15, -8, false));
    // finish arch
    const w = LANE_WIDTH * 3 + 2.4;
    for (const sx of [-1, 1]) g.add(this.mesh(this.box(0.55, 4.6, 0.55), stone, sx * (w / 2), 2.3, 0), this.mesh(this.own.geom(new THREE.SphereGeometry(0.5, 16, 12)), gold, sx * (w / 2), 4.85, 0));
    g.add(this.mesh(this.box(w + 1, 0.55, 0.6), teal, 0, 4.5, 0));
    const tex = bannerTexture(this.own, FINISH_AR, "#ff8a3d");
    g.add(this.mesh(this.own.geom(new THREE.PlaneGeometry(6.4, 1.6)), this.own.mat(new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })), 0, 5.6, 0.05, false));
    g.add(this.flags(w + 1, 4.2, 20));
    // fountain (all stages)
    const water = this.own.mat(new THREE.MeshStandardMaterial({ color: 0x57c7f0, roughness: 0.1, transparent: true, opacity: 0.9 }));
    g.add(this.mesh(this.own.geom(new THREE.CylinderGeometry(2.6, 2.8, 0.6, 28)), stone, 0, 0.6, -10));
    g.add(this.mesh(this.own.geom(new THREE.CylinderGeometry(2.3, 2.3, 0.1, 28)), water, 0, 0.88, -10, false));
    g.add(this.mesh(this.own.geom(new THREE.CylinderGeometry(0.3, 0.45, 1.8, 12)), stone, 0, 1.6, -10));
    g.add(this.mesh(this.own.geom(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), water, 0, 2.5, -10));
    if (theme === "festival" || final) {
      // pavilion
      g.add(this.mesh(this.own.geom(new THREE.CylinderGeometry(6.5, 6.8, 0.6, 8)), stone, 0, 0.3, -24));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(this.mesh(this.own.geom(new THREE.CylinderGeometry(0.28, 0.32, 5, 10)), stone, Math.cos(a) * 5.6, 3.1, -24 + Math.sin(a) * 5.6)); }
      g.add(this.mesh(this.own.geom(new THREE.ConeGeometry(7.6, 3.4, 8)), roof, 0, 7.4, -24));
      g.add(this.mesh(this.own.geom(new THREE.SphereGeometry(0.5, 14, 10)), gold, 0, 9.4, -24));
      // lanterns
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2, l = this.mesh(this.own.geom(new THREE.SphereGeometry(0.28, 12, 10)), this.std([0xff7a59, 0xffd23f, 0x5eead4, 0xff9ec4][i % 4], 0.4, { emissive: [0xff7a59, 0xffd23f, 0x5eead4, 0xff9ec4][i % 4], emissiveIntensity: 0.8 }), Math.cos(a) * 8, 3.3 + (i % 3) * 0.4, -24 + Math.sin(a) * 8, false);
        this.lanterns.push(l); g.add(l);
      }
      // soft fireworks: slow glowing sparks
      const n = 90, pos = new Float32Array(n * 3);
      const geo = this.own.geom(new THREE.BufferGeometry()); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.fireworks = new THREE.Points(geo, this.own.mat(new THREE.PointsMaterial({ size: 0.55, map: this.glowTex, color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })));
      this.fireworks.frustumCulled = false; this.fireworks.position.set(0, 10, -26); g.add(this.fireworks);
    }
    return g;
  }

  build(encounters: readonly Encounter[], length: number, theme: string, finalStage: boolean): void {
    for (let i = 0; i < encounters.length; i++) {
      const e = encounters[i];
      const group = new THREE.Group();
      const h: PropHandle = { group, encounter: e };
      if (e.kind === "side") {
        for (const l of e.lanes) { group.add(i % 2 === 0 ? this.rock(this.own, l, i + l) : this.logBarrier(l)); group.add(this.pad(0xff8a3d, l, LANE_WIDTH - 0.4, 12, 0.34)); }
      } else if (e.kind === "hurdle") {
        const full = e.lanes.length === 3;
        if (full) { const r = this.hurdle(LANE_WIDTH * 3 - 0.2, 0); group.add(r.g); h.bar = r.bar; h.stripeMat = r.stripe; } else for (const l of e.lanes) { const r = this.hurdle(LANE_WIDTH - 0.3, laneX(l)); group.add(r.g); h.bar = r.bar; h.stripeMat = r.stripe; }
        for (const l of e.lanes) group.add(this.pad(0xffb347, l, LANE_WIDTH - 0.4, 12, 0.3));
      } else if (e.kind === "gate") {
        const a = this.archGate(e.target as Lane); group.add(a.g); h.glow = a.glow;
        for (const l of e.lanes) group.add(this.fence(l));
      } else if (e.kind === "marker") {
        const m = this.marker(e.target as Lane); group.add(m.g); h.glow = m.glow;
      } else group.add(this.checkpoint());
      group.position.z = -e.z;
      group.visible = false;
      this.root.add(group);
      this.handles.push(h);
    }
    const dest = this.makeDestination(theme, finalStage);
    dest.position.z = -length;
    this.destination = dest;
    this.root.add(dest);
  }

  /** Per-frame: visibility window, armed/resolved tints, glow pulse, destination sparkle. */
  update(t: number, distance: number, armed: readonly boolean[], resolved: readonly boolean[], reduced: boolean): void {
    for (let i = 0; i < this.handles.length; i++) {
      const h = this.handles[i], ahead = h.encounter.z - distance;
      h.group.visible = ahead < 150 && ahead > -4.5;
      if (!h.group.visible) continue;
      if (h.stripeMat && (armed[i] || resolved[i])) { h.stripeMat.color.setHex(0x22c55e); h.stripeMat.emissive.setHex(0x22c55e); }
      if (h.glow && !reduced) {
        const k = 0.5 + 0.5 * Math.sin(t * 3);
        h.glow.forEach((m, j) => { if (j === 2) m.rotation.y = t * 1.4; if (m.material instanceof THREE.MeshBasicMaterial && j === 0 && m.geometry.type !== "TorusGeometry") m.material.opacity = 0.14 + 0.1 * k; });
      }
    }
    if (this.destination) this.destination.visible = this.destination.position.z - 0 > -1e9 && (-this.destination.position.z - distance) < 170;
    if (this.fireworks && this.destination?.visible && !reduced) {
      const a = this.fireworks.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        const burst = Math.floor(i / 30), ph = ((t * 0.35 + burst * 0.33) % 1);
        const ang = (i % 30) / 30 * Math.PI * 2, rad = ph * 5.5, dir = ((i * 7) % 11) / 11;
        a.setXYZ(i, (burst - 1) * 9 + Math.cos(ang) * rad * (0.6 + dir * 0.4), Math.sin(ang) * rad * (0.6 + dir * 0.4) - ph * ph * 2.5, 0);
      }
      a.needsUpdate = true;
      (this.fireworks.material as THREE.PointsMaterial).opacity = 0.75;
    }
    this.lanterns.forEach((l, i) => { l.position.y = 3.3 + (i % 3) * 0.4 + (reduced ? 0 : Math.sin(t * 1.4 + i) * 0.12); });
  }
}
