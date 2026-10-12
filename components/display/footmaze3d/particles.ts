import * as THREE from 'three';
import type { StarFx } from '@/lib/footmaze3d/stages';

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

  /** A burst of the stage's own flavour at world position (x, z); `scale` shrinks it for reduced effects. */
  burst(x: number, z: number, fx: StarFx, colors: number[], scale = 1, big = false) {
    const c = (i: number) => new THREE.Color(colors[i % colors.length]);
    const R = Math.random;
    const n = Math.round((big ? 90 : 46) * scale);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.2832, sp = 0.8 + R() * 2.2;
      const dx = Math.cos(a), dz = Math.sin(a);
      switch (fx) {
        case 'sparkle': case 'bells': case 'crystals':
          this.spawn(x, 0.5, z, dx * sp, 1.2 + R() * 1.6, dz * sp, c(i), 0.14 + R() * 0.16, 0.9 + R() * 0.7, 0, 1.4); break;
        case 'confetti':
          this.spawn(x, 0.6, z, dx * sp * 1.2, 2.2 + R() * 2.2, dz * sp * 1.2, c(i), 0.12 + R() * 0.07, 1.3 + R() * 0.8, 1, 3.2); break;
        case 'petals': case 'butterflies':
          this.spawn(x, 0.6, z, dx * sp * 0.8, 0.8 + R() * 1.2, dz * sp * 0.8, c(i), 0.15 + R() * 0.1, 1.6 + R() * 0.9, 1, 0.9); break;
        case 'bubbles':
          this.spawn(x + dx * 0.2, 0.3, z + dz * 0.2, dx * sp * 0.4, 0.8 + R() * 1.2, dz * sp * 0.4, c(i), 0.16 + R() * 0.2, 1.5 + R() * 1.0, 2, -0.5); break;
        case 'fireworks': {
          const ring = i < n * 0.7;
          this.spawn(x, 1.1, z, dx * (ring ? 2.6 : sp), (ring ? 0.2 : 1.5) + (R() - 0.5) * (ring ? 0.6 : 1.4), dz * (ring ? 2.6 : sp), c(i % 3 === 0 ? i + 1 : i), 0.14 + R() * 0.1, 1.0 + R() * 0.7, 0, 1.6); break;
        }
        case 'fireflies':
          this.spawn(x + dx * 0.3, 0.4, z + dz * 0.3, dx * sp * 0.3, 0.5 + R() * 0.9, dz * sp * 0.3, c(i), 0.2 + R() * 0.2, 1.8 + R() * 1.2, 0, -0.1); break;
        case 'grand': {
          const k = i % 3;
          this.spawn(x, 0.8, z, dx * sp * (k === 1 ? 1.5 : 1), (k === 1 ? 3.4 : 1.2) + R() * 1.6, dz * sp * (k === 1 ? 1.5 : 1), c(i), k === 1 ? 0.13 : 0.16 + R() * 0.14, 1.2 + R() * 0.8, k === 1 ? 1 : 0, k === 1 ? 3.2 : 1.6); break;
        }
      }
    }
  }

  /** A sweeping celebration: fireworks / confetti over the whole area. */
  celebrate(fx: StarFx, colors: number[], area: [number, number], scale = 1, final = false) {
    const shots = final ? 9 : 5;
    for (let k = 0; k < shots; k++) {
      const x = (Math.random() * 2 - 1) * area[0], z = (Math.random() * 2 - 1) * area[1];
      this.burst(x, z, k % 2 ? 'fireworks' : fx === 'fireworks' || fx === 'grand' ? 'grand' : fx, colors, scale * 0.9, true);
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
