import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { LANES, type Config } from '@/lib/rhythmsteps3d/config';
import { applyShift, cameraFor, FAR_Z, type ArenaLayout } from '@/lib/rhythmsteps3d/layout';
import { progressOf, type Status, type Step } from '@/lib/rhythmsteps3d/engine';
import type { Foot, Target } from '@/lib/rhythmsteps3d/stages';
import { easeTheme, STAGE_THEMES, toColors, type ThemeColors } from './theme';
import { dotTexture, flareTexture, iconTexture, laneLabelTexture, numberTexture, type IconKey } from './textures';

/**
 * Rhythm Steps 3D renderer (child Display). Pure presentation: it draws the state it is given and decides nothing.
 *
 * The camera is fixed and the four near zones never move, rotate or resize; only incoming targets travel, and a
 * target's position is a pure function of (arrival - clock). Everything is procedural (no downloads): shaders,
 * instanced structures, pooled targets and pooled effects. Decorative glow is additive and kept well away from the
 * foot symbols, which are flat opaque decals lying on top of each target.
 */

/** World distance a target covers on its way to the line. */
const APPROACH = 62;
const TARGET_POOL = 16;
const LINK_POOL = 6;
const RING_POOL = 14;
const BEAM_POOL = 8;
const SPARK_POOL = 480;
const PILLARS = 44;
const BARS = 40;
const GATES = 6;
const PRISMS = 10;
const PARTICLES = 900;
const TARGET_Y = 0.14;

export interface DrawFrame {
  layout: ArenaLayout;
  config: Config;
  /** Visual game clock, ms. */
  clock: number;
  speed: number;
  stage: number;
  steps: readonly Step[];
  running: boolean;
  status: Status;
  connected: boolean;
}

export interface ArenaStats {
  calls: number;
  triangles: number;
  frameMs: number;
  targets: number;
  bloom: boolean;
  pixelRatio: number;
}

export interface Arena {
  draw(frame: DrawFrame, dtSec: number, nowSec: number): void;
  resize(width: number, height: number): void;
  hit(step: Step, assisted: boolean): void;
  soft(step: Step): void;
  celebrate(kind: 'stage' | 'final'): void;
  cue(): void;
  stats(): ArenaStats;
  dispose(): void;
}

const laneColor = (lane: number) => new THREE.Color(LANES[lane].hex);
const lerp = THREE.MathUtils.lerp;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const x = -w / 2, y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function slabGeometry(size: number, depth: number, bevel: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(roundedRect(size - bevel * 2, size - bevel * 2, size * 0.14), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}

function frameGeometry(size: number, thick: number): THREE.BufferGeometry {
  const outer = roundedRect(size, size, size * 0.14);
  const inner = new THREE.Path();
  const s = size - thick * 2;
  const r = size * 0.1;
  const x = -s / 2, y = -s / 2;
  inner.moveTo(x + r, y);
  inner.quadraticCurveTo(x, y, x, y + r);
  inner.lineTo(x, y + s - r);
  inner.quadraticCurveTo(x, y + s, x + r, y + s);
  inner.lineTo(x + s - r, y + s);
  inner.quadraticCurveTo(x + s, y + s, x + s, y + s - r);
  inner.lineTo(x + s, y + r);
  inner.quadraticCurveTo(x + s, y, x + s - r, y);
  inner.closePath();
  outer.holes.push(inner);
  const g = new THREE.ShapeGeometry(outer, 8);
  g.rotateX(-Math.PI / 2);
  return g;
}

const flat = (w: number, h: number) => {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateX(-Math.PI / 2);
  return g;
};

const SDF = /* glsl */ `
float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;

function glowMaterial(color: THREE.Color, half: number, radius: number, power: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color.clone() }, uAmount: { value: 1 }, uHalf: { value: half }, uRadius: { value: radius }, uPower: { value: power } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAmount, uHalf, uRadius, uPower; varying vec2 vUv;
      ${SDF}
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;
        float d = sdBox(p, vec2(uHalf), uRadius);
        float g = exp(-max(d, 0.0) * uPower) * (1.0 - smoothstep(-0.08, 0.0, d) * 0.6);
        gl_FragColor = vec4(uColor * g * uAmount, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function zoneMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: color.clone() }, uEnergy: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 }, uAmount: { value: 1 }, uHalf: { value: 0.667 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uEnergy, uFlash, uTime, uAmount, uHalf; varying vec2 vUv;
      ${SDF}
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;
        float d = sdBox(p, vec2(uHalf), 0.14);
        float fill = 1.0 - smoothstep(-0.015, 0.0, d);
        float line = smoothstep(0.035, 0.0, abs(d + 0.045));
        float glow = exp(-max(d, 0.0) * 7.0);
        float inner = smoothstep(-0.55, 0.0, d);
        // slow chevrons that run toward the child inside the zone: "targets arrive here"
        float ch = smoothstep(0.42, 0.5, abs(fract((-p.y * 2.2 - abs(p.x) * 0.9) + uTime * 0.5) - 0.5)) * fill * 0.10;
        float sheen = smoothstep(0.2, 1.0, (p.y * 0.6 + 0.5) - abs(p.x) * 0.15) * 0.10;
        vec3 col = uColor * (0.16 + 0.42 * inner * (0.3 + uEnergy)) + uColor * ch + vec3(sheen) * fill * uColor;
        vec3 rim = mix(uColor, vec3(1.0), 0.55);
        col += rim * line * (0.55 + 0.45 * uEnergy + uFlash);
        col += uColor * glow * (0.45 + 0.8 * uEnergy + 1.2 * uFlash);
        col += vec3(1.0) * uFlash * 0.45 * fill;
        float a = clamp(fill * 0.82 + line + glow * 0.9, 0.0, 1.0);
        gl_FragColor = vec4(col * uAmount, a);
        #include <colorspace_fragment>
      }`,
  });
}

function ringMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uProgress: { value: 0 }, uColor: { value: new THREE.Color('#ffffff') }, uAmount: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uProgress, uAmount; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float t = fract(atan(p.x, -p.y) / 6.2831853 + 1.0);
        float band = smoothstep(0.70, 0.74, r) * (1.0 - smoothstep(0.90, 0.94, r));
        float lit = step(t, uProgress);
        float head = exp(-abs(t - uProgress) * 38.0) * step(0.001, uProgress);
        vec3 col = mix(vec3(0.25, 0.3, 0.5) * 0.7, uColor * 1.4 + vec3(0.3), lit) * band + vec3(1.0) * head * band;
        float glow = exp(-abs(r - 0.82) * 9.0) * lit * 0.5;
        gl_FragColor = vec4((col + uColor * glow) * uAmount, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

interface Slot {
  group: THREE.Group;
  body: THREE.Mesh;
  frame: THREE.Mesh;
  halo: THREE.Mesh;
  icon: THREE.Mesh;
  badge: THREE.Mesh;
  ring: THREE.Mesh;
  bodyMat: THREE.MeshStandardMaterial;
  frameMat: THREE.MeshBasicMaterial;
  haloMat: THREE.ShaderMaterial;
  iconMat: THREE.MeshBasicMaterial;
  badgeMat: THREE.MeshBasicMaterial;
  ringMat: THREE.ShaderMaterial;
  key: string | null;
  lane: number;
  icon$: IconKey | null;
  badge$: number;
  resolvedAt: number;
}

interface Fx {
  active: boolean;
  t0: number;
  life: number;
  x: number;
  z: number;
  scale: number;
}

interface Burst {
  at: number;
  x: number;
  z: number;
  color: THREE.Color;
  power: number;
}

export function createArena(canvas: HTMLCanvasElement, initial: { config: Config; layout: ArenaLayout; stage: number }): Arena {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  const high = initial.config.quality === 'high';
  const dpr = Math.min(window.devicePixelRatio || 1, high ? 2 : 1);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x05030f, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x2a0d55, 55, 135);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400);
  let layout = initial.layout;
  let config = initial.config;
  let worldKey = '';
  let viewW = canvas.clientWidth || 1280;
  let viewH = canvas.clientHeight || 720;

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0x9a8cff, 0x1a0a40, 0.7);
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
  keyLight.position.set(2, 14, 10);
  const pointA = new THREE.PointLight(0x18e0ff, 90, 40, 1.6);
  const pointB = new THREE.PointLight(0xff3df2, 90, 40, 1.6);
  scene.add(hemi, keyLight, pointA, pointB);

  // ---------- shared resources ----------
  const dot = dotTexture();
  const flare = flareTexture();
  const iconCache = new Map<IconKey, THREE.CanvasTexture>();
  const numCache = new Map<number, THREE.CanvasTexture>();
  const labelTex = LANES.map((l) => laneLabelTexture(l.id));
  const icon = (k: IconKey) => {
    let t = iconCache.get(k);
    if (!t) iconCache.set(k, (t = iconTexture(k, high ? 512 : 256)));
    return t;
  };
  const num = (n: number) => {
    let t = numCache.get(n);
    if (!t) numCache.set(n, (t = numberTexture(n)));
    return t;
  };

  const theme: ThemeColors = toColors(STAGE_THEMES[initial.stage]);
  let themeTarget: ThemeColors = toColors(STAGE_THEMES[initial.stage]);

  // ---------- sky ----------
  const skyMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uHorizonY: { value: 0.6 }, uTime: { value: 0 }, uAmount: { value: 1 }, uGlow: { value: new THREE.Color() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHor, uGlow; uniform float uHorizonY, uTime, uAmount; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        float y = vUv.y;
        float h = uHorizonY;
        vec3 col = mix(uHor, uMid, smoothstep(h - 0.02, h + 0.38, y));
        col = mix(col, uTop, smoothstep(h + 0.25, 1.0, y));
        // below the horizon the floor takes over; keep a deep tone for the gap behind it
        col = mix(col, uTop * 0.35, smoothstep(h - 0.02, h - 0.55, y));
        vec2 q = vUv - vec2(0.5, h);
        q.x *= 1.8;
        float glow = exp(-length(q) * 3.4);
        col += uGlow * glow * 0.55;
        // sparse stars
        vec2 g = floor(vUv * vec2(260.0, 150.0));
        float s = step(0.9965, hash(g)) * (0.5 + 0.5 * sin(uTime * 2.0 + hash(g + 3.0) * 20.0));
        col += vec3(s) * 0.45 * smoothstep(h, h + 0.4, y);
        float vig = smoothstep(1.25, 0.35, length((vUv - 0.5) * vec2(1.25, 1.0)));
        gl_FragColor = vec4(col * (0.55 + 0.45 * vig) * uAmount, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);

  // ---------- dynamic world (rebuilt when the layout changes) ----------
  const world = new THREE.Group();
  scene.add(world);
  const mirror = new THREE.Group();
  scene.add(mirror);

  let floorMat: THREE.ShaderMaterial | null = null;
  const zoneMats: THREE.ShaderMaterial[] = [];
  const zoneFlash: number[] = [];
  const pillarMat = new THREE.ShaderMaterial({
    uniforms: { uAmount: { value: 1 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vH;
      void main(){
        mat4 im = instanceMatrix;
        vec4 wp = modelMatrix * im * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * mat3(im) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vCol = instanceColor;
        vH = position.y + 0.5;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uAmount; varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vH;
      void main(){
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float top = smoothstep(0.7, 1.0, vH) * 0.45 + smoothstep(0.25, 0.0, vH) * 0.25;
        vec3 col = vCol * (0.22 + rim * 1.0 + top);
        col += vec3(1.0) * pow(rim, 3.0) * 0.5;
        gl_FragColor = vec4(col * uAmount, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const pillarGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
  const mirrorPillarMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
  let pillars: THREE.InstancedMesh | null = null;
  let pillarGlow: THREE.InstancedMesh | null = null;
  let pillarMirror: THREE.InstancedMesh | null = null;
  let bars: THREE.InstancedMesh | null = null;
  let gates: THREE.Mesh[] = [];
  let prisms: THREE.Mesh[] = [];
  let columns: THREE.Mesh[] = [];
  let pillarSeeds: { side: number; off: number; z0: number; h: number; w: number; hue: number }[] = [];
  let barSeeds: { x: number; y: number; z: number; h: number; sp: number; hue: number }[] = [];
  let farSlabs: THREE.Group | null = null;
  let flareSprite: THREE.Sprite | null = null;
  let flareStreak: THREE.Sprite | null = null;
  let particles: THREE.Points | null = null;
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  const disposeGroup = (g: THREE.Object3D) => {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    g.clear();
  };

  // Instanced pillars get their per-instance colour from theme accents each frame.
  function buildWorld() {
    disposeGroup(world);
    disposeGroup(mirror);
    zoneMats.length = 0;
    zoneFlash.length = 0;
    const L = layout;
    const W = L.totalWidth;
    const len = FAR_Z + 24;
    const midZ = -FAR_Z / 2 + 8;

    // floor
    floorMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uScroll: { value: 0 }, uPitch: { value: L.pitch }, uHalfW: { value: W / 2 }, uFar: { value: FAR_Z }, uAmount: { value: 1 }, uHC: { value: 0 },
        uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() },
        uLaneX: { value: L.xs.concat([0, 0, 0, 0]).slice(0, 4) }, uLaneN: { value: L.n },
        uLaneCol: { value: L.lanes.map((id) => laneColor(id)).concat([new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()]).slice(0, 4) },
        uHor: { value: new THREE.Color() },
      },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `
        uniform float uTime, uScroll, uPitch, uHalfW, uFar, uAmount, uHC, uLaneN; uniform vec3 uA, uB, uC, uHor; uniform float uLaneX[4]; uniform vec3 uLaneCol[4]; varying vec3 vW;
        float gridLine(float v, float w){ float f = abs(fract(v - 0.5) - 0.5); float aa = fwidth(v) * 1.2; return 1.0 - smoothstep(w * aa, w * aa + aa, f); }
        void main(){
          float zf = clamp(-vW.z / uFar, 0.0, 1.0);
          float zn = clamp((vW.z + 6.0) / 14.0, 0.0, 1.0);
          vec3 col = mix(vec3(0.016, 0.012, 0.055), vec3(0.05, 0.02, 0.13), pow(zf, 0.7));
          // faint tiled panels
          float px = vW.x / (uPitch * 0.5);
          float pz = (vW.z + uScroll) / (uPitch * 0.9);
          float gx = gridLine(px, 0.5);
          float gz = gridLine(pz, 0.5);
          vec3 gc = mix(uB, uA, smoothstep(-1.0, 1.0, sin(vW.z * 0.045 + uTime * 0.2)));
          float fade = (1.0 - smoothstep(0.55, 1.0, zf)) * 0.9 + 0.1;
          col += gc * (gx * 0.11 + gz * 0.07) * fade * (1.0 - uHC);
          // coloured light pooled under each lane, brightest near the child
          for (int i = 0; i < 4; i++) {
            if (float(i) >= uLaneN) break;
            float d = abs(vW.x - uLaneX[i]);
            float hw = uPitch * 0.46;
            float lane = (1.0 - smoothstep(hw * 0.2, hw, d));
            col += uLaneCol[i] * lane * (0.05 + 0.10 * (1.0 - zf)) * (1.0 - uHC * 0.4);
          }
          // central sheen toward the vanishing point
          float sheen = exp(-pow(vW.x / (uHalfW * (0.5 + zf * 3.0)), 2.0)) * pow(zf, 1.6);
          col += uHor * sheen * 0.45 * (1.0 - uHC);
          // glowing rim just outside the outer lane lines
          float edge = abs(abs(vW.x) - uHalfW);
          col += uA * exp(-edge * 1.4) * 0.16 * (1.0 - zf * 0.6) * (1.0 - uHC);
          // soft vignette behind the near zones so the child's area stays calm and dark
          col *= mix(0.78, 1.0, zn);
          float horizonFog = smoothstep(0.7, 1.0, zf);
          col = mix(col, uHor * 0.5, horizonFog * 0.6);
          col *= 0.86;
          gl_FragColor = vec4(col * uAmount, mix(0.80, 0.97, zf));
          #include <colorspace_fragment>
        }`,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 7, len, 1, 1), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, midZ);
    floor.renderOrder = 2;
    world.add(floor);

    // lane lines: long, bright white rails with a soft glow strip each
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const stripGeo = new THREE.PlaneGeometry(1, len);
    stripGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i <= L.n; i++) {
      const x = (i - L.n / 2) * L.pitch;
      const outer = i === 0 || i === L.n;
      const w = outer ? 0.11 : 0.055;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, len), lineMat);
      rail.position.set(x, 0.03, midZ);
      rail.renderOrder = 4;
      world.add(rail);
      const strip = new THREE.Mesh(stripGeo, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(outer ? '#6fe6ff' : '#cfd6ff') }, uW: { value: outer ? 1.6 : 0.9 }, uAmount: { value: 1 }, uFar: { value: FAR_Z } },
        vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uW, uAmount, uFar; varying vec2 vUv; varying vec3 vW;
          void main(){ float d = abs(vUv.x - 0.5) * 2.0; float g = exp(-d * 6.0) * 0.8; float zf = clamp(-vW.z / uFar, 0.0, 1.0); gl_FragColor = vec4(uColor * g * uAmount * 0.5 * (0.55 + 0.45 * (1.0 - zf)), 1.0);
#include <colorspace_fragment>
}`,
      }));
      strip.scale.set(w * 10 * (outer ? 1.4 : 1), 1, 1);
      strip.position.set(x, 0.02, midZ);
      strip.renderOrder = 3;
      world.add(strip);
    }

    // near zones: flat glass squares that never move
    const zoneSize = L.size * 1.1;
    const planeSide = zoneSize * 1.5;
    const zoneSlab = slabGeometry(zoneSize, 0.04, 0.03);
    L.lanes.forEach((id, i) => {
      const color = laneColor(id);
      const slab = new THREE.Mesh(zoneSlab, new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.12), emissive: color.clone().multiplyScalar(0.1), roughness: 0.4, metalness: 0.3 }));
      slab.position.set(L.xs[i], 0.0, 0);
      slab.scale.z = L.depthStretch;
      world.add(slab);
      const mat = zoneMaterial(color);
      zoneMats.push(mat);
      zoneFlash.push(0);
      const top = new THREE.Mesh(flat(planeSide, planeSide), mat);
      top.position.set(L.xs[i], 0.115, 0);
      top.scale.z = L.depthStretch;
      top.renderOrder = 5;
      world.add(top);
      const lab = new THREE.Mesh(flat(zoneSize * 0.8, zoneSize * 0.4), new THREE.MeshBasicMaterial({ map: labelTex[id], transparent: true, depthWrite: false, opacity: 0.8 }));
      lab.position.set(L.xs[i], 0.125, zoneSize * 0.36 * L.depthStretch);
      lab.scale.z = L.depthStretch;
      lab.renderOrder = 6;
      world.add(lab);
    });

    // alignment grid for calibration
    if (config.grid) {
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
      const pts: number[] = [];
      const half = L.totalWidth / 2 + L.pitch;
      for (let x = -half; x <= half + 1e-6; x += L.pitch / 2) pts.push(x, 0.12, 6, x, 0.12, -30);
      for (let z = 6; z >= -30; z -= L.pitch / 2) pts.push(-half, 0.12, z, half, 0.12, z);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      world.add(new THREE.LineSegments(g, mat));
    }

    // pillars: tall emissive slabs on both sides, scrolling toward the viewer with the gameplay clock
    pillarSeeds = [];
    const rnd = mulberry(7);
    for (let i = 0; i < PILLARS; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      pillarSeeds.push({ side, off: 4 + rnd() * 14, z0: (i / PILLARS) * (FAR_Z + 16), h: 3 + rnd() * rnd() * 20, w: 0.5 + rnd() * 1.1, hue: rnd() });
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    pillars = new THREE.InstancedMesh(box, pillarMat, PILLARS);
    pillarGlow = new THREE.InstancedMesh(box, pillarGlowMat, PILLARS);
    pillarMirror = new THREE.InstancedMesh(box, mirrorPillarMat, PILLARS);
    for (const m of [pillars, pillarGlow, pillarMirror]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    pillarGlow.renderOrder = 7;
    pillarMirror.renderOrder = 1;
    pillars.renderOrder = 0;
    world.add(pillars, pillarGlow);
    mirror.add(pillarMirror);

    // two huge slabs close to the camera, like the reference
    farSlabs = new THREE.Group();
    for (const side of [-1, 1]) {
      const slabMat = new THREE.MeshBasicMaterial({ color: 0x20d8ff });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 15, 0.7), slabMat);
      slab.position.set(side * (W / 2 + 6.2), 7.2, -2.5);
      slab.rotation.set(0, side * 0.22, side * -0.1);
      farSlabs.add(slab);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: 0xffffff }));
      edges.position.copy(slab.position);
      edges.rotation.copy(slab.rotation);
      farSlabs.add(edges);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0x20d8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.set(10, 22, 1);
      halo.position.set(slab.position.x, 7.2, -2.0);
      farSlabs.add(halo);
    }
    world.add(farSlabs);

    // floating light bars
    barSeeds = [];
    for (let i = 0; i < BARS; i++) barSeeds.push({ x: (rnd() * 2 - 1) * (W * 0.9 + 10), y: 3 + rnd() * 16, z: -rnd() * FAR_Z * 0.95, h: 1.5 + rnd() * 5, sp: 0.2 + rnd() * 0.6, hue: rnd() });
    bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 1, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), BARS);
    bars.frustumCulled = false;
    bars.renderOrder = 8;
    world.add(bars);

    // gates (arches over the lanes), prisms and light columns: optional per stage
    gates = [];
    for (let i = 0; i < GATES; i++) {
      const g = new THREE.Mesh(new THREE.TorusGeometry(W * 0.62 + 2, 0.12, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.renderOrder = 8;
      g.visible = false;
      world.add(g);
      gates.push(g);
    }
    prisms = [];
    for (let i = 0; i < PRISMS; i++) {
      const p = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: i % 2 === 0 }));
      p.renderOrder = 8;
      p.visible = false;
      world.add(p);
      prisms.push(p);
    }
    columns = [];
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 40, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      c.renderOrder = 8;
      c.visible = false;
      world.add(c);
      columns.push(c);
    }

    // vanishing-point flare
    flareSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flare, color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
    flareSprite.position.set(0, 3.2, -FAR_Z + 4);
    flareSprite.scale.set(70, 70, 1);
    flareSprite.renderOrder = 9;
    world.add(flareSprite);
    flareStreak = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xaaddff, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
    flareStreak.position.set(0, 3.2, -FAR_Z + 4);
    flareStreak.scale.set(150, 5, 1);
    flareStreak.renderOrder = 9;
    world.add(flareStreak);

    // drifting particles
    const seeds = new Float32Array(PARTICLES * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    particles = new THREE.Points(pg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uFlow: { value: 0 }, uHalfW: { value: W / 2 + 8 }, uFar: { value: FAR_Z }, uSize: { value: 26 * dpr }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uAmount: { value: 1 }, uShown: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; uniform float uTime, uFlow, uHalfW, uFar, uSize, uShown; uniform vec3 uA, uB; varying vec3 vCol; varying float vA;
        void main(){
          vec3 p;
          p.x = (aSeed.x * 2.0 - 1.0) * uHalfW * 1.5 + sin(uTime * 0.35 + aSeed.w * 40.0) * 0.4;
          p.y = 0.3 + fract(aSeed.y + uTime * 0.012 * (0.4 + aSeed.w)) * 15.0;
          float z = fract(aSeed.z + uFlow * (0.6 + aSeed.w * 0.8));
          p.z = mix(12.0, -uFar, z);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.65 + 0.35 * sin(uTime * 3.0 + aSeed.w * 90.0);
          gl_PointSize = uSize * (0.35 + aSeed.w) * tw * clamp(34.0 / -mv.z, 0.25, 1.7);
          vCol = aSeed.w > 0.86 ? vec3(1.0) : mix(uA, uB, step(0.5, aSeed.x * 7.0 - floor(aSeed.x * 7.0)));
          vA = smoothstep(0.0, 0.08, z) * (1.0 - smoothstep(0.94, 1.0, z)) * step(aSeed.z, uShown);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAmount; varying vec3 vCol; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vCol * a * vA * uAmount, 1.0);
#include <colorspace_fragment>
}`,
    }));
    particles.frustumCulled = false;
    particles.renderOrder = 8;
    world.add(particles);
  }

  // ---------- target pool ----------
  const targetsGroup = new THREE.Group();
  scene.add(targetsGroup);
  const slots: Slot[] = [];
  const links: THREE.Mesh[] = [];
  let bodyGeo: THREE.BufferGeometry | null = null;
  let frameGeo: THREE.BufferGeometry | null = null;
  let iconGeo: THREE.BufferGeometry | null = null;
  let haloGeo: THREE.BufferGeometry | null = null;
  let badgeGeo: THREE.BufferGeometry | null = null;
  let ringGeo: THREE.BufferGeometry | null = null;
  const linkGeo = new THREE.BoxGeometry(1, 0.08, 1);
  const linkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

  function buildTargets() {
    for (const s of slots) {
      s.bodyMat.dispose(); s.frameMat.dispose(); s.haloMat.dispose(); s.iconMat.dispose(); s.badgeMat.dispose(); s.ringMat.dispose();
    }
    slots.length = 0;
    for (const l of links) l.removeFromParent();
    links.length = 0;
    [bodyGeo, frameGeo, iconGeo, haloGeo, badgeGeo, ringGeo].forEach((g) => g?.dispose());
    targetsGroup.clear();
    const S = layout.size;
    bodyGeo = slabGeometry(S * 0.9, 0.2, 0.05);
    frameGeo = frameGeometry(S * 0.9, S * 0.035);
    iconGeo = flat(S * 0.84, S * 0.84);
    haloGeo = flat(S * 1.7, S * 1.7);
    badgeGeo = flat(S * 0.22, S * 0.22);
    ringGeo = flat(S * 1.5, S * 1.5);
    for (let i = 0; i < TARGET_POOL; i++) {
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0x888888, emissiveIntensity: 0.8, roughness: 0.32, metalness: 0.2, transparent: true });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      const frameMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.y = 0.318;
      const haloMat = glowMaterial(new THREE.Color('#ffffff'), 0.588, 0.2, 3.4);
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.y = 0.01;
      halo.renderOrder = 6;
      const iconMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: 0xc9c9c9 });
      const iconMesh = new THREE.Mesh(iconGeo, iconMat);
      iconMesh.position.y = 0.335;
      iconMesh.renderOrder = 10;
      const badgeMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: 0xc9c9c9 });
      const badge = new THREE.Mesh(badgeGeo, badgeMat);
      badge.position.set(-S * 0.33, 0.35, -S * 0.33);
      badge.renderOrder = 11;
      const ringMat = ringMaterial();
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.37;
      ring.renderOrder = 11;
      group.add(halo, body, frame, iconMesh, badge, ring);
      group.visible = false;
      targetsGroup.add(group);
      slots.push({ group, body, frame, halo, icon: iconMesh, badge, ring, bodyMat, frameMat, haloMat, iconMat, badgeMat, ringMat, key: null, lane: -1, icon$: null, badge$: -1, resolvedAt: -1 });
    }
    for (let i = 0; i < LINK_POOL; i++) {
      const l = new THREE.Mesh(linkGeo, linkMat.clone());
      l.visible = false;
      l.renderOrder = 9;
      targetsGroup.add(l);
      links.push(l);
    }
  }

  // ---------- effects ----------
  const fxRings: Fx[] = Array.from({ length: RING_POOL }, () => ({ active: false, t0: 0, life: 0.8, x: 0, z: 0, scale: 1 }));
  const fxBeams: Fx[] = Array.from({ length: BEAM_POOL }, () => ({ active: false, t0: 0, life: 0.7, x: 0, z: 0, scale: 1 }));
  const ringMeshes: THREE.Mesh[] = [];
  const beamMeshes: THREE.Mesh[] = [];
  const fxGroup = new THREE.Group();
  scene.add(fxGroup);
  for (let i = 0; i < RING_POOL; i++) {
    const m = new THREE.Mesh(flat(2, 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color() }, uT: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uT; varying vec2 vUv; void main(){ float r = length((vUv - 0.5) * 2.0); float w = 0.10 + 0.1 * uT; float a = smoothstep(w, 0.0, abs(r - (0.2 + 0.78 * uT))) * (1.0 - uT); gl_FragColor = vec4(uColor * a * 2.2, 1.0);\n#include <colorspace_fragment>\n}',
    }));
    m.visible = false;
    m.renderOrder = 12;
    fxGroup.add(m);
    ringMeshes.push(m);
  }
  for (let i = 0; i < BEAM_POOL; i++) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color() }, uT: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uT; varying vec2 vUv; void main(){ float across = 1.0 - abs(vUv.x - 0.5) * 2.0; float a = pow(across, 1.6) * pow(1.0 - vUv.y, 1.2) * (1.0 - uT); gl_FragColor = vec4(uColor * a * 1.6, 1.0);\n#include <colorspace_fragment>\n}',
    }));
    m.visible = false;
    m.renderOrder = 12;
    fxGroup.add(m);
    beamMeshes.push(m);
  }
  // sparks
  const sparkPos = new Float32Array(SPARK_POOL * 3);
  const sparkCol = new Float32Array(SPARK_POOL * 4);
  const sparkSize = new Float32Array(SPARK_POOL);
  const sparkVel = new Float32Array(SPARK_POOL * 3);
  const sparkLife = new Float32Array(SPARK_POOL);
  const sparkMax = new Float32Array(SPARK_POOL);
  let sparkHead = 0;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('aColor', new THREE.BufferAttribute(sparkCol, 4));
  sparkGeo.setAttribute('aSize', new THREE.BufferAttribute(sparkSize, 1));
  sparkGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const sparks = new THREE.Points(sparkGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: dpr } },
    vertexShader: 'attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC; void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale * clamp(30.0 / -mv.z, 0.3, 3.0); }',
    fragmentShader: 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vC.rgb * a * vC.a, 1.0);\n#include <colorspace_fragment>\n}',
  }));
  sparks.frustumCulled = false;
  sparks.renderOrder = 13;
  fxGroup.add(sparks);
  const bursts: Burst[] = [];
  let nowSec = 0;

  function spawnSparks(x: number, z: number, color: THREE.Color, count: number, power: number) {
    for (let i = 0; i < count; i++) {
      const k = sparkHead++ % SPARK_POOL;
      const a = Math.random() * Math.PI * 2;
      const up = 0.35 + Math.random() * 0.65;
      const sp = (2.5 + Math.random() * 6) * power;
      sparkPos.set([x + (Math.random() - 0.5) * 0.8, 0.3, z + (Math.random() - 0.5) * 0.8], k * 3);
      sparkVel.set([Math.cos(a) * sp * (1 - up * 0.5), 3 + up * 8 * power, Math.sin(a) * sp * (1 - up * 0.5)], k * 3);
      const white = Math.random() < 0.3;
      sparkCol.set([white ? 1 : color.r, white ? 1 : color.g, white ? 1 : color.b, 1], k * 4);
      sparkSize[k] = (9 + Math.random() * 16) * (0.6 + power * 0.4);
      sparkLife[k] = sparkMax[k] = 0.7 + Math.random() * 0.9;
    }
  }
  /** Slow rising light dust above a zone a target is approaching (the glowing pad of the reference). */
  function emitDust(x: number, z: number, color: THREE.Color, width: number) {
    const k = sparkHead++ % SPARK_POOL;
    sparkPos.set([x + (Math.random() - 0.5) * width, 0.2, z + (Math.random() - 0.5) * width * 0.9], k * 3);
    sparkVel.set([(Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 2.4, (Math.random() - 0.5) * 0.4], k * 3);
    const white = Math.random() < 0.35;
    sparkCol.set([white ? 1 : color.r, white ? 1 : color.g, white ? 1 : color.b, 1], k * 4);
    sparkSize[k] = 6 + Math.random() * 9;
    sparkLife[k] = sparkMax[k] = 0.9 + Math.random() * 0.9;
  }
  function addRing(pool: Fx[], x: number, z: number, scale: number, life: number) {
    const f = pool.find((r) => !r.active) ?? pool[0];
    Object.assign(f, { active: true, t0: nowSec, life, x, z, scale });
    return pool.indexOf(f);
  }
  function burstAt(x: number, z: number, color: THREE.Color, power = 1) {
    if (config.reducedEffects) {
      const ri = addRing(fxRings, x, z, layout.size * 1.5, 0.7);
      (ringMeshes[ri].material as THREE.ShaderMaterial).uniforms.uColor.value.copy(color);
      return;
    }
    const ri = addRing(fxRings, x, z, layout.size * (1.7 + power * 0.4), 0.85);
    (ringMeshes[ri].material as THREE.ShaderMaterial).uniforms.uColor.value.copy(color);
    const bi = addRing(fxBeams, x, z, layout.size, 0.8);
    (beamMeshes[bi].material as THREE.ShaderMaterial).uniforms.uColor.value.copy(color);
    spawnSparks(x, z, color, Math.round(26 * power), power);
  }

  // ---------- post ----------
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  function setupPost(w: number, h: number) {
    composer?.dispose();
    composer = null;
    bloom = null;
    if (config.quality !== 'high' || config.reducedEffects || config.highContrast) return;
    try {
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(Math.floor(w / 2), Math.floor(h / 2)), 0.3, 0.45, 0.92);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    } catch (e) {
      console.error('Rhythm Steps: bloom unavailable', e);
      composer = null;
    }
  }

  // ---------- state ----------
  const fps = { ema: 16 };
  let lastClock = 0;
  let lastStage = initial.stage;
  let hcPrev = false;

  function setCamera() {
    camera.copy(cameraFor(config, layout.aspect));
    camera.aspect = layout.aspect;
    camera.updateProjectionMatrix();
    applyShift(camera, layout.shift);
    // vanishing point height in the sky shader
    const v = new THREE.Vector3(0, 0, -FAR_Z).project(camera);
    skyMat.uniforms.uHorizonY.value = (v.y + 1) / 2;
  }

  function ensureWorld(f: DrawFrame) {
    const k = [f.layout.n, f.layout.pitch.toFixed(3), f.layout.size.toFixed(3), f.layout.aspect.toFixed(3), f.layout.shift.toFixed(3), f.layout.depthStretch.toFixed(2), f.config.perspective, f.config.grid ? 1 : 0, f.layout.lanes.join('')].join('|');
    layout = f.layout;
    config = f.config;
    if (k !== worldKey) {
      worldKey = k;
      buildWorld();
      buildTargets();
      setCamera();
    }
  }

  function slotFor(key: string): Slot | null {
    return slots.find((s) => s.key === key) ?? slots.find((s) => s.key === null) ?? null;
  }

  const iconKeyOf = (t: Target): IconKey => {
    if (t.role === 'jump') return 'JUMP';
    if (t.role === 'stay') return t.foot === 'R' ? 'STAY_R' : 'STAY_L';
    if (t.role === 'hold') return t.foot === 'R' ? 'HOLD_R' : t.foot === 'L' ? 'HOLD_L' : 'HOLD_ANY';
    return (t.foot as Foot) satisfies IconKey;
  };

  function draw(f: DrawFrame, dt: number, now: number) {
    const t0 = performance.now();
    nowSec = now;
    ensureWorld(f);
    if (f.stage !== lastStage) {
      lastStage = f.stage;
      themeTarget = toColors(STAGE_THEMES[f.stage]);
    }
    easeTheme(theme, themeTarget, 1 - Math.exp(-dt * 1.6));
    const hc = f.config.highContrast;
    const amt = f.config.intensity / 100;
    const red = f.config.reducedEffects;
    if (hc !== hcPrev) {
      hcPrev = hc;
      setupPost(viewW, viewH);
    }
    const beatPhase = ((f.clock % 750) / 750);
    const pulse = 0.5 + 0.5 * Math.cos(beatPhase * Math.PI * 2);
    const flow = f.clock * 0.0125;

    // sky + theme colours
    skyMat.uniforms.uTop.value.copy(theme.skyTop);
    skyMat.uniforms.uMid.value.copy(theme.skyMid);
    skyMat.uniforms.uHor.value.copy(theme.skyHorizon);
    skyMat.uniforms.uGlow.value.copy(theme.accentB);
    skyMat.uniforms.uTime.value = now;
    skyMat.uniforms.uAmount.value = hc ? 0.2 : 0.55 + 0.45 * amt;
    scene.fog!.color.copy(theme.skyHorizon).multiplyScalar(0.35);
    pointA.color.copy(theme.accentA);
    pointB.color.copy(theme.accentB);
    pointA.position.set(-layout.totalWidth * 0.6, 4, 2);
    pointB.position.set(layout.totalWidth * 0.6, 4, 2);

    if (floorMat) {
      const u = floorMat.uniforms;
      u.uTime.value = now;
      u.uScroll.value = f.clock * 0.0036 * 0.9;
      u.uA.value.copy(theme.accentA);
      u.uB.value.copy(theme.accentB);
      u.uC.value.copy(theme.accentC);
      u.uHor.value.copy(theme.skyHorizon);
      u.uAmount.value = hc ? 0.9 : 0.62 + 0.45 * amt;
      u.uHC.value = hc ? 1 : 0;
    }

    // ambient structures
    const showEnv = !hc;
    const stageNear = FAR_Z + 16;
    if (pillars && pillarGlow && pillarMirror) {
      pillars.visible = pillarGlow.visible = pillarMirror.visible = showEnv;
      const flowU = (flow * 2.1) % stageNear;
      for (let i = 0; i < PILLARS; i++) {
        const s = pillarSeeds[i];
        const z = ((s.z0 + flowU) % stageNear) - FAR_Z - 4;
        const x = s.side * (layout.totalWidth / 2 + s.off);
        const accent = s.hue < 0.42 ? theme.accentA : s.hue < 0.8 ? theme.accentB : theme.accentC;
        const sat = (0.55 + 0.9 * amt) * (red ? 0.7 : 1);
        dummy.position.set(x, s.h / 2, z);
        dummy.scale.set(s.w, s.h, s.w);
        dummy.updateMatrix();
        pillars.setMatrixAt(i, dummy.matrix);
        dummy.scale.set(s.w * 1.9, s.h * 1.04, s.w * 1.9);
        dummy.updateMatrix();
        pillarGlow.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x, -s.h / 2, z);
        dummy.scale.set(s.w, s.h, s.w);
        dummy.updateMatrix();
        pillarMirror.setMatrixAt(i, dummy.matrix);
        tmpColor.copy(accent).multiplyScalar(sat * (0.78 + 0.22 * Math.sin(now * 0.8 + i)));
        pillars.setColorAt(i, tmpColor);
        tmpColor.copy(accent).multiplyScalar(sat);
        pillarGlow.setColorAt(i, tmpColor);
        pillarMirror.setColorAt(i, tmpColor);
      }
      pillars.instanceMatrix.needsUpdate = pillarGlow.instanceMatrix.needsUpdate = pillarMirror.instanceMatrix.needsUpdate = true;
      for (const m of [pillars, pillarGlow, pillarMirror]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
      pillarMat.uniforms.uAmount.value = 0.8 + 0.5 * amt;
      pillarGlowMat.opacity = 0.16 + 0.12 * amt;
    }
    if (farSlabs) {
      farSlabs.visible = showEnv;
      let i = 0;
      farSlabs.children.forEach((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const mat = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.color.copy(i++ % 2 === 0 ? theme.accentA : theme.accentB).multiplyScalar(0.55 + 0.6 * amt);
        } else if ((c as THREE.Sprite).isSprite) {
          const sm = (c as THREE.Sprite).material;
          sm.color.copy(theme.accentA);
          sm.opacity = 0.4 * amt;
        }
      });
    }
    if (bars) {
      bars.visible = showEnv && !red;
      for (let i = 0; i < BARS; i++) {
        const s = barSeeds[i];
        const y = ((s.y + now * s.sp) % 20) + 1;
        const z = ((s.z + flow * 1.3) % (FAR_Z * 0.95)) - FAR_Z * 0.2;
        dummy.position.set(s.x, y, z);
        dummy.scale.set(1, s.h, 1);
        dummy.updateMatrix();
        bars.setMatrixAt(i, dummy.matrix);
        bars.setColorAt(i, tmpColor.copy(s.hue < 0.5 ? theme.accentA : theme.accentB).multiplyScalar(0.9 * amt));
      }
      bars.instanceMatrix.needsUpdate = true;
      if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
    }
    gates.forEach((g, i) => {
      g.visible = showEnv && !red && theme.gates > 0.05;
      if (!g.visible) return;
      const z = (((i / GATES) * 120 + flow * 2.4) % 120) - 108;
      g.position.set(0, 0, z);
      (g.material as THREE.MeshBasicMaterial).color.copy(i % 2 ? theme.accentA : theme.accentB).multiplyScalar(theme.gates * (0.5 + 0.6 * amt));
    });
    prisms.forEach((p, i) => {
      p.visible = showEnv && !red && theme.prisms > 0.05;
      if (!p.visible) return;
      const side = i % 2 ? 1 : -1;
      const z = (((i / PRISMS) * 90 + flow * 1.5) % 90) - 80;
      p.position.set(side * (layout.totalWidth / 2 + 4 + (i % 3) * 2.2), 4 + (i % 4) * 2.4 + Math.sin(now * 0.9 + i) * 0.5, z);
      p.rotation.set(now * 0.5 + i, now * 0.7, 0);
      p.scale.setScalar(0.9 + (i % 3) * 0.4);
      (p.material as THREE.MeshBasicMaterial).color.copy(i % 3 === 0 ? theme.accentA : theme.accentB).multiplyScalar(theme.prisms * (0.6 + 0.6 * amt));
    });
    columns.forEach((c, i) => {
      c.visible = showEnv && !red && theme.columns > 0.05 && i < Math.round(theme.columns * 8);
      if (!c.visible) return;
      const side = i % 2 ? 1 : -1;
      c.position.set(side * (layout.totalWidth / 2 + 14 + (i % 4) * 4), 20, -18 - i * 9);
      (c.material as THREE.MeshBasicMaterial).color.copy(theme.accentA).multiplyScalar(0.8 * amt);
    });
    if (flareSprite && flareStreak) {
      flareSprite.visible = flareStreak.visible = showEnv;
      const s = 62 + pulse * 10 * (f.running ? 1 : 0.3);
      flareSprite.scale.set(s, s, 1);
      (flareSprite.material as THREE.SpriteMaterial).color.copy(theme.skyHorizon).lerp(new THREE.Color(1, 1, 1), 0.55);
      (flareSprite.material as THREE.SpriteMaterial).opacity = 0.55 + 0.45 * amt;
      (flareStreak.material as THREE.SpriteMaterial).color.copy(theme.accentA);
    }
    if (particles) {
      particles.visible = showEnv;
      const u = (particles.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = now;
      u.uFlow.value = f.clock * 0.00003;
      u.uA.value.copy(theme.accentA);
      u.uB.value.copy(theme.accentB);
      u.uAmount.value = 0.8 * amt;
      u.uShown.value = red ? 0.22 : f.config.quality === 'low' ? 0.5 : 1;
    }

    // ----- targets -----
    const stage = f.stage;
    const energyByLane = new Map<number, number>();
    let activeSlots = 0;
    const seen = new Set<string>();
    const first = f.steps.find((s) => s.out === 'pending');
    for (const slot of slots) slot.group.visible = false;
    for (const l of links) l.visible = false;
    let linkIdx = 0;
    for (const st of f.steps) {
      const p = progressOf(st.arrival, f.clock, stage);
      if (p < -0.001) continue;
      const pending = st.out === 'pending';
      st.targets.forEach((t, ti) => {
        const key = `${st.id}#${ti}`;
        seen.add(key);
        const li = layout.lanes.indexOf(t.lane);
        if (li < 0) return;
        const slot = slotFor(key);
        if (!slot) return;
        if (slot.key !== key) {
          slot.key = key;
          slot.resolvedAt = -1;
        }
        if (!pending && slot.resolvedAt < 0) slot.resolvedAt = now;
        const age = slot.resolvedAt < 0 ? 0 : now - slot.resolvedAt;
        if (!pending && age > 0.75) return;
        activeSlots++;
        configureSlot(slot, st, t, ti);
        const g = slot.group;
        const approach = Math.min(1.0, Math.max(0, p));
        const z = -APPROACH * (1 - approach);
        const x = layout.xs[li];
        const awaiting = pending && p >= 1;
        const spawnFade = smooth(0.0, 0.07, p);
        let sc = lerp(0.4, 1, spawnFade);
        let y = TARGET_Y;
        let alpha = spawnFade;
        let flash = 0;
        if (!pending) {
          const a = clamp01(age / 0.7);
          if (st.out === 'confirmed' || st.out === 'assisted') {
            sc = 1 + 0.32 * Math.sin(Math.min(1, a * 1.4) * Math.PI * 0.5);
            y = TARGET_Y + a * 1.6;
            alpha = 1 - smooth(0.35, 1, a);
            flash = 1 - a;
          } else {
            sc = 1 - 0.1 * a;
            alpha = (1 - a) * 0.8;
            y = TARGET_Y - 0.05 * a;
          }
        } else if (awaiting) {
          sc = 1 + 0.035 * pulse;
          flash = 0.12 * pulse;
        }
        g.visible = true;
        g.position.set(x, y, z + (pending ? 0 : st.out === 'skipped' || st.out === 'missed' ? age * 3 : 0));
        g.scale.set(sc, sc, sc * layout.depthStretch);
        const color = laneColor(t.lane);
        const isStay = t.role === 'stay';
        const base = isStay ? 0.12 : 0.46;
        slot.bodyMat.color.copy(color).multiplyScalar(base);
        slot.bodyMat.emissive.copy(color);
        slot.bodyMat.emissiveIntensity = (isStay ? 0.2 : 0.26 + 0.3 * (awaiting ? pulse : 0)) * (0.6 + 0.6 * amt) + flash * 2.2;
        slot.bodyMat.opacity = alpha * (isStay ? 0.7 : 1);
        slot.frameMat.opacity = alpha * (isStay ? 0.7 : 1);
        slot.iconMat.opacity = alpha;
        slot.badgeMat.opacity = alpha;
        slot.haloMat.uniforms.uColor.value.copy(color);
        slot.haloMat.uniforms.uAmount.value = alpha * (hc ? 0.5 : (0.55 + 0.7 * amt) * (isStay ? 0.5 : 1)) * (st === first ? 1.25 : 0.85) * (1 + flash * 1.5);
        // hold progress ring
        const holding = pending && st.holdAt >= 0;
        slot.ring.visible = st.kind === 'hold' && pending && p >= 0.9;
        if (slot.ring.visible) {
          const prog = holding ? clamp01((f.clock - st.holdAt) / st.holdMs) : 0;
          slot.ringMat.uniforms.uProgress.value = prog;
          slot.ringMat.uniforms.uColor.value.copy(color);
          slot.ringMat.uniforms.uAmount.value = alpha * (holding ? 1 : 0.55 + 0.25 * pulse);
        }
        if (pending && !isStay) energyByLane.set(t.lane, Math.max(energyByLane.get(t.lane) ?? 0, smooth(0.45, 1, p)));
        if (isStay && pending) energyByLane.set(t.lane, Math.max(energyByLane.get(t.lane) ?? 0, 0.55));
      });
      // dual / split link
      if (st.targets.length === 2 && linkIdx < links.length && (pending || st.out === 'confirmed' || st.out === 'assisted')) {
        const a = layout.lanes.indexOf(st.targets[0].lane);
        const b = layout.lanes.indexOf(st.targets[1].lane);
        const slotsOk = slots.some((s) => s.key === `${st.id}#0` && s.group.visible) && slots.some((s) => s.key === `${st.id}#1` && s.group.visible);
        if (a >= 0 && b >= 0 && slotsOk) {
          const link = links[linkIdx++];
          const z = -APPROACH * (1 - clamp01(p));
          const xa = layout.xs[a], xb = layout.xs[b];
          const lead = layout.size * 0.45;
          link.position.set((xa + xb) / 2, TARGET_Y + 0.32, z);
          link.scale.set(Math.max(0.1, Math.abs(xb - xa) - layout.size * 0.9 + lead * 0.2), 1, 0.12 + layout.size * 0.012);
          const mat = link.material as THREE.MeshBasicMaterial;
          mat.color.set(0xffffff).multiplyScalar(0.7 + 0.3 * pulse);
          mat.opacity = pending ? smooth(0, 0.08, p) * 0.95 : 0.3;
          link.visible = true;
        }
      }
    }
    // free slots whose step has disappeared
    for (const s of slots) if (s.key && !seen.has(s.key)) s.key = null;

    // zones
    layout.lanes.forEach((id, i) => {
      const m = zoneMats[i];
      if (!m) return;
      zoneFlash[i] = Math.max(0, zoneFlash[i] - dt * 2.2);
      const e = energyByLane.get(id) ?? 0;
      m.uniforms.uEnergy.value = hc ? 0.4 + e : e + (f.running ? pulse * 0.06 : 0);
      m.uniforms.uFlash.value = zoneFlash[i];
      m.uniforms.uTime.value = f.clock * 0.002;
      m.uniforms.uAmount.value = hc ? 1 : 0.55 + 0.35 * amt;
      if (!red && !hc && e > 0.3 && Math.random() < dt * 40 * e) emitDust(layout.xs[i], 0, laneColor(id), layout.size * 0.9);
    });

    // effects
    fxRings.forEach((fx, i) => {
      const mesh = ringMeshes[i];
      if (!fx.active) { mesh.visible = false; return; }
      const a = (now - fx.t0) / fx.life;
      if (a >= 1) { fx.active = false; mesh.visible = false; return; }
      mesh.visible = true;
      mesh.position.set(fx.x, 0.12, fx.z);
      mesh.scale.setScalar(fx.scale);
      (mesh.material as THREE.ShaderMaterial).uniforms.uT.value = a;
    });
    fxBeams.forEach((fx, i) => {
      const mesh = beamMeshes[i];
      if (!fx.active) { mesh.visible = false; return; }
      const a = (now - fx.t0) / fx.life;
      if (a >= 1) { fx.active = false; mesh.visible = false; return; }
      mesh.visible = true;
      mesh.position.set(fx.x, 0.1, fx.z);
      mesh.scale.set(fx.scale * 0.8, 9 + 4 * a, 1);
      mesh.lookAt(camera.position.x, mesh.position.y, camera.position.z);
      (mesh.material as THREE.ShaderMaterial).uniforms.uT.value = a;
    });
    for (let i = bursts.length - 1; i >= 0; i--) {
      if (bursts[i].at <= now) {
        const b = bursts.splice(i, 1)[0];
        burstAt(b.x, b.z, b.color, b.power);
      }
    }
    let live = 0;
    for (let k = 0; k < SPARK_POOL; k++) {
      if (sparkLife[k] > 0) {
        live++;
        sparkLife[k] -= dt;
        sparkVel[k * 3 + 1] -= (sparkVel[k * 3 + 1] < 4.2 && sparkSize[k] < 16 ? 2.2 : 14) * dt;
        sparkPos[k * 3] += sparkVel[k * 3] * dt;
        sparkPos[k * 3 + 1] = Math.max(0.05, sparkPos[k * 3 + 1] + sparkVel[k * 3 + 1] * dt);
        sparkPos[k * 3 + 2] += sparkVel[k * 3 + 2] * dt;
        sparkCol[k * 4 + 3] = clamp01(sparkLife[k] / sparkMax[k]);
      } else sparkCol[k * 4 + 3] = 0;
    }
    if (live > 0 || lastLive > 0) {
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.aColor.needsUpdate = true;
      sparkGeo.attributes.aSize.needsUpdate = true;
    }
    lastLive = live;

    // bloom follows the intensity slider and the beat
    if (bloom) bloom.strength = (0.1 + 0.2 * amt) * (0.92 + 0.08 * pulse);

    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
    lastClock = f.clock;
    void lastClock;
    const ms = performance.now() - t0;
    fps.ema = fps.ema * 0.95 + ms * 0.05;
    stat.targets = activeSlots;
  }
  let lastLive = 0;
  const stat = { targets: 0 };

  function configureSlot(slot: Slot, st: Step, t: Target, ti: number) {
    if (slot.lane !== t.lane) {
      slot.lane = t.lane;
    }
    const ik = iconKeyOf(t);
    if (slot.icon$ !== ik) {
      slot.icon$ = ik;
      slot.iconMat.map = icon(ik);
      slot.iconMat.needsUpdate = true;
    }
    const bn = st.seq ? st.seq[1] + 1 : 0;
    if (slot.badge$ !== bn) {
      slot.badge$ = bn;
      slot.badge.visible = bn > 0;
      if (bn > 0) {
        slot.badgeMat.map = num(bn);
        slot.badgeMat.needsUpdate = true;
      }
    }
    void ti;
  }

  function resize(w: number, h: number) {
    viewW = w;
    viewH = h;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    setupPost(w, h);
  }

  function hit(step: Step, assisted: boolean) {
    step.targets.forEach((t) => {
      const li = layout.lanes.indexOf(t.lane);
      if (li < 0) return;
      zoneFlash[li] = 1;
      burstAt(layout.xs[li], 0, laneColor(t.lane), (step.targets.length > 1 ? 1.15 : 1) * (assisted ? 0.8 : 1));
    });
    if (step.targets.length > 1 && !config.reducedEffects) {
      const xs = step.targets.map((t) => layout.xs[layout.lanes.indexOf(t.lane)]);
      burstAt((xs[0] + xs[1]) / 2, -0.5, new THREE.Color('#ffffff'), 0.9);
    }
  }
  function soft(step: Step) {
    void step;
  }
  function celebrate(kind: 'stage' | 'final') {
    const count = kind === 'final' ? 36 : 12;
    const span = kind === 'final' ? 6.5 : 2.4;
    const cols = [...LANES.map((l) => new THREE.Color(l.hex)), new THREE.Color('#ffffff'), new THREE.Color(theme.accentA), new THREE.Color(theme.accentB)];
    for (let i = 0; i < count; i++) {
      bursts.push({ at: nowSec + (i / count) * span + Math.random() * 0.2, x: (Math.random() - 0.5) * layout.totalWidth * 1.3, z: -Math.random() * 14 + 2, color: cols[i % cols.length], power: kind === 'final' ? 1.5 : 1.1 });
    }
  }
  function cue() {
    /* reserved: the Display audio layer owns cue sounds */
  }
  function stats(): ArenaStats {
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, frameMs: Math.round(fps.ema * 100) / 100, targets: stat.targets, bloom: !!composer, pixelRatio: dpr };
  }
  function dispose() {
    disposeGroup(world);
    disposeGroup(mirror);
    disposeGroup(targetsGroup);
    disposeGroup(fxGroup);
    for (const s of slots) { s.bodyMat.dispose(); s.frameMat.dispose(); s.haloMat.dispose(); s.iconMat.dispose(); s.badgeMat.dispose(); s.ringMat.dispose(); }
    [bodyGeo, frameGeo, iconGeo, haloGeo, badgeGeo, ringGeo, linkGeo].forEach((g) => g?.dispose());
    iconCache.forEach((t) => t.dispose());
    numCache.forEach((t) => t.dispose());
    labelTex.forEach((t) => t.dispose());
    dot.dispose();
    flare.dispose();
    skyMat.dispose();
    sky.geometry.dispose();
    pillarMat.dispose(); pillarGlowMat.dispose(); mirrorPillarMat.dispose();
    composer?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  worldKey = '';
  resize(viewW, viewH);
  ensureWorld({ layout, config, clock: 0, speed: 1, stage: initial.stage, steps: [], running: false, status: 'ready', connected: true });
  return { draw, resize, hit, soft, celebrate, cue, stats, dispose };
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
