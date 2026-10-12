import * as T from 'three';

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; s0: number; s1: number; c0: T.Color; c1: T.Color; a0: number; gravity: number; drag: number }
export interface Emit { pos: T.Vector3; vel?: T.Vector3; spread?: number; count: number; life: number; size: [number, number]; color: [T.ColorRepresentation, T.ColorRepresentation]; alpha?: number; gravity?: number; drag?: number; speed?: number }
/** CPU-simulated soft point sprites (splashes, wake foam, sparkles). One draw call per instance. */
export class Particles {
    readonly points: T.Points;
    private items: Particle[] = [];
    private pos: Float32Array; private size: Float32Array; private alpha: Float32Array; private col: Float32Array;
    private geo = new T.BufferGeometry();
    private mat: T.ShaderMaterial;
    constructor(private max: number, additive: boolean, seed = 1) {
        this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.col = new Float32Array(max * 3);
        this.geo.setAttribute('position', new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
        this.geo.setAttribute('aSize', new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage));
        this.geo.setAttribute('aAlpha', new T.BufferAttribute(this.alpha, 1).setUsage(T.DynamicDrawUsage));
        this.geo.setAttribute('aColor', new T.BufferAttribute(this.col, 3).setUsage(T.DynamicDrawUsage));
        this.mat = new T.ShaderMaterial({
            transparent: true, depthWrite: false, fog: false, blending: additive ? T.AdditiveBlending : T.NormalBlending, uniforms: { uScale: { value: 600 } },
            vertexShader: 'uniform float uScale; attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC; void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = aSize * uScale / max(0.5, -mv.z); }',
            fragmentShader: `varying float vA; varying vec3 vC;
            void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.12, d) * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            }`,
        });
        this.points = new T.Points(this.geo, this.mat);
        this.points.frustumCulled = false;
        this.points.renderOrder = additive ? 6 : 5;
        this.geo.setDrawRange(0, 0);
        void seed;
    }
    emit(e: Emit) {
        const c0 = new T.Color(e.color[0]), c1 = new T.Color(e.color[1]);
        for (let i = 0; i < e.count && this.items.length < this.max; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.random(), sp = (e.speed ?? 1) * (0.4 + Math.random() * 0.8), spread = e.spread ?? 1;
            const v = e.vel ?? new T.Vector3();
            this.items.push({
                x: e.pos.x, y: e.pos.y, z: e.pos.z, vx: v.x + Math.cos(a) * r * spread * sp, vy: v.y + (Math.random() - 0.2) * spread * sp, vz: v.z + Math.sin(a) * r * spread * sp, age: 0, life: e.life * (0.7 + Math.random() * 0.6),
                s0: e.size[0], s1: e.size[1], c0, c1, a0: e.alpha ?? 1, gravity: e.gravity ?? 0, drag: e.drag ?? 0,
            });
        }
    }
    update(dt: number, viewportHeight: number, fov: number) {
        this.mat.uniforms.uScale.value = viewportHeight * 0.5 / Math.tan(T.MathUtils.degToRad(fov) * 0.5);
        let n = 0;
        const tmp = new T.Color();
        this.items = this.items.filter(p => {
            p.age += dt;
            if (p.age >= p.life) return false;
            const k = Math.exp(-p.drag * dt);
            p.vx *= k; p.vy = p.vy * k - p.gravity * dt; p.vz *= k;
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            const u = p.age / p.life;
            this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
            this.size[n] = p.s0 + (p.s1 - p.s0) * u;
            this.alpha[n] = p.a0 * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85);
            tmp.copy(p.c0).lerp(p.c1, u);
            this.col[n * 3] = tmp.r; this.col[n * 3 + 1] = tmp.g; this.col[n * 3 + 2] = tmp.b;
            n++;
            return true;
        });
        this.geo.setDrawRange(0, n);
        for (const k of ['position', 'aSize', 'aAlpha', 'aColor']) this.geo.getAttribute(k).needsUpdate = true;
    }
    clear() { this.items = []; this.geo.setDrawRange(0, 0); }
    dispose() { this.geo.dispose(); this.mat.dispose(); }
}
