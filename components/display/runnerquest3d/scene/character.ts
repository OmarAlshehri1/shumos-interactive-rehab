import * as THREE from "three";
import type { Own } from "./own";

export interface CharacterState {
  speed: number;
  /** Lateral velocity, lane units / s. */
  lateralVel: number;
  /** 0..1 progress of a step-over hop, or null. */
  hop: number | null;
  /** 0..1 progress of a celebration, or 0. */
  celebrate: number;
  mood: "run" | "idle" | "celebrate";
  reducedMotion: boolean;
}

const sat = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/**
 * A procedural, articulated 3D runner (original design: teal jacket, orange backpack,
 * yellow scarf). No external assets, so there is nothing to license or fail to load.
 * Faces -Z. All animation is driven by `update`.
 */
export class RunnerCharacter {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso: THREE.Group;
  private head: THREE.Group;
  private scarf: THREE.Mesh;
  private armL: { s: THREE.Group; e: THREE.Group };
  private armR: { s: THREE.Group; e: THREE.Group };
  private legL: { h: THREE.Group; k: THREE.Group; f: THREE.Mesh };
  private legR: { h: THREE.Group; k: THREE.Group; f: THREE.Mesh };
  private phase = 0;
  private t = 0;
  private cur = { hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, armL: 0, armR: 0, elbow: 0, lift: 0, lean: 0, roll: 0, up: 0 };

  constructor(own: Own) {
    const skin = own.mat(new THREE.MeshStandardMaterial({ color: 0xdba27a, roughness: 0.65 }));
    const hair = own.mat(new THREE.MeshStandardMaterial({ color: 0x2c1d18, roughness: 0.8 }));
    const jacket = own.mat(new THREE.MeshStandardMaterial({ color: 0x1fb1a6, roughness: 0.55 }));
    const jacketDark = own.mat(new THREE.MeshStandardMaterial({ color: 0x15877f, roughness: 0.6 }));
    const pants = own.mat(new THREE.MeshStandardMaterial({ color: 0x334e8c, roughness: 0.7 }));
    const shoe = own.mat(new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.5 }));
    const sole = own.mat(new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.6 }));
    const pack = own.mat(new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.6 }));
    const packDark = own.mat(new THREE.MeshStandardMaterial({ color: 0xd9632a, roughness: 0.6 }));
    const scarfMat = own.mat(new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.6, side: THREE.DoubleSide }));
    const band = own.mat(new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.6 }));
    const cap = (r: number, l: number) => own.geom(new THREE.CapsuleGeometry(r, l, 5, 12));
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
    };

    // torso (pelvis pivot at y~0.95)
    this.torso = new THREE.Group(); this.torso.position.y = 0.96; this.body.add(this.torso);
    const chest = add(this.torso, cap(0.27, 0.34), jacket, 0, 0.36, 0); chest.scale.set(1.08, 1, 0.78);
    add(this.torso, cap(0.255, 0.08), jacketDark, 0, 0.06, 0).scale.set(1.1, 1, 0.8);
    const pk = add(this.torso, own.geom(new THREE.BoxGeometry(0.42, 0.5, 0.2)), pack, 0, 0.42, 0.27);
    pk.geometry.translate(0, 0, 0);
    add(this.torso, own.geom(new THREE.BoxGeometry(0.34, 0.16, 0.06)), packDark, 0, 0.58, 0.39);
    add(this.torso, own.geom(new THREE.BoxGeometry(0.05, 0.5, 0.05)), packDark, -0.14, 0.45, -0.19).scale.z = 0.4;
    add(this.torso, own.geom(new THREE.BoxGeometry(0.05, 0.5, 0.05)), packDark, 0.14, 0.45, -0.19).scale.z = 0.4;

    // head
    this.head = new THREE.Group(); this.head.position.y = 0.98; this.torso.add(this.head);
    add(this.head, own.geom(new THREE.SphereGeometry(0.235, 24, 18)), skin, 0, 0, 0);
    add(this.head, own.geom(new THREE.SphereGeometry(0.255, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62)), hair, 0, 0.02, 0.025);
    add(this.head, own.geom(new THREE.TorusGeometry(0.245, 0.032, 8, 28)), band, 0, 0.065, 0.0).rotation.x = Math.PI / 2;
    // little band knot at the back of the head
    add(this.head, own.geom(new THREE.SphereGeometry(0.05, 10, 8)), band, 0.0, 0.05, 0.255);

    // scarf trail
    const tail = own.geom(new THREE.PlaneGeometry(0.13, 0.42).translate(0, -0.21, 0));
    this.scarf = add(this.torso, tail, scarfMat, 0.12, 0.84, 0.2);
    add(this.torso, own.geom(new THREE.TorusGeometry(0.2, 0.05, 8, 18)), scarfMat, 0, 0.8, 0).rotation.x = Math.PI / 2;

    const mkArm = (side: number) => {
      const s = new THREE.Group(); s.position.set(side * 0.36, 0.62, 0); this.torso.add(s);
      add(s, cap(0.085, 0.2), jacket, 0, -0.17, 0);
      const e = new THREE.Group(); e.position.y = -0.34; s.add(e);
      add(e, cap(0.075, 0.2), jacketDark, 0, -0.15, 0);
      add(e, own.geom(new THREE.SphereGeometry(0.085, 12, 10)), skin, 0, -0.3, 0);
      return { s, e };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    const mkLeg = (side: number) => {
      const h = new THREE.Group(); h.position.set(side * 0.15, 0.96, 0); this.body.add(h);
      add(h, cap(0.115, 0.26), pants, 0, -0.24, 0);
      const k = new THREE.Group(); k.position.y = -0.5; h.add(k);
      add(k, cap(0.095, 0.26), pants, 0, -0.22, 0);
      const f = add(k, own.geom(new THREE.CapsuleGeometry(0.1, 0.18, 4, 10)), shoe, 0, -0.5, -0.08);
      f.rotation.x = Math.PI / 2; f.scale.set(1, 1, 0.75);
      const so = add(k, own.geom(new THREE.CapsuleGeometry(0.1, 0.16, 3, 10)), sole, 0, -0.545, -0.075);
      so.rotation.x = Math.PI / 2; so.scale.set(1.02, 1.04, 0.32); so.castShadow = false;
      return { h, k, f };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    this.root.add(this.body);
    this.root.scale.setScalar(1.18);
  }

  update(dt: number, s: CharacterState): void {
    this.t += dt;
    const c = this.cur;
    const running = s.mood === "run" && s.speed > 0.15;
    const reduce = s.reducedMotion;
    const cadence = 2.9 * Math.max(0.7, s.speed);
    if (running) this.phase += dt * cadence;
    const sw = Math.sin(this.phase);
    const amp = running ? lerp(0.5, 0.95, sat((s.speed - 0.8) / 3)) * (reduce ? 0.85 : 1) : 0;
    const kneeAmp = running ? lerp(0.55, 1.2, sat((s.speed - 0.8) / 3)) : 0;
    const rate = 14;
    let hipL = sw * amp, hipR = -sw * amp;
    let kneeL = -Math.max(0, Math.sin(this.phase + 1.2)) * kneeAmp, kneeR = -Math.max(0, Math.sin(this.phase + Math.PI + 1.2)) * kneeAmp;
    let armL = -sw * amp * 0.9, armR = sw * amp * 0.9;
    let elbow = running ? -0.9 : -0.15;
    const lift = running ? Math.abs(Math.sin(this.phase)) * (reduce ? 0.02 : 0.05) : Math.sin(this.t * 1.6) * 0.008;
    let up = 0;
    if (s.hop !== null) {
      const p = s.hop;
      const arc = Math.sin(Math.PI * p);
      hipL = hipR = lerp(0.3, 1.25, arc); kneeL = kneeR = -lerp(0.4, 1.5, arc);
      armL = armR = lerp(0.2, 1.3, arc); elbow = -0.6;
      up = arc * 0.95;
    } else if (s.celebrate > 0) {
      const p = s.celebrate;
      armL = armR = 2.7 + Math.sin(this.t * 9) * 0.12; elbow = -0.25;
      up = Math.abs(Math.sin(p * Math.PI * 3)) * 0.22 * (reduce ? 0.4 : 1);
      hipL = hipR = 0.05; kneeL = kneeR = -0.1;
    } else if (!running) {
      hipL = hipR = 0; kneeL = kneeR = 0; armL = armR = Math.sin(this.t * 1.6) * 0.04; elbow = -0.12;
    }
    c.hipL = damp(c.hipL, hipL, rate, dt); c.hipR = damp(c.hipR, hipR, rate, dt);
    c.kneeL = damp(c.kneeL, kneeL, rate, dt); c.kneeR = damp(c.kneeR, kneeR, rate, dt);
    c.armL = damp(c.armL, armL, rate, dt); c.armR = damp(c.armR, armR, rate, dt);
    c.elbow = damp(c.elbow, elbow, rate, dt);
    c.lift = damp(c.lift, lift, 18, dt);
    c.up = damp(c.up, up, 22, dt);
    c.roll = damp(c.roll, THREE.MathUtils.clamp(-s.lateralVel * 0.16, -0.32, 0.32), 9, dt);
    c.lean = damp(c.lean, running ? 0.1 + 0.03 * s.speed : 0, 6, dt);

    this.legL.h.rotation.x = c.hipL; this.legR.h.rotation.x = c.hipR;
    this.legL.k.rotation.x = c.kneeL; this.legR.k.rotation.x = c.kneeR;
    this.armL.s.rotation.x = c.armL; this.armR.s.rotation.x = c.armR;
    this.armL.e.rotation.x = c.elbow; this.armR.e.rotation.x = c.elbow;
    this.armL.s.rotation.z = 0.12; this.armR.s.rotation.z = -0.12;
    this.torso.rotation.x = -c.lean;
    this.torso.rotation.y = running ? sw * 0.12 * (reduce ? 0.5 : 1) : 0;
    this.body.position.y = c.lift + c.up;
    this.body.rotation.z = c.roll;
    this.head.rotation.x = c.lean * 0.7;
    this.scarf.rotation.x = 0.25 + (running ? 0.55 + 0.18 * Math.sin(this.t * 14) * (reduce ? 0.2 : 1) : 0);
    this.scarf.rotation.z = c.roll * 1.5 + (running && !reduce ? Math.sin(this.t * 11) * 0.15 : 0);
  }
}
