import * as T from 'three';
import { rng } from './util';
import type { EnvStyle } from './environments';

export const sunDirection = (env: EnvStyle) => {
    const el = T.MathUtils.degToRad(env.sky.elevation), az = T.MathUtils.degToRad(env.sky.azimuth);
    return new T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
};
const skyVertex = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`;
const skyFragment = `
precision highp float;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0., 1.);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
  col = mix(col, uHorizon, exp(-h * 9.) * 0.55);
  float s = max(dot(d, uSunDir), 0.);
  col += uSunColor * (pow(s, 1400.) * 9. + pow(s, 36.) * 0.45 + pow(s, 5.) * 0.16);
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** analytic gradient dome: the exact colours the water reflects and the fog fades to, so the horizon has no seam */
export function makeSky(env: EnvStyle) {
    const mat = new T.ShaderMaterial({ vertexShader: skyVertex, fragmentShader: skyFragment, side: T.BackSide, depthWrite: false, fog: false, toneMapped: false, uniforms: { uZenith: { value: new T.Color(env.zenith) }, uHorizon: { value: new T.Color(env.horizon) }, uSunDir: { value: sunDirection(env) }, uSunColor: { value: new T.Color(env.sunColor) } } });
    const mesh = new T.Mesh(new T.SphereGeometry(1, 48, 24), mat);
    mesh.scale.setScalar(2200);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    return mesh;
}
/** soft volumetric-looking cumulus: clusters of shaded puffs in ONE instanced draw call, slowly drifting */
export function makeClouds(env: EnvStyle, count: number, seed: number) {
    const r = rng(seed + 900);
    const geo = new T.IcosahedronGeometry(1, 2);
    const mat = new T.MeshStandardMaterial({ color: env.cloudTint, roughness: 1, metalness: 0, emissive: env.cloudTint, emissiveIntensity: 0.32, fog: false });
    const puffs: { m: T.Matrix4; c: T.Color }[] = [];
    const q = new T.Quaternion();
    for (let i = 0; i < count; i++) {
        // most clouds sit in the forward half of the sky where the boat looks; a few drift behind
        const front = i % 4 !== 3, ang = front ? -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.15 : r() * Math.PI * 2, dist = 520 + r() * 640, h = 70 + r() * 170, size = 40 + r() * 62;
        const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist;
        const n = 7 + Math.floor(r() * 7);
        for (let k = 0; k < n; k++) {
            const u = (k / n - 0.5) * 2;
            const sx = size * (0.55 + r() * 0.5) * (1 - Math.abs(u) * 0.35), sy = sx * (0.42 + r() * 0.2);
            const m = new T.Matrix4().compose(new T.Vector3(cx + u * size * 1.5 + (r() - 0.5) * 18, h + (1 - Math.abs(u)) * sy * 0.8 + r() * 6, cz + (r() - 0.5) * size * 0.7), q.setFromEuler(new T.Euler(0, r() * 6, 0)), new T.Vector3(sx, sy, sx * 0.8));
            puffs.push({ m, c: new T.Color().setHSL(0, 0, 0.9 + r() * 0.1) });
        }
    }
    const mesh = new T.InstancedMesh(geo, mat, puffs.length);
    puffs.forEach((p, i) => { mesh.setMatrixAt(i, p.m); mesh.setColorAt(i, p.c); });
    mesh.frustumCulled = false;
    const group = new T.Group();
    group.add(mesh);
    return group;
}
