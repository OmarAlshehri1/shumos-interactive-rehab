import * as THREE from 'three';

/**
 * One pooled Points system for every burst (star collect, stage / final celebration). Particles are procedural
 * (round glow, square confetti, soft ring), so no texture is needed; a fixed pool keeps it allocation-free.
 */
const VERT = /* glsl */ `
attribute float aSize; attribute vec4 aColor; attribute float aShape;
uniform float uPx;
varying vec4 vColor; varying float vShape;
void main(){
  vColor = aColor; vShape = aShape;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(0.0, aSize * uPx);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying vec4 vColor; varying float vShape;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p); float a = 0.0;
  if (vShape < 0.5) { a = smoothstep(1.0, 0.0, r); a = a*a + (1.0 - smoothstep(0.0, 0.12, abs(p.x))) * (1.0 - smoothstep(0.0, 1.0, abs(p.y))) * 0.5 + (1.0 - smoothstep(0.0, 0.12, abs(p.y))) * (1.0 - smoothstep(0.0, 1.0, abs(p.x))) * 0.5; }
  else if (vShape < 1.5) { vec2 q = abs(p) - vec2(0.8, 0.5); a = 1.0 - smoothstep(0.0, 0.18, max(q.x, q.y)); }
  else { a = smoothstep(0.62, 0.8, r) * (1.0 - smoothstep(0.86, 1.0, r)); }
  a *= vColor.a;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

export class ParticlePool {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private shape: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private cursor = 0;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  alive = 0;

  constructor(capacity: number) {
    this.n = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.shape = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.grav = new Float32Array(capacity);
    this.pos.fill(0); for (let i = 0; i < capacity; i++) this.pos[i * 3 + 1] = -100;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, uniforms: { uPx: { value: 100 } } });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 50;
  }

  setPixelsPerUnit(v: number) { this.mat.uniforms.uPx.value = v; }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, shape: number, grav: number, alpha = 1) {
    const i = this.cursor++ % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = color.r; this.col[i * 4 + 1] = color.g; this.col[i * 4 + 2] = color.b; this.col[i * 4 + 3] = alpha;
    this.size[i] = size; this.shape[i] = shape; this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav;
  }

  /** A burst at world (x, y, z). `style` picks the flavour; `scale` shrinks it for reduced effects. */
  burst(x: number, y: number, z: number, colors: number[], style: 'spark' | 'ring' | 'confetti' | 'stream' = 'spark', scale = 1, big = false) {
    const c = (i: number) => new THREE.Color(colors[i % colors.length]);
    const R = Math.random;
    const n = Math.round((big ? 70 : 34) * scale);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.2832, sp = 0.8 + R() * 2.2;
      const dx = Math.cos(a), dz = Math.sin(a);
      switch (style) {
        case 'spark': this.spawn(x, y, z, dx * sp, 1.0 + R() * 1.6, dz * sp, c(i), 0.13 + R() * 0.14, 0.8 + R() * 0.7, 0, 1.4); break;
        case 'ring': this.spawn(x + dx * 0.2, y, z + dz * 0.2, dx * 2.6, 0.2 + (R() - 0.5) * 0.3, dz * 2.6, c(i), 0.14 + R() * 0.08, 0.9 + R() * 0.4, 0, 0.2); break;
        case 'confetti': this.spawn(x, y, z, dx * sp * 1.2, 2.2 + R() * 2.2, dz * sp * 1.2, c(i), 0.12 + R() * 0.07, 1.3 + R() * 0.8, 1, 3.2); break;
        case 'stream': this.spawn(x + (R() - 0.5) * 0.4, y, z + (R() - 0.5) * 0.4, (R() - 0.5) * 0.5, 1.4 + R() * 1.2, (R() - 0.5) * 0.5, c(i), 0.16 + R() * 0.1, 1.2 + R() * 0.8, 0, -0.1); break;
      }
    }
  }

  /** A sweeping celebration over the reward area (never over the stepping lanes). */
  celebrate(colors: number[], spots: [number, number][], scale = 1, final = false) {
    const shots = final ? spots.length * 2 : spots.length;
    for (let k = 0; k < shots; k++) {
      const [x, z] = spots[k % spots.length];
      this.burst(x, 1.2, z, colors, k % 2 ? 'confetti' : 'spark', scale * 0.9, true);
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = Math.exp(-dt * 0.9);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.col[i * 4 + 3] = Math.min(1, t * 2.4);
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -100; else alive++;
    }
    this.alive = alive;
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('aColor').needsUpdate = true;
    this.geo.getAttribute('aSize').needsUpdate = true;
    this.geo.getAttribute('aShape').needsUpdate = true;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
