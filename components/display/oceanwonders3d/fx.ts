import * as THREE from 'three';
import { U, rng } from './kit';

interface Bubble { x: number; y: number; z: number; vy: number; s: number; ph: number; life: number; on: boolean }
interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; c: THREE.Color; s: number }
interface Ring { m: THREE.Mesh; life: number; r: number }

/** Bubbles, sparkles and growth rings. Soft, additive, and never a full-screen flash. */
export class Fx {
  readonly group = new THREE.Group();
  budget = 1;
  private bubbles: Bubble[] = [];
  private inst: THREE.InstancedMesh;
  private vents: THREE.Vector3[] = [];
  private ventT = 0;
  private sparks: Spark[] = [];
  private sparkPts: THREE.Points;
  private rings: Ring[] = [];
  private m4 = new THREE.Matrix4();
  private r = rng(77);
  constructor(maxBubbles = 420, maxSparks = 360) {
    const bg = new THREE.SphereGeometry(0.5, 10, 8);
    const bm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * instanceMatrix * vec4(position,1.0); vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float rim = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = 0.04 + pow(rim, 2.6) * 0.62; gl_FragColor = vec4(mix(vec3(0.62,0.92,1.0), vec3(1.0), rim), a); }',
    });
    this.inst = new THREE.InstancedMesh(bg, bm, maxBubbles);
    this.inst.frustumCulled = false;
    this.inst.renderOrder = 5;
    for (let i = 0; i < maxBubbles; i++) this.bubbles.push({ x: 0, y: -999, z: 0, vy: 0, s: 0, ph: 0, life: 0, on: false });
    this.inst.count = maxBubbles;
    this.group.add(this.inst);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxSparks * 3), 3));
    sg.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(maxSparks * 4), 4));
    for (let i = 0; i < maxSparks; i++) this.sparks.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, c: new THREE.Color(), s: 1 });
    const sm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute vec4 aCol; varying vec4 vC; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aCol.a * 380.0 / -mv.z, 1.0, 90.0); }',
      fragmentShader: 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.0); gl_FragColor = vec4(vC.rgb, a * 0.8); }',
    });
    this.sparkPts = new THREE.Points(sg, sm);
    this.sparkPts.frustumCulled = false;
    this.sparkPts.renderOrder = 6;
    this.group.add(this.sparkPts);
  }
  setVents(v: THREE.Vector3[]) { this.vents = v; }
  bubbleBurst(x: number, y: number, z: number, n: number, spread = 3) {
    for (let k = 0; k < Math.round(n * this.budget); k++) {
      const b = this.bubbles.find((q) => !q.on);
      if (!b) return;
      b.on = true; b.x = x + (this.r() - 0.5) * spread; b.y = y + this.r() * 1.5; b.z = z + (this.r() - 0.5) * spread; b.vy = 2.2 + this.r() * 2.2; b.s = 0.22 + this.r() * 0.5; b.ph = this.r() * 6.3; b.life = 0;
    }
  }
  sparkle(x: number, y: number, z: number, n: number, spread = 6, color = '#ffe9a8', up = 1.2) {
    const c = new THREE.Color(color);
    for (let k = 0; k < Math.round(n * this.budget); k++) {
      const s = this.sparks.find((q) => q.life <= 0);
      if (!s) return;
      s.x = x + (this.r() - 0.5) * spread; s.y = y + (this.r() - 0.5) * spread * 0.5; s.z = z + (this.r() - 0.5) * spread;
      s.vx = (this.r() - 0.5) * 0.8; s.vy = up * (0.5 + this.r()); s.vz = (this.r() - 0.5) * 0.8; s.max = s.life = 1.6 + this.r() * 1.8; s.c.copy(c).lerp(new THREE.Color('#ffffff'), this.r() * 0.5); s.s = 0.5 + this.r() * 1.1;
    }
  }
  ring(x: number, y: number, z: number, radius: number) {
    if (this.budget < 0.5 && this.rings.length > 2) return;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: '#bff4ff', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.25, z);
    this.group.add(m);
    this.rings.push({ m, life: 1.6, r: radius });
  }
  update(dt: number) {
    U.time.value += 0; // time is advanced by the scene
    this.ventT += dt;
    if (this.vents.length && this.ventT > 0.28) { this.ventT = 0; for (const v of this.vents) if (this.r() < 0.7 * this.budget) this.bubbleBurst(v.x, v.y, v.z, 1, 0.6); }
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      if (!b.on) { this.m4.makeScale(0, 0, 0).setPosition(0, -999, 0); this.inst.setMatrixAt(i, this.m4); continue; }
      b.life += dt; b.y += b.vy * dt; b.x += Math.sin(b.life * 2 + b.ph) * 0.35 * dt; b.vy += 0.4 * dt;
      if (b.y > 70 || b.life > 22) b.on = false;
      const s = b.s * Math.min(1, b.life * 3);
      this.m4.makeScale(s, s, s).setPosition(b.x, b.y, b.z);
      this.inst.setMatrixAt(i, this.m4);
    }
    this.inst.instanceMatrix.needsUpdate = true;
    const pos = this.sparkPts.geometry.attributes.position as THREE.BufferAttribute, col = this.sparkPts.geometry.attributes.aCol as THREE.BufferAttribute;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (s.life > 0) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; }
      const f = s.life > 0 ? Math.sin(Math.PI * (1 - s.life / s.max)) : 0;
      pos.setXYZ(i, s.x, s.life > 0 ? s.y : -999, s.z);
      col.setXYZW(i, s.c.r, s.c.g, s.c.b, s.s * f);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const q = this.rings[i];
      q.life -= dt;
      const k = 1 - q.life / 1.6;
      q.m.scale.setScalar(Math.max(0.01, k * q.r));
      (q.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 * (1 - k));
      if (q.life <= 0) { this.group.remove(q.m); q.m.geometry.dispose(); (q.m.material as THREE.Material).dispose(); this.rings.splice(i, 1); }
    }
  }
  dispose() {
    this.inst.geometry.dispose(); (this.inst.material as THREE.Material).dispose();
    this.sparkPts.geometry.dispose(); (this.sparkPts.material as THREE.Material).dispose();
    this.rings.forEach((q) => { q.m.geometry.dispose(); (q.m.material as THREE.Material).dispose(); });
  }
}
