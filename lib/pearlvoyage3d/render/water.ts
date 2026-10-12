import * as T from 'three';
import type { EnvStyle } from './environments';
import { SEABED_Y } from './environments';
import { sunDirection } from './sky';

const vertex = `
uniform float uTime; uniform float uAmp;
varying vec3 vWorld; varying float vH;
float wave(vec2 p){ return uAmp*(0.55*sin(0.11*p.x+0.07*p.y+uTime*0.9)+0.30*sin(-0.09*p.x+0.15*p.y+uTime*1.15+1.3)+0.15*sin(0.31*p.x-0.21*p.y+uTime*1.7+2.1)); }
void main(){
  vec4 w = modelMatrix * vec4(position, 1.);
  float h = wave(w.xz);
  w.y += h;
  vWorld = w.xyz; vH = h / max(uAmp, 0.001);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const fragment = `
precision highp float;
uniform vec3 uCam; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uZenith; uniform vec3 uHorizon;
uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uShallow; uniform vec3 uSand; uniform vec3 uFoam; uniform vec3 uFog;
uniform float uFogDensity; uniform float uAmp; uniform float uTime; uniform float uClarity; uniform float uDetail;
uniform vec4 uIslands[12]; uniform int uIslandCount; uniform vec4 uReefs[6]; uniform int uReefCount;
uniform vec4 uBoat; uniform vec4 uMarker; uniform float uGlow;
varying vec3 vWorld; varying float vH;
vec3 skyCol(vec3 d){
  float h = clamp(d.y, 0., 1.);
  vec3 c = mix(uHorizon, uZenith, pow(h, 0.42));
  c = mix(c, uHorizon, exp(-h * 9.) * 0.55);
  float s = max(dot(d, uSunDir), 0.);
  return c + uSunColor * (pow(s, 36.) * 0.45 + pow(s, 5.) * 0.16);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float caustic(vec2 p, float t){
  vec2 q = p + vec2(sin(p.y*1.7+t*0.8), cos(p.x*1.5-t*0.7)) * 0.6;
  float a = abs(sin(q.x*2.3 + t*0.6) * sin(q.y*2.1 - t*0.5));
  float b = abs(sin((q.x+q.y)*1.7 - t*0.7) * sin((q.x-q.y)*1.9 + t*0.4));
  return pow(1. - min(a, b), 5.);
}
void main(){
  vec2 p = vWorld.xz; float t = uTime;
  float dist = length(uCam - vWorld);
  float a = 0.11*p.x+0.07*p.y+t*0.9, b = -0.09*p.x+0.15*p.y+t*1.15+1.3, c = 0.31*p.x-0.21*p.y+t*1.7+2.1;
  vec2 g = uAmp * vec2(0.55*0.11*cos(a) - 0.3*0.09*cos(b) + 0.15*0.31*cos(c), 0.55*0.07*cos(a) + 0.3*0.15*cos(b) - 0.15*0.21*cos(c));
  float fine = (1. - smoothstep(25., 170., dist)) * uDetail;
  vec2 q1 = p * 0.85 + vec2(t*0.45, t*0.3), q2 = p * 1.9 - vec2(t*0.35, -t*0.5), q3 = p * 4.1 + vec2(-t*0.6, t*0.4);
  g += fine * (0.034 * vec2(cos(q1.x*1.7 + sin(q1.y*1.3)), cos(q1.y*1.9 + sin(q1.x*1.1))) + 0.018 * vec2(cos(q2.x*2.3 + q2.y), cos(q2.y*2.1 - q2.x)) + 0.008 * vec2(cos(q3.x*2.7 + q3.y*1.1), cos(q3.y*2.5 - q3.x*0.9)));
  vec3 n = normalize(vec3(-g.x, 1., -g.y));
  vec3 V = normalize(uCam - vWorld);
  float fres = 0.02 + 0.98 * pow(1. - max(dot(n, V), 0.), 5.);
  vec3 R = reflect(-V, n); R.y = abs(R.y);
  vec3 refl = skyCol(normalize(R));
  float sp = max(dot(R, uSunDir), 0.);
  float glitter = 0.55 + 0.45 * vnoise(p * 3.1 + t * 0.7);
  vec3 spec = uSunColor * (pow(sp, 700.) * 6. * glitter + pow(sp, 90.) * 0.55 + pow(sp, 14.) * 0.07);
  // distance to the nearest shore / reef decides how shallow (bright, sandy) the water looks
  float d = 1e3; float reef = 0.;
  for (int i = 0; i < 12; i++) { if (i >= uIslandCount) break; vec4 isl = uIslands[i]; d = min(d, length(p - isl.xy) - isl.z); }
  for (int i = 0; i < 6; i++) { if (i >= uReefCount) break; vec4 r = uReefs[i]; reef = max(reef, 1. - smoothstep(0., r.z * 0.55, length(p - r.xy) - r.z * 0.5)); }
  float s = max(1. - smoothstep(0., 30., d), reef * 0.9);
  s = pow(s, 0.85);
  vec3 col = mix(uDeep, uMid, smoothstep(0., 0.45, s));
  col = mix(col, uShallow, smoothstep(0.3, 0.8, s));
  col = mix(col, uSand * 0.85 + uShallow * 0.3, smoothstep(0.8, 1., s) * 0.5 * uClarity);
  col += uSunColor * caustic(p * 0.4, t) * s * 0.2 * uClarity * fine;
  col += uShallow * 0.08 * pow(max(dot(n, uSunDir), 0.), 2.) + 0.035 * vH;
  float crest = smoothstep(0.82, 1., vH + 0.15 * vnoise(p * 0.7 + t * 0.3)) * 0.18 * fine;
  col = mix(col, uFoam, crest);
  float mg = uMarker.w * (1. - smoothstep(uMarker.z * 0.15, uMarker.z * 1.6, length(p - uMarker.xy)));
  col += vec3(0.55, 0.95, 0.75) * mg * 0.42 + vec3(1., 0.84, 0.35) * mg * 0.12;
  float bd = length(p - uBoat.xy);
  col += uFoam * (smoothstep(3.4, 1.0, bd)) * 0.07 * (0.4 + min(uBoat.z, 3.) * 0.2) * (0.6 + 0.4 * vnoise(p * 2.3 - t));
  vec3 color = mix(col, refl, clamp(fres, 0., 1.) * 0.92);
  color += spec * (0.35 + 0.65 * fres);
  color += uFoam * uGlow * 0.04;
  float f = 1. - exp(-uFogDensity * uFogDensity * dist * dist);
  color = mix(color, uFog, f);
  float alpha = mix(0.985, 0.34, smoothstep(0.25, 0.95, s * uClarity));
  alpha = mix(alpha, 1., f);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** polar mesh: dense around the camera, geometrically sparser toward the horizon (about 15k triangles on high) */
function polarGrid(rings: number, segments: number, r0: number, growth: number): T.BufferGeometry {
    const pos: number[] = [], idx: number[] = [];
    pos.push(0, 0, 0);
    for (let i = 0; i < rings; i++) {
        const r = r0 * Math.pow(growth, i);
        for (let j = 0; j < segments; j++) { const a = j / segments * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
    }
    for (let j = 0; j < segments; j++) idx.push(0, 1 + (j + 1) % segments, 1 + j);
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < segments; j++) {
        const a = 1 + i * segments + j, b = 1 + i * segments + (j + 1) % segments, c = a + segments, d = b + segments;
        idx.push(a, b, c, b, d, c);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
}
export interface WaterTargets {
    boat: { x: number; z: number; speed: number; heading: number };
    marker: { x: number; z: number; radius: number; glow: number };
}
export class Ocean {
    readonly mesh: T.Mesh;
    readonly seabed: T.Mesh;
    private material: T.ShaderMaterial;
    constructor(env: EnvStyle, quality: 'high' | 'medium' | 'low', islands: { x: number; y: number; r: number }[], reefs: { x: number; y: number; r: number }[]) {
        const u = (v: unknown) => ({ value: v });
        const isl = Array.from({ length: 12 }, (_, i) => islands[i] ? new T.Vector4(islands[i].x, -islands[i].y, islands[i].r * 1.02, 0) : new T.Vector4());
        const ref = Array.from({ length: 6 }, (_, i) => reefs[i] ? new T.Vector4(reefs[i].x, -reefs[i].y, reefs[i].r, 0) : new T.Vector4());
        this.material = new T.ShaderMaterial({
            vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, fog: false, toneMapped: false,
            uniforms: {
                uTime: u(0), uAmp: u(env.water.amp), uCam: u(new T.Vector3()), uSunDir: u(sunDirection(env)), uSunColor: u(new T.Color(env.sunColor)), uZenith: u(new T.Color(env.zenith)), uHorizon: u(new T.Color(env.horizon)),
                uDeep: u(new T.Color(env.water.deep)), uMid: u(new T.Color(env.water.mid)), uShallow: u(new T.Color(env.water.shallow)), uSand: u(new T.Color(env.water.sand)), uFoam: u(new T.Color(env.water.foam)), uFog: u(new T.Color(env.fog)),
                uFogDensity: u(env.fogDensity), uClarity: u(env.water.clarity), uDetail: u(quality === 'low' ? 0.5 : 1), uIslands: u(isl), uIslandCount: u(Math.min(12, islands.length)), uReefs: u(ref), uReefCount: u(Math.min(6, reefs.length)),
                uBoat: u(new T.Vector4()), uMarker: u(new T.Vector4()), uGlow: u(0),
            },
        });
        const geo = quality === 'high' ? polarGrid(64, 128, 1.6, 1.095) : quality === 'medium' ? polarGrid(52, 96, 2, 1.115) : polarGrid(40, 72, 2.4, 1.15);
        this.mesh = new T.Mesh(geo, this.material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 2;
        const sand = new T.MeshLambertMaterial({ color: env.water.sand });
        this.seabed = new T.Mesh(new T.PlaneGeometry(2600, 2600).rotateX(-Math.PI / 2), sand);
        this.seabed.position.y = SEABED_Y;
        this.seabed.renderOrder = 0;
    }
    update(time: number, cam: T.Vector3, targets: WaterTargets, glow: number) {
        const u = this.material.uniforms;
        u.uTime.value = time;
        u.uCam.value.copy(cam);
        this.mesh.position.set(cam.x, 0, cam.z);
        this.seabed.position.x = cam.x;
        this.seabed.position.z = cam.z;
        u.uBoat.value.set(targets.boat.x, targets.boat.z, targets.boat.speed, targets.boat.heading);
        u.uMarker.value.set(targets.marker.x, targets.marker.z, targets.marker.radius, targets.marker.glow);
        u.uGlow.value = glow;
    }
    dispose() { this.mesh.geometry.dispose(); this.material.dispose(); this.seabed.geometry.dispose(); (this.seabed.material as T.Material).dispose(); }
}
