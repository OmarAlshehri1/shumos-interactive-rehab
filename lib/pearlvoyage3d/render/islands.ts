import * as T from 'three';
import type { Island } from '../stages';
import type { EnvStyle } from './environments';
import { SEABED_Y } from './environments';
import { fbm, lerp, merge, noise2, paint, place, rng, smooth, vertexMaterial } from './util';

type Kind = Island['kind'];
const KIND_TOP: Record<Kind, number> = { sand: 1.6, lush: 5.5, rocky: 10, karst: 3.2 };
const radial = (isl: Island, ang: number) => isl.r * (1 + 0.16 * (fbm(Math.cos(ang) * 1.4 + isl.seed, Math.sin(ang) * 1.4, isl.seed) - 0.5) * 2);
/** island height at local (x, z); 0 is the waterline and the profile continues down into the sea floor */
export function islandHeight(isl: Island, x: number, z: number): number {
    const rho = Math.hypot(x, z), ang = Math.atan2(z, x);
    const u = rho / radial(isl, ang);
    if (u >= 1) return -(SEABED_Y * -1 + 0.4) * smooth(1, 1.75, u) + 0.05 * (1 - smooth(1, 1.2, u));
    const p = 1 - u, top = KIND_TOP[isl.kind];
    const beach = 0.6 * Math.pow(Math.min(1, p / 0.16), 1.15);
    const body = smooth(0.14, isl.kind === 'rocky' ? 0.42 : 0.8, p);
    const detail = (fbm(x * 0.16 + isl.seed, z * 0.16, isl.seed + 2) - 0.45) * (isl.kind === 'sand' ? 1.1 : isl.kind === 'rocky' ? 5.5 : 2.6) * body;
    const ridge = isl.kind === 'rocky' ? Math.abs(noise2(x * 0.12 + isl.seed, z * 0.12, 5) - 0.5) * 6 * body : 0;
    return beach + (top - 0.6) * Math.pow(body, isl.kind === 'rocky' ? 0.8 : 1.25) + detail + ridge;
}
function terrain(isl: Island, env: EnvStyle): T.BufferGeometry {
    const AN = 80, RN = 30, pos: number[] = [], col: number[] = [], idx: number[] = [];
    const sandA = new T.Color(env.sand[0]), sandB = new T.Color(env.sand[1]), wet = new T.Color(env.sand[1]).multiplyScalar(0.62);
    const gA = new T.Color(env.grass[0]), gB = new T.Color(env.grass[1]), rA = new T.Color(env.rock[0]), rB = new T.Color(env.rock[1]);
    const c = new T.Color();
    const hAt = (x: number, z: number) => islandHeight(isl, x, z);
    for (let i = 0; i <= RN; i++) {
        for (let j = 0; j < AN; j++) {
            const ang = j / AN * Math.PI * 2;
            const u = i === 0 ? 0 : Math.pow(i / RN, 0.9) * 1.95;
            const rho = u * radial(isl, ang);
            const x = Math.cos(ang) * rho, z = Math.sin(ang) * rho, h = hAt(x, z);
            pos.push(x, h, z);
            const e = 0.8;
            const slope = Math.hypot(hAt(x + e, z) - hAt(x - e, z), hAt(x, z + e) - hAt(x, z - e)) / (2 * e);
            const n = fbm(x * 0.4, z * 0.4, isl.seed);
            if (h < 0.08) c.copy(wet).lerp(sandB, smooth(-0.6, 0.08, h));
            else if (h < 0.85 || (isl.kind === 'sand' && h < 1.5 && n < 0.62)) c.copy(sandA).lerp(sandB, n * 0.9);
            else if (slope > (isl.kind === 'rocky' ? 0.55 : 0.95) || (isl.kind === 'rocky' && h > 5.5)) c.copy(rA).lerp(rB, n);
            else c.copy(gA).lerp(gB, n * 0.9 + (h > 2 ? 0.1 : 0));
            if (h > 0.5 && h < 1.5) c.lerp(sandA, 0.4 * (1 - smooth(0.5, 1.5, h)));
            col.push(c.r, c.g, c.b);
        }
    }
    for (let i = 0; i < RN; i++) for (let j = 0; j < AN; j++) {
        const a = i * AN + j, b = i * AN + (j + 1) % AN, cc = (i + 1) * AN + j, d = (i + 1) * AN + (j + 1) % AN;
        idx.push(a, b, cc, b, d, cc);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}
export function tube(points: T.Vector3[], radiusAt: (t: number) => number, colorAt: (t: number, ring: number) => T.Color, radial = 7): T.BufferGeometry {
    const curve = new T.CatmullRomCurve3(points);
    const rings = 14, pos: number[] = [], col: number[] = [], idx: number[] = [];
    const up = new T.Vector3(0, 0, 1);
    for (let i = 0; i <= rings; i++) {
        const t = i / rings, p = curve.getPoint(t), tan = curve.getTangent(t);
        const s = new T.Vector3().crossVectors(tan, up).normalize(), v = new T.Vector3().crossVectors(s, tan).normalize();
        const r = radiusAt(t), c = colorAt(t, i);
        for (let k = 0; k < radial; k++) {
            const a = k / radial * Math.PI * 2;
            pos.push(p.x + (s.x * Math.cos(a) + v.x * Math.sin(a)) * r, p.y + (s.y * Math.cos(a) + v.y * Math.sin(a)) * r, p.z + (s.z * Math.cos(a) + v.z * Math.sin(a)) * r);
            col.push(c.r, c.g, c.b);
        }
    }
    for (let i = 0; i < rings; i++) for (let k = 0; k < radial; k++) {
        const a = i * radial + k, b = i * radial + (k + 1) % radial, c = a + radial, d = b + radial;
        idx.push(a, c, b, b, c, d);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}
/** curved palm with ringed trunk, arched serrated fronds and coconuts; one merged geometry */
export function palm(env: EnvStyle, seed: number, height: number, leanDir: number, lean: number): T.BufferGeometry {
    const r = rng(seed);
    const parts: T.BufferGeometry[] = [];
    const bark = new T.Color(env.palm.trunk), c = new T.Color();
    const pts = Array.from({ length: 6 }, (_, i) => { const t = i / 5; return new T.Vector3(Math.cos(leanDir) * lean * t * t * height * 0.3, height * t, Math.sin(leanDir) * lean * t * t * height * 0.3); });
    parts.push(tube(pts, t => 0.34 * (1 - 0.5 * t) + 0.16 * Math.pow(1 - t, 6), (t, ring) => c.copy(bark).multiplyScalar(ring % 2 ? 0.78 : 1.02).lerp(new T.Color('#caa97c'), 0.12 * t).clone()));
    const crown = pts[5].clone();
    const frondA = new T.Color(env.palm.frond[0]), frondB = new T.Color(env.palm.frond[1]);
    const count = 10;
    for (let f = 0; f < count; f++) {
        const phi = f / count * Math.PI * 2 + r() * 0.4, L = 3.4 + r() * 1.2, lift = 0.55 + r() * 0.5, droop = 1.1 + r() * 0.8;
        const S = 12, pos: number[] = [], col: number[] = [], idx: number[] = [];
        for (let i = 0; i <= S; i++) {
            const t = i / S;
            const cx = Math.cos(phi) * L * t, cz = Math.sin(phi) * L * t, cy = lift * L * t * (1 - t * 0.2) - droop * L * t * t * 0.62;
            const nx = Math.cos(phi + Math.PI / 2), nz = Math.sin(phi + Math.PI / 2);
            const w = 0.78 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.04)), 0.62) * (1 - 0.3 * t) * (i % 2 ? 1 : 0.8);
            pos.push(crown.x + cx + nx * w, crown.y + cy - w * 0.32, crown.z + cz + nz * w, crown.x + cx, crown.y + cy + 0.045, crown.z + cz, crown.x + cx - nx * w, crown.y + cy - w * 0.32, crown.z + cz - nz * w);
            const k = new T.Color().copy(frondA).lerp(frondB, t * 0.8 + (r() - 0.5) * 0.1), mid = k.clone().lerp(new T.Color('#c8e36a'), 0.18);
            col.push(k.r, k.g, k.b, mid.r, mid.g, mid.b, k.r, k.g, k.b);
        }
        for (let i = 0; i < S; i++) { const a = i * 3, b = a + 3; idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1); }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        parts.push(g);
    }
    for (let k = 0; k < 3; k++) parts.push(paint(place(new T.IcosahedronGeometry(0.22, 1), [crown.x + Math.cos(k * 2.1) * 0.3, crown.y - 0.3, crown.z + Math.sin(k * 2.1) * 0.3]), '#6b4a2b', 0.2, seed + k));
    return merge(parts);
}
function rock(env: EnvStyle, seed: number, size: number, moss: number): T.BufferGeometry {
    const r = rng(seed);
    const g = new T.IcosahedronGeometry(1, 2);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), n = 0.78 + fbm(x * 1.7 + seed, z * 1.7 + y, seed) * 0.5;
        pos.setXYZ(i, x * n, y * n * 0.7, z * n);
    }
    g.computeVertexNormals();
    const a = new T.Color(env.rock[0]), b = new T.Color(env.rock[1]), grass = new T.Color(env.grass[0]);
    paint(g, (x, y, z) => { const t = fbm(x * 2, z * 2, seed); const c = a.clone().lerp(b, t); if (y > 0.35 && moss > 0) c.lerp(grass, moss * smooth(0.25, 0.7, y)); return c; }, 0.06, seed);
    return place(g, [0, 0, 0], [0, r() * 6, 0], [size * (0.9 + r() * 0.5), size * (0.8 + r() * 0.5), size * (0.9 + r() * 0.5)]);
}
const bush = (env: EnvStyle, seed: number, s: number) => paint(place(new T.IcosahedronGeometry(1, 1), [0, s * 0.35, 0], [0, 0, 0], [s * 1.2, s * 0.8, s]), (x, y) => new T.Color(env.grass[0]).lerp(new T.Color(env.grass[1]), (y + 1) * 0.5), 0.2, seed);
function starfish(seed: number): T.BufferGeometry {
    const shape = new T.Shape();
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? 0.1 : 0.32; if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    return paint(place(new T.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false }), [0, 0.03, 0], [-Math.PI / 2, 0, seed]), '#e8502f', 0.1, seed);
}
function pier(env: EnvStyle, length: number): T.BufferGeometry {
    const parts: T.BufferGeometry[] = [], wood = new T.Color('#9a7448');
    for (let i = 0; i < length * 2.2; i++) parts.push(paint(place(new T.BoxGeometry(2.2, 0.12, 0.34), [0, 0.95, i * 0.45]), wood.clone().multiplyScalar(0.85 + (i * 37 % 10) / 40), 0.08, i + 4));
    for (let i = 0; i <= length / 3; i++) for (const sx of [-1.05, 1.05]) parts.push(paint(place(new T.CylinderGeometry(0.13, 0.15, 3.4, 7), [sx, -0.3, i * 3]), '#6e5232', 0.15, i + 9));
    parts.push(paint(place(new T.BoxGeometry(0.12, 0.12, length), [-1.05, 1.5, length / 2]), '#8a6a42'), paint(place(new T.BoxGeometry(0.12, 0.12, length), [1.05, 1.5, length / 2]), '#8a6a42'));
    return merge(parts);
}
function lighthouse(): T.BufferGeometry {
    const parts: T.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) parts.push(paint(place(new T.CylinderGeometry(1.7 - (i + 1) * 0.14, 1.7 - i * 0.14, 2.1, 20), [0, 1.05 + i * 2.1, 0]), i % 2 ? '#d6403a' : '#f7f3ea'));
    parts.push(paint(place(new T.CylinderGeometry(1.9, 1.9, 0.25, 20), [0, 12.7, 0]), '#3a3d46'), paint(place(new T.CylinderGeometry(1.1, 1.1, 1.8, 16), [0, 13.8, 0]), '#ffe9a8'), paint(place(new T.ConeGeometry(1.5, 1.5, 16), [0, 15.45, 0]), '#d6403a'), paint(place(new T.SphereGeometry(0.2, 8, 6), [0, 16.3, 0]), '#3a3d46'));
    return merge(parts);
}
function karstPillar(env: EnvStyle, seed: number, h: number, r0: number): T.BufferGeometry {
    const g = new T.CylinderGeometry(r0 * 0.7, r0, h, 14, 14, true);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), t = (y + h / 2) / h, n = 0.8 + fbm(x * 0.5 + seed, y * 0.35 + z * 0.5, seed) * 0.55 + Math.sin(y * 0.5 + seed) * 0.08;
        pos.setXYZ(i, x * n * (1 + 0.28 * Math.sin(t * Math.PI)), y, z * n * (1 + 0.28 * Math.sin(t * Math.PI)));
    }
    g.computeVertexNormals();
    const a = new T.Color('#c9b29a'), b = new T.Color(env.rock[1]);
    paint(g, (x, y, z) => a.clone().lerp(b, fbm(x * 0.5, y * 0.15 + z * 0.4, seed)).multiplyScalar(0.85 + 0.2 * Math.sin(Math.atan2(z, x) * 4 + seed)), 0.05, seed);
    const cap = paint(place(new T.IcosahedronGeometry(r0 * 0.78, 1), [0, h / 2 - 0.2, 0], [0, 0, 0], [1.2, 0.5, 1.2]), (x, y) => new T.Color(env.grass[0]).lerp(new T.Color(env.grass[1]), (y + 1) * 0.4), 0.18, seed);
    return merge([g, cap]);
}
function rowboat(): T.BufferGeometry {
    const parts: T.BufferGeometry[] = [];
    const hull = new T.SphereGeometry(1, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    parts.push(paint(place(hull.clone(), [0, 0.55, 0], [0, 0, 0], [0.62, 0.5, 1.9]), '#9c7a4e', 0.1, 5));
    parts.push(paint(place(new T.BoxGeometry(1.0, 0.07, 0.3), [0, 0.5, 0.2]), '#b48e5c'), paint(place(new T.BoxGeometry(1.0, 0.07, 0.3), [0, 0.5, -0.8]), '#b48e5c'));
    parts.push(paint(place(new T.CylinderGeometry(0.03, 0.03, 2, 6), [0.55, 0.62, 0.3], [0, 0, 1.2]), '#caa97c'));
    hull.dispose();
    return merge(parts);
}
function foamRing(isl: Island, env: EnvStyle): T.Mesh {
    const AN = 96, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= AN; j++) {
        const ang = j / AN * Math.PI * 2, R = radial(isl, ang);
        for (let k = 0; k < 2; k++) { const rr = R * (k ? 1.1 : 0.97) + (k ? 1.4 : 0); pos.push(Math.cos(ang) * rr, 0.04, Math.sin(ang) * rr); uv.push(j / AN * 24, k); }
    }
    for (let j = 0; j < AN; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new T.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false, uniforms: { uTime: { value: 0 }, uColor: { value: new T.Color(env.water.foam) }, uSeed: { value: isl.seed } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uSeed; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        void main(){
          float w = sin(uTime*0.8 + vUv.x*0.7 + uSeed) * 0.5 + 0.5;
          float edge = smoothstep(0., 0.22 + w*0.12, vUv.y) * (1. - smoothstep(0.35 + w*0.25, 1., vUv.y));
          float lace = vn(vec2(vUv.x*2.2 + uTime*0.2, vUv.y*7. - uTime*0.3 + uSeed));
          float a = edge * smoothstep(0.28, 0.75, lace) * (0.55 + 0.35*w) + (1.-smoothstep(0.,0.14,vUv.y)) * 0.55;
          gl_FragColor = vec4(uColor, clamp(a, 0., 0.85));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new T.Mesh(g, m);
    mesh.renderOrder = 3;
    return mesh;
}
export interface BuiltIsland {
    group: T.Group;
    foam: T.ShaderMaterial;
}
/** a complete island: shaped terrain, palms, rocks, beach details and (per environment) a landmark */
export function buildIsland(isl: Island, env: EnvStyle, index: number, quality: 'high' | 'medium' | 'low', toward: { x: number; y: number }): BuiltIsland {
    const r = rng(isl.seed * 31 + 7);
    const group = new T.Group();
    group.position.set(isl.x, 0, -isl.y);
    const land = new T.Mesh(terrain(isl, env), vertexMaterial({ roughness: 0.95 }));
    group.add(land);
    const props: T.BufferGeometry[] = [];
    const density = quality === 'high' ? 1 : quality === 'medium' ? 0.7 : 0.45;
    const R = isl.r;
    const spot = (uMin: number, uMax: number, hMin: number, hMax: number, tries = 40): { x: number; y: number; z: number; ang: number } | null => {
        for (let k = 0; k < tries; k++) {
            const ang = r() * Math.PI * 2, u = lerp(uMin, uMax, r()), rho = u * radial(isl, ang), x = Math.cos(ang) * rho, z = Math.sin(ang) * rho, h = islandHeight(isl, x, z);
            if (h >= hMin && h <= hMax) return { x, y: h, z, ang };
        }
        return null;
    };
    const palms = Math.round((isl.kind === 'sand' ? 6 : isl.kind === 'lush' ? 13 : isl.kind === 'rocky' ? 4 : 5) * (R / 15) * density * env.palm.count);
    for (let i = 0; i < palms; i++) {
        const p = spot(0.25, 0.78, 0.7, isl.kind === 'rocky' ? 5 : 4.5);
        if (!p) continue;
        props.push(place(palm(env, isl.seed * 100 + i, 5 + r() * 4.5, p.ang + (r() - 0.5), 0.5 + r() * 0.7), [p.x, p.y - 0.1, p.z], [0, r() * 6, 0], 0.9 + r() * 0.4));
    }
    const rocks = Math.round((isl.kind === 'rocky' ? 16 : 8) * (R / 15) * density);
    for (let i = 0; i < rocks; i++) {
        const p = i % 3 === 0 ? spot(0.9, 1.25, -0.6, 0.4) : spot(0.45, 0.98, 0.3, 9);
        if (p) props.push(place(rock(env, isl.seed * 10 + i, 0.8 + r() * (isl.kind === 'rocky' ? 3 : 1.6), isl.kind === 'sand' ? 0 : 0.5), [p.x, p.y - 0.15, p.z]));
    }
    for (let i = 0; i < Math.round(9 * (R / 15) * density); i++) { const p = spot(0.35, 0.82, 1, 5); if (p) props.push(place(bush(env, i + isl.seed, 0.7 + r() * 0.9), [p.x, p.y, p.z], [0, r() * 6, 0])); }
    for (let i = 0; i < 5; i++) { const p = spot(0.8, 0.98, 0.1, 0.55); if (p) props.push(place(starfish(i + isl.seed), [p.x, p.y, p.z], [0, 0, 0], 1 + r() * 0.6)); }
    if (isl.kind === 'karst') { const n = 2 + (isl.seed % 2); for (let i = 0; i < n; i++) { const p = spot(0.15, 0.5, 1, 4); if (p) props.push(place(karstPillar(env, isl.seed + i, 13 + r() * 12, 2.2 + r() * 1.6), [p.x, p.y + 6, p.z])); } }
    const faceAng = Math.atan2(-(toward.y - isl.y), toward.x - isl.x);
    if (env.id === 'pearl-beach' && isl.kind === 'sand') {
        const edge = radial(isl, faceAng) * 0.96;
        props.push(place(pier(env, 11), [Math.cos(faceAng) * edge, -0.1, Math.sin(faceAng) * edge], [0, -faceAng + Math.PI / 2 - Math.PI, 0]));
    }
    if (env.id === 'pearl-beach' && index % 2 === 0) { const p = spot(0.82, 0.93, 0.15, 0.5); if (p) props.push(place(rowboat(), [p.x, p.y, p.z], [0, r() * 6, 0], 1.1)); }
    if (env.id === 'coral-bay' && isl.kind === 'rocky') { const p = spot(0.05, 0.25, 6, 14); if (p) props.push(place(lighthouse(), [p.x, p.y - 0.4, p.z])); }
    const propMesh = new T.Mesh(merge(props.length ? props : [paint(new T.BoxGeometry(0.01, 0.01, 0.01), '#fff')]), vertexMaterial({ roughness: 0.85, side: T.DoubleSide }));
    group.add(propMesh);
    const foam = foamRing(isl, env);
    group.add(foam);
    return { group, foam: foam.material as T.ShaderMaterial };
}
/** distant mountain ridges and far islands on the horizon, tinted by fog for atmospheric depth */
export function buildHorizon(env: EnvStyle, seed: number, quality: 'high' | 'medium' | 'low'): T.Group {
    const r = rng(seed * 17 + 3);
    const group = new T.Group();
    const parts: T.BufferGeometry[] = [];
    const base = new T.Color(env.mountain.color), far = new T.Color(env.mountain.far);
    const ridges = env.mountain.count * (quality === 'low' ? 1 : 2);
    for (let i = 0; i < ridges; i++) {
        const ang = (i / ridges + r() * 0.05) * Math.PI * 2, dist = 780 + r() * 330, w = 150 + r() * 230, h = env.mountain.height * (0.5 + r() * 0.9);
        const cone = new T.ConeGeometry(w, h, 9, 5);
        const pos = cone.getAttribute('position');
        for (let k = 0; k < pos.count; k++) { const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k), n = 0.7 + fbm(x * 0.02 + i, z * 0.02, seed) * 0.7; pos.setXYZ(k, x * n, y * (0.85 + fbm(x * 0.03, z * 0.03, i) * 0.4), z * n); }
        cone.computeVertexNormals();
        paint(cone, (x, y) => { const t = (y + h / 2) / h; return base.clone().lerp(far, 1 - t * 0.7).lerp(new T.Color(env.grass[0]), (1 - t) * 0.35); }, 0.06, i + seed);
        parts.push(place(cone, [Math.cos(ang) * dist, h / 2 - 8, Math.sin(ang) * dist], [0, r() * 6, 0], [1, 1, 0.6]));
    }
    for (let i = 0; i < 8; i++) {
        const ang = r() * Math.PI * 2, dist = 420 + r() * 330, s = 26 + r() * 38;
        const isle = paint(new T.IcosahedronGeometry(1, 1), (x, y) => y > -0.1 ? new T.Color(env.grass[0]).lerp(base, 0.55).lerp(new T.Color(env.grass[1]), 0.15) : new T.Color(env.sand[0]), 0.1, i + seed);
        parts.push(place(isle, [Math.cos(ang) * dist, 0, Math.sin(ang) * dist], [0, r() * 6, 0], [s * 1.8, s * (0.2 + r() * 0.3), s * 1.1]));
    }
    group.add(new T.Mesh(merge(parts), vertexMaterial({ roughness: 1, flat: true })));
    return group;
}
