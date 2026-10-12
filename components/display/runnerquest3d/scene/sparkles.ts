import * as THREE from "three";
import type { Own } from "./own";
import { glowTexture } from "./textures";

const PER = 16;
const LIFE = 0.95;

/** A tiny pool of soft, gold star-dust bursts. Restrained: no flashing, short life, additive glow. */
export class Sparkles {
  readonly root = new THREE.Group();
  private bursts: { pts: THREE.Points; age: number; vel: Float32Array; active: boolean }[] = [];
  private next = 0;

  constructor(own: Own, count = 3) {
    const tex = glowTexture(own);
    for (let i = 0; i < count; i++) {
      const geo = own.geom(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PER * 3), 3));
      const mat = own.mat(new THREE.PointsMaterial({ size: 0.42, map: tex, color: 0xffd86b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false; pts.visible = false;
      this.root.add(pts);
      this.bursts.push({ pts, age: 99, vel: new Float32Array(PER * 3), active: false });
    }
  }

  spawn(x: number, y: number, z: number, color = 0xffd86b): void {
    const b = this.bursts[this.next++ % this.bursts.length];
    const pos = b.pts.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < PER; i++) {
      const a = (i / PER) * Math.PI * 2 + i * 0.7, r = 0.5 + (i % 4) * 0.22;
      pos.setXYZ(i, x, y, z);
      b.vel[i * 3] = Math.cos(a) * r; b.vel[i * 3 + 1] = 0.9 + (i % 5) * 0.28; b.vel[i * 3 + 2] = Math.sin(a) * r * 0.6;
    }
    pos.needsUpdate = true;
    (b.pts.material as THREE.PointsMaterial).color.setHex(color);
    b.age = 0; b.active = true; b.pts.visible = true;
  }

  update(dt: number): void {
    for (const b of this.bursts) {
      if (!b.active) continue;
      b.age += dt;
      if (b.age >= LIFE) { b.active = false; b.pts.visible = false; continue; }
      const pos = b.pts.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PER; i++) pos.setXYZ(i, pos.getX(i) + b.vel[i * 3] * dt, pos.getY(i) + b.vel[i * 3 + 1] * dt, pos.getZ(i) + b.vel[i * 3 + 2] * dt);
      pos.needsUpdate = true;
      const k = b.age / LIFE;
      (b.pts.material as THREE.PointsMaterial).opacity = 0.9 * Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 0.7 * (1 - k * 0.3);
    }
  }
}
