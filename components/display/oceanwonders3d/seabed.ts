import * as THREE from 'three';
import { fbm, mat, noise2, paint, rng, U } from './kit';

const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Seabed height. The foreground garden is calm; dunes, a far ridge and rocky flanks give the world depth. */
export function seabedY(x: number, z: number): number {
  let h = (fbm(x * 0.017 + 3, z * 0.017 - 2) - 0.5) * 5.2;
  h += Math.sin(x * 0.21 + fbm(x * 0.05, z * 0.05) * 5) * 0.1;
  const calm = 1 - sm(0, 46, Math.hypot(x * 0.62, z - 4));
  h *= 1 - calm * 0.78;
  h += Math.max(0, -z - 150) * 0.1 + Math.max(0, Math.abs(x) - 200) * 0.16;
  h += Math.max(0, z - 34) * -0.08; // gently dips towards the camera
  return h;
}

function sandTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e7d5a6';
  g.fillRect(0, 0, S, S);
  const r = rng(11);
  const id = g.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) {
    const n = (r() - 0.5) * 22, x = i % S, y = Math.floor(i / S);
    const ripple = Math.sin((x * 0.09 + Math.sin(y * 0.05) * 3.2) * 1.0) * 7;
    id.data[i * 4] += n + ripple; id.data[i * 4 + 1] += n + ripple * 0.9; id.data[i * 4 + 2] += n * 0.8 + ripple * 0.7;
  }
  g.putImageData(id, 0, 0);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,248,224,0.35)' : 'rgba(150,118,70,0.22)';
    g.beginPath(); g.arc(r() * S, r() * S, 0.8 + r() * 2.2, 0, 6.3); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(90, 64);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildSeabed(quality: 'high' | 'balanced' | 'low') {
  const seg = quality === 'low' ? [150, 100] : [260, 180];
  const g = new THREE.PlaneGeometry(560, 380, seg[0], seg[1]);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -90);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, seabedY(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const tex = sandTexture();
  const m = mat('#ffffff', { rough: 1, map: tex, caustics: 1.5 });
  const near = new THREE.Color('#fff3d2'), far = new THREE.Color('#9ab0a0'), dark = new THREE.Color('#6f8f88');
  paint(g, (x, y, z) => {
    const dz = Math.max(0, -z - 30) / 160;
    const patch = noise2(x * 0.045, z * 0.045);
    const c = near.clone().lerp(far, Math.min(1, dz * 0.9));
    c.lerp(dark, Math.max(0, patch - 0.62) * 1.4 + Math.max(0, y - 6) * 0.04);
    c.multiplyScalar(0.86 + patch * 0.28);
    return c;
  });
  // PlaneGeometry carries uv; the seabed uses the sand texture
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

/** Gradient water dome: bright surface light above, deep blue below, with a soft sun glow. Follows the camera. */
export function buildDome() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color('#9af0ff') }, uMid: { value: new THREE.Color('#1fb0cc') }, uBot: { value: new THREE.Color('#0a5f88') }, uGlow: { value: 1 }, uSun: { value: new THREE.Vector3(-0.35, 0.8, -0.5).normalize() }, uT: U.time },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform vec3 uSun; uniform float uGlow; uniform float uT;
      void main(){
        vec3 d = normalize(vP); float h = d.y;
        vec3 c = mix(uBot, uMid, smoothstep(-0.55, 0.02, h));
        c = mix(c, uTop, smoothstep(0.02, 0.55, h));
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += vec3(1.0, 0.98, 0.85) * (pow(s, 6.0) * 0.28 + pow(s, 40.0) * 0.5) * uGlow * smoothstep(-0.1, 0.4, h);
        float shimmer = sin(d.x * 60.0 + uT * 0.6) * sin(d.z * 55.0 - uT * 0.5);
        c += vec3(0.5, 0.9, 1.0) * max(shimmer, 0.0) * 0.035 * smoothstep(0.25, 0.7, h);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), m);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/** Soft sunbeams: crossed, tilted additive ribbons that breathe slowly. */
export function buildShafts(count: number) {
  const group = new THREE.Group();
  const r = rng(5);
  const u = { uT: U.time, uColor: { value: new THREE.Color('#d8fbff') }, uI: { value: 0.1 } };
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: u,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vU; uniform float uT; uniform vec3 uColor; uniform float uI;
      void main(){
        float edge = 1.0 - abs(vU.x * 2.0 - 1.0);
        float core = pow(smoothstep(0.0, 1.0, edge), 1.6);
        float wob = 0.55 + 0.45 * sin(vU.x * 9.0 + uT * 0.35 + vU.y * 2.0);
        float fade = pow(vU.y, 1.15) * smoothstep(0.0, 0.1, 1.0 - vU.y * 0.0);
        gl_FragColor = vec4(uColor, core * wob * fade * uI);
      }`,
  });
  for (let i = 0; i < count; i++) {
    const w = 7 + r() * 16;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, 150), m);
    pl.position.set(-150 + r() * 300, 38, -30 - r() * 150);
    pl.rotation.z = 0.2 + r() * 0.16;
    pl.rotation.y = (r() - 0.5) * 0.9;
    pl.frustumCulled = false;
    pl.renderOrder = -5;
    group.add(pl);
  }
  return { group, uniforms: u, dispose: () => { m.dispose(); group.children.forEach((c) => (c as THREE.Mesh).geometry.dispose()); } };
}

/** Floating particles ("marine snow") that drift slowly and wrap around a box that follows the view. */
export function buildSnow(count: number) {
  const g = new THREE.BufferGeometry();
  const r = rng(21);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = r() * 220 - 110; pos[i * 3 + 1] = r() * 70; pos[i * 3 + 2] = r() * 220 - 110; seed[i] = r(); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const u = { uT: U.time, uCenter: { value: new THREE.Vector3() }, uOpacity: { value: 0.55 } };
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: u,
    vertexShader: `attribute float aSeed; uniform float uT; uniform vec3 uCenter; varying float vA;
      void main(){
        vec3 p = position; p.y = mod(p.y - uT * (0.35 + aSeed * 0.5) + 70.0, 70.0);
        p.x += sin(uT * 0.3 + aSeed * 40.0) * 2.0; p.z += cos(uT * 0.27 + aSeed * 31.0) * 2.0;
        p.xz = mod(p.xz - uCenter.xz + 110.0, 220.0) - 110.0 + uCenter.xz;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((0.18 + aSeed * 0.28) * 520.0 / -mv.z, 1.0, 6.0);
        vA = clamp(1.0 - (-mv.z) / 150.0, 0.0, 1.0) * (0.4 + 0.6 * aSeed);
      }`,
    fragmentShader: `varying float vA; uniform float uOpacity;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA * uOpacity; gl_FragColor = vec4(0.82, 0.97, 1.0, a); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  return { points: pts, uniforms: u, dispose: () => { g.dispose(); m.dispose(); } };
}
