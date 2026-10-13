import * as THREE from 'three';

/** Lightweight particle pools: soft dust puffs (normal blending) and glowing sparkles (additive). Everything is bounded and gentle. */
class Pool {
  readonly points: THREE.Points;
  private pos: Float32Array; private col: Float32Array; private siz: Float32Array; private alp: Float32Array;
  private vel: Float32Array; private life: Float32Array; private max: Float32Array; private grav: Float32Array; private base: Float32Array;
  private head = 0;
  constructor(private n: number, additive: boolean, private uScale: THREE.IUniform) {
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.siz = new Float32Array(n); this.alp = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n); this.base = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alp, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: THREE.Color, grav = 0) {
    const i = this.head; this.head = (this.head + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.base[i] = size; this.grav[i] = grav;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alp[i] = 0; this.siz[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = Math.exp(-dt * 0.9);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alp[i] = Math.min(1, k * 2.2) * Math.min(1, (1 - k) * 8 + 0.05);
      this.siz[i] = this.base[i] * (0.6 + (1 - k) * 0.8);
    }
    for (const a of ['position', 'aColor', 'aSize', 'aAlpha'] as const) (this.points.geometry.attributes[a] as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose() { this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose(); }
}

export class Fx {
  readonly group = new THREE.Group();
  private uScale = { value: 800 };
  private dustPool: Pool; private glow: Pool;
  private rings: { m: THREE.Mesh; age: number }[] = [];
  private rockets: { p: THREE.Vector3; v: THREE.Vector3; color: THREE.Color; t: number }[] = [];
  private tmp = new THREE.Color();
  budget = 1; // 0..1: reduced effects lowers it
  constructor() {
    this.dustPool = new Pool(500, false, this.uScale);
    this.glow = new Pool(1100, true, this.uScale);
    this.group.add(this.dustPool.points, this.glow.points);
  }
  setView(heightPx: number, fovDeg: number) { this.uScale.value = (heightPx * 0.5) / Math.tan((fovDeg * Math.PI) / 360); }
  /** Soft dust cloud where something is being built. */
  dust(x: number, y: number, z: number, radius = 3, n = 6) {
    for (let i = 0; i < Math.round(n * this.budget); i++) {
      const a = Math.random() * 6.28, s = Math.random() * radius;
      this.dustPool.emit(x + Math.cos(a) * s, y + 0.4, z + Math.sin(a) * s, Math.cos(a) * 0.9, 0.9 + Math.random() * 0.8, Math.sin(a) * 0.9, 1.6 + Math.random() * 0.8, 3.2 + Math.random() * 2.4, this.tmp.set('#efe6d6'));
    }
  }
  sparkle(x: number, y: number, z: number, n = 24, spread = 4, color = '#ffd966') {
    for (let i = 0; i < Math.round(n * this.budget); i++) {
      const a = Math.random() * 6.28, up = Math.random();
      this.glow.emit(x + (Math.random() - 0.5) * spread, y + Math.random() * 2, z + (Math.random() - 0.5) * spread, Math.cos(a) * 1.4, 2 + up * 4, Math.sin(a) * 1.4, 1.2 + Math.random() * 1.1, 1.3 + Math.random() * 1.2, this.tmp.set(color), 2.5);
    }
  }
  /** Golden ring that expands over the ground when a building completes. */
  ring(x: number, y: number, z: number, r = 6) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd966', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    m.position.set(x, y + 0.3, z); m.scale.setScalar(0.5); m.userData.r = r; m.renderOrder = 9;
    this.group.add(m); this.rings.push({ m, age: 0 });
  }
  firework(x: number, y: number, z: number, color: string) {
    const c = new THREE.Color(color), n = Math.round(46 * this.budget);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * 6.28, rr = Math.sqrt(1 - u * u), sp = 7 + Math.random() * 5;
      this.glow.emit(x, y, z, rr * Math.cos(a) * sp, u * sp, rr * Math.sin(a) * sp, 1.6 + Math.random() * 0.9, 1.7, c, 5);
    }
  }
  launch(x: number, z: number, y: number, color: string) { this.rockets.push({ p: new THREE.Vector3(x, 4, z), v: new THREE.Vector3((Math.random() - 0.5) * 3, 24 + Math.random() * 6, (Math.random() - 0.5) * 3), color: new THREE.Color(color), t: (y - 4) / 26 }); }
  confetti(cx: number, cy: number, cz: number, n = 40) {
    const pal = ['#ffd966', '#ff7aa8', '#7ad7ff', '#9be28a', '#ffffff'];
    for (let i = 0; i < Math.round(n * this.budget); i++) this.glow.emit(cx + (Math.random() - 0.5) * 70, cy + Math.random() * 10, cz + (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 2, -1 - Math.random() * 2, (Math.random() - 0.5) * 2, 4 + Math.random() * 2, 1.2, this.tmp.set(pal[i % 5]), -0.2);
  }
  update(dt: number) {
    this.dustPool.update(dt); this.glow.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.age += dt;
      const k = r.age / 1.4;
      r.m.scale.setScalar(0.5 + k * (r.m.userData.r as number));
      (r.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - k));
      if (k >= 1) { this.group.remove(r.m); r.m.geometry.dispose(); (r.m.material as THREE.Material).dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.p.addScaledVector(r.v, dt); r.v.y -= 6 * dt; r.t -= dt * 0.6;
      this.glow.emit(r.p.x, r.p.y, r.p.z, 0, -1, 0, 0.5, 1.0, r.color, 0);
      if (r.v.y <= 2) { this.firework(r.p.x, r.p.y, r.p.z, '#' + r.color.getHexString()); this.rockets.splice(i, 1); }
    }
  }
  dispose() { this.dustPool.dispose(); this.glow.dispose(); this.rings.forEach((r) => { r.m.geometry.dispose(); (r.m.material as THREE.Material).dispose(); }); }
}
