import * as THREE from 'three';

/** Time of day 0..1: 0 dawn, .3 morning, .5 noon, .72 golden hour, .88 dusk, 1 night. Interpolated keyframes, never a hard cut. */
interface Key { t: number; top: string; horizon: string; sunCol: string; sunI: number; elev: number; hemiSky: string; hemiGround: string; hemiI: number; fog: string; night: number; shallow: string; deep: string }
const KEYS: Key[] = [
  { t: 0.0, top: '#6f9fe0', horizon: '#ffd6a6', sunCol: '#ffd29a', sunI: 2.0, elev: 0.28, hemiSky: '#cfe3ff', hemiGround: '#9a8466', hemiI: 0.9, fog: '#f3dcc0', night: 0, shallow: '#52d6c4', deep: '#1a6aa6' },
  { t: 0.3, top: '#4f97e8', horizon: '#d6efff', sunCol: '#fff1d2', sunI: 3.0, elev: 0.75, hemiSky: '#d8ecff', hemiGround: '#8fa56a', hemiI: 1.05, fog: '#d8ecf8', night: 0, shallow: '#3fd0c8', deep: '#1a6fb0' },
  { t: 0.5, top: '#3f8cf0', horizon: '#cfe9ff', sunCol: '#fffaf0', sunI: 3.3, elev: 0.98, hemiSky: '#d8ecff', hemiGround: '#88a860', hemiI: 1.1, fog: '#d3e8f6', night: 0, shallow: '#35d0cc', deep: '#125aa0' },
  { t: 0.72, top: '#4f7fd0', horizon: '#ffcf9a', sunCol: '#ffb66e', sunI: 2.4, elev: 0.42, hemiSky: '#e8c8a8', hemiGround: '#7a6a58', hemiI: 0.85, fog: '#f0cfa4', night: 0.15, shallow: '#4cc0b8', deep: '#18508c' },
  { t: 0.88, top: '#27388a', horizon: '#e69aa0', sunCol: '#ff9a6a', sunI: 1.1, elev: 0.14, hemiSky: '#9aa4e8', hemiGround: '#5a5578', hemiI: 1.25, fog: '#9a7a98', night: 0.55, shallow: '#2c8ea0', deep: '#142a6a' },
  { t: 1.0, top: '#0b1540', horizon: '#34498a', sunCol: '#a8bcff', sunI: 1.3, elev: 0.55, hemiSky: '#8a9cdc', hemiGround: '#3a4468', hemiI: 1.45, fog: '#2a3a70', night: 1, shallow: '#2a8aa8', deep: '#16398a' },
];
const cc = (s: string) => new THREE.Color(s);

export class Env {
  readonly sky: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.Fog;
  night = 0;
  sunDir = new THREE.Vector3();
  private uniforms: Record<string, THREE.IUniform>;
  shallow = new THREE.Color();
  deep = new THREE.Color();
  horizon = new THREE.Color();
  sunColor = new THREE.Color();

  constructor(scene: THREE.Scene, shadows: boolean, shadowSize: number) {
    this.uniforms = {
      uTop: { value: cc('#4f97e8') }, uHor: { value: cc('#d6efff') }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: cc('#fff') }, uNight: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform vec3 uTop, uHor, uSunDir, uSunCol; uniform float uNight; varying vec3 vP;
          float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
          void main(){
            float y = clamp(vP.y, -0.2, 1.0);
            vec3 c = mix(uHor, uTop, pow(max(y, 0.0), 0.55));
            c = mix(c, uHor, smoothstep(0.0, -0.2, vP.y));
            float sd = max(dot(vP, normalize(uSunDir)), 0.0);
            c += uSunCol * (pow(sd, 900.0) * 3.0 + pow(sd, 12.0) * 0.28);
            vec3 q = floor(vP * 260.0);
            float star = step(0.9965, h(q)) * smoothstep(0.05, 0.5, vP.y);
            c += vec3(star) * uNight * 0.9;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight('#d8ecff', '#88a860', 1.0);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff', 3);
    this.sun.castShadow = shadows;
    if (shadows) {
      const s = this.sun.shadow;
      s.mapSize.set(shadowSize, shadowSize);
      const r = 125;
      Object.assign(s.camera, { left: -r, right: r, top: r, bottom: -r, near: 10, far: 520 });
      s.bias = -0.0004; s.normalBias = 0.35;
    }
    scene.add(this.sun, this.sun.target);
    this.fog = new THREE.Fog('#d3e8f6', 190, 560);
    scene.fog = this.fog;
  }

  /** Waters' uniforms are pushed by the scene; this only computes the colours. */
  set(tod: number, lightsOn = 0): void {
    const t = Math.max(0, Math.min(1, tod));
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const k = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
    const L = (x: string, y: string, o: THREE.Color) => o.copy(cc(x)).lerp(cc(y), k);
    L(a.top, b.top, this.uniforms.uTop.value);
    L(a.horizon, b.horizon, this.uniforms.uHor.value);
    L(a.sunCol, b.sunCol, this.sunColor);
    L(a.hemiSky, b.hemiSky, this.hemi.color);
    L(a.hemiGround, b.hemiGround, this.hemi.groundColor);
    L(a.fog, b.fog, this.fog.color);
    L(a.shallow, b.shallow, this.shallow);
    L(a.deep, b.deep, this.deep);
    this.horizon.copy(this.uniforms.uHor.value);
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * k;
    this.hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * k;
    this.night = Math.min(1, a.night + (b.night - a.night) * k);
    const elev = a.elev + (b.elev - a.elev) * k;
    this.sunDir.set(-0.55, elev * 1.1 + 0.05, 0.6).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(260);
    this.uniforms.uSunDir.value.copy(this.sunDir);
    this.uniforms.uSunCol.value.copy(this.sunColor);
    this.uniforms.uNight.value = this.night;
    void lightsOn;
  }

  dispose() {
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
  }
}
