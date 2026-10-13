import * as THREE from 'three';

/** Deterministic world: one island-continent with a river, hills, far mountains, a sea to the front and a bay to the right. */
export const WORLD = { w: 300, d: 230, cx: 0, cz: 5 };

const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Smooth value noise, 0..1. */
export function noise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return mix(mix(hash(xi, zi), hash(xi + 1, zi), u), mix(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
}
const fbm = (x: number, z: number) => noise(x, z) * 0.55 + noise(x * 2.1 + 5, z * 2.1 - 3) * 0.3 + noise(x * 4.3 - 9, z * 4.3 + 2) * 0.15;

/** River centre line x for a given z. */
export const riverX = (z: number) => 16 + 7 * Math.sin(z * 0.06 + 0.4) + 3 * Math.sin(z * 0.15);
const riverW = (z: number) => 3.4 + 3.4 * sstep(-10, 60, z);

interface Flat { cx: number; cz: number; rx: number; rz: number; h: number; soft: number }
/** Flat building plateaus, shared with the builders so placement is exact. */
export const FLATS: Record<string, Flat> = {
  village: { cx: -26, cz: 14, rx: 34, rz: 30, h: 2.1, soft: 0.5 },
  downtown: { cx: 52, cz: -12, rx: 28, rz: 30, h: 2.4, soft: 0.45 },
  west: { cx: -88, cz: 14, rx: 22, rz: 24, h: 2.2, soft: 0.5 },
  airport: { cx: -70, cz: -26, rx: 36, rz: 16, h: 2.3, soft: 0.5 },
  port: { cx: 66, cz: 36, rx: 24, rz: 14, h: 1.2, soft: 0.5 },
  midtown: { cx: -14, cz: -24, rx: 30, rz: 16, h: 2.2, soft: 0.5 },
};

export function heightAt(x: number, z: number): number {
  const zc = 56 + 5 * Math.sin(x * 0.06) + 3 * Math.sin(x * 0.17);
  const xr = 98 + 8 * Math.sin(z * 0.09 + 1) + 4 * Math.sin(z * 0.2);
  const C = Math.min(zc - z, xr - x, x + 135, z + 130);
  const rolling = (fbm(x * 0.045, z * 0.045) - 0.5) * 3.2 + Math.sin(x * 0.05) * Math.cos(z * 0.06) * 0.8;
  let land = 2.1 + rolling;
  // back hills and distant mountains (never in front of the city); they ease down toward the sea so the edge of the world is a shoreline, not a cut
  const edge = sstep(0, 34, C);
  const back = sstep(-42, -78, z);
  land += edge * back * (7 + 9 * fbm(x * 0.03 + 3, z * 0.03));
  const ridge = 1 - Math.abs(noise(x * 0.025 + 11, z * 0.02) * 2 - 1);
  land += edge * sstep(-80, -120, z) * (26 + 38 * ridge * ridge);
  land += edge * sstep(-70, -125, x) * (8 + 14 * fbm(x * 0.04, z * 0.04));
  let h = mix(-3.2, land, sstep(-1.5, 7, C));
  for (const f of Object.values(FLATS)) {
    const d = Math.max(Math.abs(x - f.cx) / f.rx, Math.abs(z - f.cz) / f.rz);
    const m = 1 - sstep(1, 1 + f.soft, d);
    if (m > 0) h = mix(h, f.h, m);
  }
  // river last, so it always cuts through the plateaus
  if (z > -92) {
    const d = Math.abs(x - riverX(z));
    const w = riverW(z);
    const carve = (1 - sstep(w * 0.55, w * 1.7, d)) * sstep(-96, -70, z);
    h = mix(h, -1.8, carve);
  }
  return h;
}

/** Ground height clamped above water (for placing objects). */
export const groundY = (x: number, z: number) => Math.max(0.05, heightAt(x, z));
export const isLand = (x: number, z: number, margin = 0.4) => heightAt(x, z) > margin;

export function buildTerrain(quality: 'high' | 'balanced' | 'low'): THREE.Mesh {
  const seg = quality === 'low' ? 150 : 230;
  const g = new THREE.PlaneGeometry(WORLD.w, WORLD.d, seg, Math.round(seg * (WORLD.d / WORLD.w)));
  g.rotateX(-Math.PI / 2);
  g.translate(WORLD.cx, 0, WORLD.cz);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const grassA = new THREE.Color('#6fc24a'), grassB = new THREE.Color('#4f9e3a'), grassC = new THREE.Color('#8fd45a');
  const sand = new THREE.Color('#e8d39a'), wet = new THREE.Color('#b9a56a'), rock = new THREE.Color('#8a8478'), snow = new THREE.Color('#f4f7fb'), seabed = new THREE.Color('#7fa7a0'), dirt = new THREE.Color('#9b7a4c');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = noise(x * 0.12, z * 0.12), n2 = noise(x * 0.5 + 7, z * 0.5);
    c.copy(grassA).lerp(grassB, sstep(0.3, 0.8, n)).lerp(grassC, sstep(0.55, 0.9, n2) * 0.45);
    // beach and sea bed
    const beach = 1 - sstep(0.6, 2.0, h);
    c.lerp(sand, beach);
    if (h < 0.2) c.lerp(wet, sstep(0.2, -0.6, h)).lerp(seabed, sstep(-0.6, -2.2, h));
    // rock and snow on the mountains
    c.lerp(rock, sstep(9, 17, h + n * 3));
    c.lerp(snow, sstep(30, 40, h + n * 4));
    // gently worn earth around the plateaus
    for (const f of Object.values(FLATS)) {
      const d = Math.max(Math.abs(x - f.cx) / f.rx, Math.abs(z - f.cz) / f.rz);
      if (d < 1.3 && d > 0.95) c.lerp(dirt, 0.06 * n2);
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  m.receiveShadow = true;
  m.name = 'terrain';
  return m;
}

/** Water with a baked depth map: shallow turquoise near the shore, deep blue offshore, animated ripples and foam. */
export function buildWater(): { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> } {
  const W = 512, Hh = Math.round(512 * (WORLD.d / WORLD.w));
  const data = new Uint8Array(W * Hh * 4);
  for (let j = 0; j < Hh; j++)
    for (let i = 0; i < W; i++) {
      const x = WORLD.cx - WORLD.w / 2 + (i / (W - 1)) * WORLD.w;
      const z = WORLD.cz - WORLD.d / 2 + (j / (Hh - 1)) * WORLD.d;
      const depth = Math.max(0, -heightAt(x, z));
      const o = (j * W + i) * 4;
      data[o] = Math.min(255, Math.round((depth / 3.2) * 255));
      data[o + 1] = Math.min(255, Math.round(Math.max(0, heightAt(x, z)) * 40));
      data[o + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 }, uDepth: { value: tex }, uSun: { value: new THREE.Vector3(0.5, 0.8, 0.3) }, uSky: { value: new THREE.Color('#bfe3ff') },
    uSunCol: { value: new THREE.Color('#fff2d0') }, uShallow: { value: new THREE.Color('#3fd0c8') }, uDeepC: { value: new THREE.Color('#1560a8') }, uNight: { value: 0 },
    uFog: { value: new THREE.Color('#cfe6f5') }, uBounds: { value: new THREE.Vector4(WORLD.cx - WORLD.w / 2, WORLD.cz - WORLD.d / 2, WORLD.w, WORLD.d) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime, uNight; uniform sampler2D uDepth; uniform vec3 uSun, uSky, uSunCol, uShallow, uDeepC, uFog; uniform vec4 uBounds; varying vec3 vW;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 uv = (vW.xz - uBounds.xy) / uBounds.zw;
        float depth = texture2D(uDepth, uv).r * 3.2;
        vec2 p = vW.xz * 0.35;
        float t = uTime;
        float w1 = vn(p*1.7 + vec2(t*0.25, t*0.18)), w2 = vn(p*3.1 - vec2(t*0.32, t*0.21)), w3 = vn(p*6.0 + vec2(-t*0.4, t*0.3));
        vec2 grad = vec2(w1 - vn(p*1.7 + vec2(0.1,0.0) + vec2(t*0.25,t*0.18)), w1 - vn(p*1.7 + vec2(0.0,0.1) + vec2(t*0.25,t*0.18))) * 6.0 + vec2(w2-0.5, w3-0.5)*0.6;
        vec3 N = normalize(vec3(grad.x*0.25, 1.0, grad.y*0.25));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 base = mix(uShallow, uDeepC, smoothstep(0.0, 1.6, depth));
        float band = smoothstep(0.35, 0.0, depth);
        base = mix(base, base*1.15 + vec3(0.05,0.1,0.08), band*0.6);
        vec3 col = mix(base, uSky, fres*0.55);
        vec3 R = reflect(-V, N);
        float spec = pow(max(dot(R, normalize(uSun)), 0.0), 220.0);
        col += uSunCol * spec * 1.4 * (1.0 - uNight*0.6);
        // foam at the shore, softly pulsing
        float foamEdge = smoothstep(0.22, 0.0, depth + (w2-0.5)*0.12 + sin(t*1.4 + vW.x*0.4)*0.03);
        float foam = foamEdge * (0.55 + 0.45*w3);
        col = mix(col, vec3(1.0), foam*0.85);
        col *= mix(1.0, 0.85, uNight);
        float dist = length(cameraPosition - vW);
        col = mix(col, uFog, smoothstep(160.0, 420.0, dist) * 0.55);
        float alpha = smoothstep(0.0, 0.07, depth + 0.02) * 0.94;
        gl_FragColor = vec4(col, max(alpha, foam*0.8));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.w * 6, WORLD.d * 6, 1, 1).rotateX(-Math.PI / 2), mat);
  mesh.position.set(WORLD.cx, 0, WORLD.cz);
  mesh.renderOrder = 2;
  mesh.name = 'water';
  return { mesh, uniforms };
}
