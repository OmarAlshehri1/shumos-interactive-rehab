import * as T from 'three';
import type { SpeciesId } from '../stages';
import { SPECIES } from '../stages';
import { merge, paint, place, rng, smooth } from './util';

/**
 * Original friendly fish. Local axes: head +Z, tail -Z, up +Y; body length is about 1 unit and `size` scales it to the scene.
 * A shared swim-bend vertex program undulates body and fins smoothly; dolphin bends vertically, the ray flaps its wings.
 */
export interface FishModel {
    group: T.Group;
    size: number;
    tick(time: number, energy: number): void;
    glow(v: number): void;
    dispose(): void;
}
const C = (h: string) => new T.Color(h);
const mix = (a: string, b: string, t: number) => C(a).lerp(C(b), Math.min(1, Math.max(0, t)));
interface Shape { pw: number; q: number; H: number; W: number; ped: number; head?: number }
const prof = (s: Shape, t: number) => Math.max(Math.pow(Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, t)), s.pw)), s.q), s.ped * Math.max(0, 1 - t * 4));
type ColorFn = (t: number, sy: number, sx: number) => T.Color;
function loft(s: Shape, color: ColorFn, along = 26, around = 16): T.BufferGeometry {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let i = 0; i <= along; i++) {
        const t = i / along, z = t - 0.5, f = prof(s, t);
        for (let k = 0; k < around; k++) {
            const a = k / around * Math.PI * 2, cx = Math.cos(a), sy = Math.sin(a);
            pos.push(cx * s.W * f, sy * s.H * f * (sy < 0 ? 0.9 : 1), z);
            const c = color(t, sy, cx);
            col.push(c.r, c.g, c.b);
        }
    }
    for (let i = 0; i < along; i++) for (let k = 0; k < around; k++) {
        const a = i * around + k, b = i * around + (k + 1) % around, c = a + around, d = b + around;
        idx.push(a, b, c, b, d, c);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}
/** vertical fin polygon in (z, y) rotated into the YZ plane, coloured by a gradient function of (z, y) */
function fin(points: [number, number][], color: (z: number, y: number) => T.Color): T.BufferGeometry {
    const g = new T.ShapeGeometry(new T.Shape(points.map(p => new T.Vector2(p[0], p[1]))), 6);
    g.rotateY(-Math.PI / 2);
    const pos = g.getAttribute('position');
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const c = color(pos.getZ(i), pos.getY(i)); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(arr, 3));
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    return g;
}
function pectoral(side: number, w: number, y0: number, z0: number, size: number, c1: T.Color, c2: T.Color, tilt = 0.5): T.BufferGeometry {
    const sh = new T.Shape();
    sh.moveTo(0, 0.02); sh.quadraticCurveTo(size * 0.9, size * 0.1, size, size * 0.55); sh.quadraticCurveTo(size * 0.55, size * 0.75, 0.0, size * 0.34); sh.lineTo(0, 0.02);
    const g = new T.ShapeGeometry(sh, 6);
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const a = pos.getX(i), b = pos.getY(i);
        pos.setXYZ(i, side * (w + a * Math.cos(tilt)), y0 - a * Math.sin(tilt), z0 - b);
        const c = c1.clone().lerp(c2, a / size);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
}
function eyes(z: number, y: number, w: number, r: number, tilt = 0): T.BufferGeometry[] {
    const out: T.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
        const x = side * w, base = [x, y, z] as [number, number, number];
        out.push(paint(place(new T.SphereGeometry(r, 14, 10), base, [0, 0, 0], [0.7, 1, 1]), '#fffdf6'));
        out.push(paint(place(new T.SphereGeometry(r * 0.62, 12, 8), [x + side * r * 0.32, y, z + r * 0.18 + tilt]), '#14181f'));
        out.push(paint(place(new T.SphereGeometry(r * 0.2, 8, 6), [x + side * r * 0.62, y + r * 0.28, z + r * 0.34 + tilt]), '#ffffff'));
    }
    return out;
}
const topY = (s: Shape, t: number) => s.H * prof(s, t);
function dorsal(s: Shape, t0: number, t1: number, h: number, color: (s: number) => T.Color, belly = false, lean = 0.35): T.BufferGeometry {
    const pts: [number, number][] = [];
    const sgn = belly ? -1 : 1;
    const n = 9;
    for (let i = 0; i <= n; i++) { const u = i / n, t = t0 + (t1 - t0) * u; pts.push([t - 0.5, sgn * topY(s, t) * 0.92]); }
    for (let i = n; i >= 0; i--) { const u = i / n, t = t0 + (t1 - t0) * u; pts.push([t - 0.5 - lean * h * u * 0.8 * (1 - u * 0.2), sgn * (topY(s, t) * 0.9 + h * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.96 + 0.02)), 0.75) * (0.55 + 0.45 * u))]); }
    return fin(pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-4), (z, y) => color(Math.min(1, Math.abs(y) / (topY(s, 0.5) + h))));
}
function tailFin(style: 'round' | 'fork' | 'lunate' | 'fan', ped: number, h: number, len: number, color: (u: number, v: number) => T.Color): T.BufferGeometry {
    const z0 = -0.5 + 0.02;
    const pts: [number, number][] = [];
    const arc = (n: number, f: (u: number) => [number, number]) => { for (let i = 0; i <= n; i++) pts.push(f(i / n)); };
    if (style === 'round') arc(14, u => { const a = (u - 0.5) * Math.PI * 0.95; return [z0 - len * Math.cos(a) * 0.9 - 0.01, Math.sin(a) * h]; });
    else if (style === 'fork') { pts.push([z0, ped], [z0 - len * 0.85, h], [z0 - len * 0.45, h * 0.12], [z0 - len * 0.45, -h * 0.12], [z0 - len * 0.85, -h], [z0, -ped]); }
    else if (style === 'lunate') { pts.push([z0, ped], [z0 - len * 0.55, h * 0.75], [z0 - len, h * 1.05], [z0 - len * 0.55, h * 0.25], [z0 - len * 0.45, 0], [z0 - len * 0.55, -h * 0.25], [z0 - len, -h * 1.05], [z0 - len * 0.55, -h * 0.75], [z0, -ped]); }
    else arc(18, u => { const a = (u - 0.5) * Math.PI; return [z0 - len * (0.35 + 0.65 * Math.cos(a)), Math.sin(a) * h * 1.15]; });
    if (style !== 'fork' && style !== 'lunate') { pts.unshift([z0, ped]); pts.push([z0, -ped]); }
    return fin(pts, (z, y) => color(Math.min(1, (z0 - z) / len), Math.min(1, Math.abs(y) / h)));
}
interface Species {
    shape: Shape; color: ColorFn; tail: { style: 'round' | 'fork' | 'lunate' | 'fan'; h: number; len: number; c: [string, string] };
    dorsal?: { t0: number; t1: number; h: number; c: [string, string]; lean?: number }; anal?: { t0: number; t1: number; h: number; c: [string, string] };
    pect: { size: number; c: [string, string] }; eye: { t: number; r: number }; size: number; freq: number; amp: number; extras?: (s: Shape) => T.BufferGeometry[];
}
const SP: Partial<Record<SpeciesId, Species>> = {
    'orange-stripe': {
        shape: { pw: 1.4, q: 0.62, H: 0.31, W: 0.17, ped: 0.2 }, size: 2.1, freq: 5.2, amp: 0.1, pect: { size: 0.2, c: ['#ff9a3d', '#ffd7a0'] }, eye: { t: 0.83, r: 0.06 },
        color: (t, sy) => { const stripe = (c: number, w: number) => Math.max(0, 1 - Math.abs(t - c) / w); const white = Math.max(stripe(0.76, 0.045), stripe(0.5, 0.05), stripe(0.25, 0.035)); const edge = Math.max(stripe(0.76, 0.075), stripe(0.5, 0.082), stripe(0.25, 0.062)) - white; return mix('#ff7a1c', '#ffb14a', (sy + 1) * 0.25 - 0.1).lerp(C('#ffffff'), white > 0.15 ? 0.95 : 0).lerp(C('#1d1410'), edge > 0.15 ? 0.82 : 0); },
        tail: { style: 'round', h: 0.3, len: 0.3, c: ['#ff8a2a', '#ffd08a'] }, dorsal: { t0: 0.22, t1: 0.84, h: 0.2, c: ['#ff8a2a', '#ffe0a8'], lean: 0.2 }, anal: { t0: 0.3, t1: 0.6, h: 0.14, c: ['#ff9a3d', '#ffe8c0'] },
    },
    'royal-blue': {
        shape: { pw: 1.3, q: 0.58, H: 0.29, W: 0.13, ped: 0.15 }, size: 2.3, freq: 5.6, amp: 0.1, pect: { size: 0.22, c: ['#3c78ff', '#ffe27a'] }, eye: { t: 0.84, r: 0.058 },
        color: (t, sy) => { const patch = Math.max(0, 1 - Math.hypot((t - 0.42) / 0.3, (sy - 0.15) / 0.55)); return mix('#2057ff', '#5ac8ff', (sy + 1) * 0.3 - 0.05).lerp(C('#10205c'), smooth(0.2, 0.85, patch) * 0.9).lerp(C('#ffd23f'), t < 0.14 ? 0.8 : 0); },
        tail: { style: 'lunate', h: 0.3, len: 0.32, c: ['#ffd23f', '#ffe9a0'] }, dorsal: { t0: 0.18, t1: 0.82, h: 0.22, c: ['#2f6bff', '#8fd0ff'], lean: 0.4 }, anal: { t0: 0.2, t1: 0.62, h: 0.18, c: ['#2f6bff', '#8fd0ff'] },
    },
    butterfly: {
        shape: { pw: 1.15, q: 0.55, H: 0.46, W: 0.1, ped: 0.12 }, size: 1.9, freq: 5.8, amp: 0.08, pect: { size: 0.18, c: ['#ffe45a', '#fff6c0'] }, eye: { t: 0.86, r: 0.056 },
        color: (t, sy) => { const band = Math.max(0, 1 - Math.abs(t - 0.87) / 0.045); const band2 = Math.max(0, 1 - Math.abs(t - 0.1) / 0.05); return mix('#ffd21f', '#fff0a0', (1 - sy) * 0.15).lerp(C('#1c1c28'), band > 0.2 || band2 > 0.2 ? 0.9 : 0).lerp(C('#fffbe8'), t > 0.93 ? 0.7 : 0); },
        tail: { style: 'round', h: 0.26, len: 0.2, c: ['#ffe45a', '#fff6c0'] }, dorsal: { t0: 0.1, t1: 0.9, h: 0.24, c: ['#ffd21f', '#fff3b0'], lean: 0.4 }, anal: { t0: 0.1, t1: 0.7, h: 0.2, c: ['#ffd21f', '#fff3b0'] },
    },
    puffer: {
        shape: { pw: 1.0, q: 0.45, H: 0.43, W: 0.4, ped: 0.1 }, size: 1.7, freq: 6.4, amp: 0.06, pect: { size: 0.17, c: ['#ffb8cc', '#ffffff'] }, eye: { t: 0.78, r: 0.085 },
        color: (t, sy, sx) => { const dot = Math.sin(t * 38) * Math.sin(sx * 7) * Math.cos(sy * 6) > 0.72; return mix('#ff7fa6', '#ffb6cc', (sy + 1) * 0.3).lerp(C('#fff4f8'), smooth(-0.2, -0.85, sy) * 0.9).lerp(C('#e84f86'), dot ? 0.5 : 0); },
        tail: { style: 'fan', h: 0.18, len: 0.2, c: ['#ff9bb9', '#ffe6ee'] }, dorsal: { t0: 0.24, t1: 0.4, h: 0.12, c: ['#ff9bb9', '#ffe6ee'], lean: 0.3 }, anal: { t0: 0.26, t1: 0.4, h: 0.1, c: ['#ff9bb9', '#ffe6ee'] },
        extras: () => [paint(place(new T.SphereGeometry(0.035, 8, 6), [0, -0.04, 0.485]), '#c84a74'), paint(place(new T.SphereGeometry(0.03, 8, 6), [0.05, 0.03, 0.46]), '#ffd9e5')],
    },
    parrot: {
        shape: { pw: 1.2, q: 0.5, H: 0.27, W: 0.18, ped: 0.22 }, size: 2.5, freq: 4.8, amp: 0.09, pect: { size: 0.22, c: ['#3fd7a5', '#9be9ff'] }, eye: { t: 0.8, r: 0.055 },
        color: (t, sy, sx) => { const scale = Math.sin(t * 46 + sx * 3) * Math.sin(sy * 9) > 0.55; return mix('#1fbf84', '#5ee3b0', (sy + 1) * 0.3).lerp(C('#33b8d8'), smooth(0.1, -0.9, sy) * 0.8).lerp(C('#ff7bd0'), scale ? 0.28 : 0).lerp(C('#ffb3e6'), t > 0.9 ? 0.6 : 0); },
        tail: { style: 'fan', h: 0.26, len: 0.3, c: ['#27c58b', '#ff9bd8'] }, dorsal: { t0: 0.16, t1: 0.82, h: 0.17, c: ['#2fd39a', '#ff9bd8'], lean: 0.2 }, anal: { t0: 0.2, t1: 0.62, h: 0.14, c: ['#33b8d8', '#9be9ff'] },
        extras: () => [paint(place(new T.BoxGeometry(0.13, 0.1, 0.07), [0, -0.035, 0.5], [0.1, 0, 0]), '#fff0d0'), paint(place(new T.BoxGeometry(0.14, 0.04, 0.07), [0, -0.095, 0.495]), '#ffe4b0')],
    },
    angel: {
        shape: { pw: 1.1, q: 0.6, H: 0.5, W: 0.09, ped: 0.1 }, size: 2.1, freq: 4.4, amp: 0.07, pect: { size: 0.16, c: ['#b07bff', '#ffe27a'] }, eye: { t: 0.86, r: 0.055 },
        color: (t, sy) => { const line = Math.sin(t * 34) > 0.78; return mix('#8f4dff', '#c49bff', (sy + 1) * 0.25).lerp(C('#ffe27a'), t > 0.86 ? 0.75 : 0).lerp(C('#f6e9ff'), line ? 0.3 : 0); },
        tail: { style: 'fork', h: 0.3, len: 0.3, c: ['#9b5cff', '#ffe27a'] }, dorsal: { t0: 0.1, t1: 0.82, h: 0.5, c: ['#9b5cff', '#ffe27a'], lean: 1.1 }, anal: { t0: 0.1, t1: 0.66, h: 0.42, c: ['#9b5cff', '#ffe27a'] },
    },
    dart: {
        shape: { pw: 1.35, q: 0.7, H: 0.17, W: 0.1, ped: 0.14 }, size: 2.7, freq: 7, amp: 0.1, pect: { size: 0.14, c: ['#9fd8ff', '#ffffff'] }, eye: { t: 0.86, r: 0.045 },
        color: (t, sy) => { const stripe = Math.max(0, 1 - Math.abs(sy - 0.05) / 0.28); return mix('#cfdbe8', '#f4f8fc', (1 - sy) * 0.2).lerp(C('#46b9ff'), smooth(0.1, 1, stripe) * 0.85); },
        tail: { style: 'fork', h: 0.2, len: 0.28, c: ['#9fd8ff', '#ffffff'] }, dorsal: { t0: 0.32, t1: 0.52, h: 0.12, c: ['#9fd8ff', '#ffffff'], lean: 0.5 }, anal: { t0: 0.3, t1: 0.46, h: 0.1, c: ['#9fd8ff', '#ffffff'] },
    },
};
const bendShader = (mat: T.MeshStandardMaterial, uni: { t: { value: number }; amp: { value: number }; freq: { value: number }; mode: { value: number } }, key: string) => {
    mat.onBeforeCompile = shader => {
        shader.uniforms.uT = uni.t; shader.uniforms.uAmp = uni.amp; shader.uniforms.uFreq = uni.freq; shader.uniforms.uMode = uni.mode;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT; uniform float uAmp; uniform float uFreq; uniform float uMode;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
            float tw = clamp(0.55 - position.z, 0., 1.4);
            float ph = uT * uFreq - position.z * 3.4;
            if (uMode < 0.5) { transformed.x += sin(ph) * uAmp * tw * tw; }
            else if (uMode < 1.5) { transformed.y += sin(ph) * uAmp * tw * tw; }
            else { float ax = abs(position.x); transformed.y += sin(uT * uFreq - ax * 3.2) * uAmp * pow(ax, 1.25); }`);
    };
    mat.customProgramCacheKey = () => 'pv3-fish-bend' + key;
};
function wrap(parts: T.BufferGeometry[], accent: string, mode: number, amp: number, freq: number, size: number, tickExtra?: (t: number, e: number) => void, children?: T.Object3D[]): FishModel {
    const uni = { t: { value: 0 }, amp: { value: amp }, freq: { value: freq }, mode: { value: mode } };
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.06, side: T.DoubleSide, emissive: accent, emissiveIntensity: 0 });
    bendShader(mat, uni, 'm' + mode);
    const group = new T.Group();
    if (parts.length) group.add(new T.Mesh(merge(parts), mat));
    children?.forEach(c => group.add(c));
    group.scale.setScalar(size);
    const childMats: T.MeshStandardMaterial[] = [];
    return {
        group, size,
        tick(time, energy) { uni.t.value = time; uni.amp.value = amp * (0.55 + 0.7 * energy); uni.freq.value = freq * (0.8 + 0.5 * energy); tickExtra?.(time, energy); },
        glow(v) { mat.emissiveIntensity = v; childMats.forEach(m => { m.emissiveIntensity = v; }); },
        dispose() { group.traverse(o => { const m = o as T.Mesh; m.geometry?.dispose(); }); mat.dispose(); childMats.forEach(m => m.dispose()); },
    };
}
function standard(id: SpeciesId): FishModel {
    const s = SP[id]!;
    const sh = s.shape, parts: T.BufferGeometry[] = [loft(sh, s.color)];
    parts.push(tailFin(s.tail.style, sh.ped * sh.H, s.tail.h, s.tail.len, (u, v) => mix(s.tail.c[0], s.tail.c[1], u * 0.8 + v * 0.1)));
    if (s.dorsal) { const d = s.dorsal; parts.push(dorsal(sh, d.t0, d.t1, d.h, v => mix(d.c[0], d.c[1], v), false, d.lean)); }
    if (s.anal) { const a = s.anal; parts.push(dorsal(sh, a.t0, a.t1, a.h, v => mix(a.c[0], a.c[1], v), true, 0.25)); }
    for (const side of [-1, 1]) parts.push(pectoral(side, sh.W * prof(sh, 0.62) * 0.92, -sh.H * 0.12, 0.62 - 0.5, s.pect.size, C(s.pect.c[0]), C(s.pect.c[1])));
    parts.push(...eyes(s.eye.t - 0.5, sh.H * prof(sh, s.eye.t) * 0.28, sh.W * prof(sh, s.eye.t) * 0.9, s.eye.r));
    if (s.extras) parts.push(...s.extras(sh));
    return wrap(parts, SPECIES[id].color, 0, s.amp, s.freq, s.size);
}
function ray(): FishModel {
    const N = 34, pos: number[] = [], col: number[] = [], idx: number[] = [], pos2: number[] = [], col2: number[] = [];
    const W = 0.62, Lh = 0.72;
    const gold = C('#f0b445'), cream = C('#fff3c4'), brown = C('#c9822a');
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const v = i / N, u = j / N * 2 - 1, z = (v - 0.5) * Lh;
        const half = W * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.78)), 0.85) * (1 - 0.12 * v) + 0.02;
        const x = u * half, bump = 0.11 * Math.exp(-Math.pow(x / 0.2, 2)) * Math.sin(Math.PI * Math.pow(v, 0.8)), edge = Math.pow(Math.abs(u), 3) * 0.02;
        const spot = Math.sin(x * 22) * Math.sin(z * 26) > 0.82;
        const c = gold.clone().lerp(brown, Math.abs(u) * 0.55).lerp(cream, spot ? 0.85 : 0).lerp(cream, Math.max(0, v - 0.9) * 4);
        pos.push(x, bump - edge, z); col.push(c.r, c.g, c.b);
        pos2.push(x, bump * 0.4 - edge - 0.012, z); col2.push(cream.r, cream.g, cream.b);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const top = new T.BufferGeometry();
    top.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); top.setAttribute('color', new T.Float32BufferAttribute(col, 3)); top.setIndex(idx); top.computeVertexNormals();
    const bottom = new T.BufferGeometry();
    bottom.setAttribute('position', new T.Float32BufferAttribute(pos2, 3)); bottom.setAttribute('color', new T.Float32BufferAttribute(col2, 3)); bottom.setIndex(idx.slice().reverse()); bottom.computeVertexNormals();
    const tailPts = Array.from({ length: 8 }, (_, i) => new T.Vector3(Math.sin(i * 0.5) * 0.04, 0.01, -0.36 - i * 0.12));
    const parts: T.BufferGeometry[] = [top, bottom, ...eyes(0.17, 0.09, 0.1, 0.05).map(g => g)];
    const curve = new T.CatmullRomCurve3(tailPts);
    const tg = new T.TubeGeometry(curve, 10, 0.022, 5, false);
    paint(tg, '#d99a38');
    parts.push(tg);
    parts.push(paint(place(new T.ConeGeometry(0.03, 0.12, 5), [0, 0.02, -1.3], [-Math.PI / 2, 0, 0]), '#a96a20'));
    return wrap(parts, SPECIES.ray.color, 2, 0.1, 3.2, 3.1);
}
function seahorse(): FishModel {
    const curve = new T.CatmullRomCurve3([[0, 0.55, 0.12], [0, 0.5, 0.08], [0, 0.36, 0.02], [0, 0.18, -0.02], [0, 0.0, 0.0], [0, -0.16, 0.0], [0, -0.3, -0.06], [0, -0.38, -0.16], [0, -0.34, -0.26], [0, -0.26, -0.28], [0, -0.22, -0.2]].map(p => new T.Vector3(p[0], p[1], p[2])));
    const rings = 40, radial = 10, pos: number[] = [], col: number[] = [], idx: number[] = [];
    const radius = (t: number) => 1.4 * (t < 0.08 ? 0.07 : t < 0.2 ? 0.065 + (t - 0.08) * 0.35 : t < 0.55 ? 0.11 + 0.05 * Math.sin((t - 0.2) / 0.35 * Math.PI) : 0.11 * (1 - (t - 0.55) / 0.45) + 0.012);
    for (let i = 0; i <= rings; i++) {
        const t = i / rings, p = curve.getPoint(t), tan = curve.getTangent(t), nrm = new T.Vector3().crossVectors(tan, new T.Vector3(1, 0, 0)).normalize(), bi = new T.Vector3(1, 0, 0), r = radius(t);
        for (let k = 0; k < radial; k++) {
            const a = k / radial * Math.PI * 2, o = nrm.clone().multiplyScalar(Math.cos(a) * r * (a > Math.PI ? 0.9 : 1)).addScaledVector(bi, Math.sin(a) * r * 0.9);
            pos.push(p.x + o.x, p.y + o.y, p.z + o.z);
            const ring = Math.sin(t * 60) > 0.55, c = mix('#27d3c3', '#ffe27a', Math.cos(a) < -0.1 ? 0.8 : t * 0.35).lerp(C('#12907f'), ring ? 0.25 : 0);
            col.push(c.r, c.g, c.b);
        }
    }
    for (let i = 0; i < rings; i++) for (let k = 0; k < radial; k++) { const a = i * radial + k, b = i * radial + (k + 1) % radial, c = a + radial, d = b + radial; idx.push(a, c, b, b, c, d); }
    const body = new T.BufferGeometry();
    body.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); body.setAttribute('color', new T.Float32BufferAttribute(col, 3)); body.setIndex(idx); body.computeVertexNormals();
    const parts: T.BufferGeometry[] = [body];
    parts.push(paint(place(new T.CylinderGeometry(0.04, 0.055, 0.26, 8), [0, 0.5, 0.3], [Math.PI / 2 - 0.15, 0, 0]), '#ffe27a'));
    for (let i = 0; i < 4; i++) parts.push(paint(place(new T.ConeGeometry(0.025, 0.1, 5), [0, 0.62 - i * 0.012, 0.04 - i * 0.045], [-0.5, 0, 0]), '#ffe27a'));
    for (let i = 0; i < 6; i++) parts.push(paint(place(new T.SphereGeometry(0.026, 6, 5), [0, 0.3 - i * 0.1, -0.09 - (i > 3 ? (i - 3) * 0.03 : 0)]), '#ffe27a'));
    parts.push(...eyes(0.12, 0.6, 0.1, 0.05).map(g => g));
    parts.push(fin([[-0.06, 0.18], [-0.2, 0.3], [-0.22, 0.12], [-0.2, -0.06], [-0.06, -0.02]], (z) => mix('#27d3c3', '#e9fffb', Math.abs(z) * 2)).translate(0, 0, 0));
    return wrap(parts, SPECIES.seahorse.color, 0, 0.05, 3.4, 1.9);
}
function dolphin(): FishModel {
    const shape: Shape = { pw: 1.05, q: 0.62, H: 0.23, W: 0.2, ped: 0.12 };
    const ctrl: [number, number][] = [[0, 0.1], [0.08, 0.26], [0.2, 0.58], [0.35, 0.88], [0.5, 1], [0.62, 0.97], [0.72, 0.9], [0.8, 0.82], [0.88, 0.64], [0.94, 0.42], [0.985, 0.24], [1, 0.06]];
    const prof2 = (t: number) => { for (let i = 1; i < ctrl.length; i++) if (t <= ctrl[i][0]) { const [t0, v0] = ctrl[i - 1], [t1, v1] = ctrl[i], u = (t - t0) / (t1 - t0); return v0 + (v1 - v0) * (u * u * (3 - 2 * u)); } return ctrl[ctrl.length - 1][1]; };
    const along = 38, around = 18, pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let i = 0; i <= along; i++) {
        const t = i / along, z = t - 0.5, f = prof2(t);
        const melon = t > 0.7 && t < 0.92 ? 1 + 0.18 * Math.sin((t - 0.7) / 0.22 * Math.PI) : 1;
        for (let k = 0; k < around; k++) {
            const a = k / around * Math.PI * 2, cx = Math.cos(a), sy = Math.sin(a);
            pos.push(cx * shape.W * f, sy * shape.H * f * melon - (t > 0.9 ? 0.012 : 0), z);
            const c = mix('#5f86b4', '#9db8d6', 0.2).lerp(C('#eef5fb'), smooth(0.12, -0.35, sy)).lerp(C('#46688f'), t < 0.2 ? 0.25 : 0);
            col.push(c.r, c.g, c.b);
        }
    }
    for (let i = 0; i < along; i++) for (let k = 0; k < around; k++) { const a = i * around + k, b = i * around + (k + 1) % around, c = a + around, d = b + around; idx.push(a, b, c, b, d, c); }
    const body = new T.BufferGeometry();
    body.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); body.setAttribute('color', new T.Float32BufferAttribute(col, 3)); body.setIndex(idx); body.computeVertexNormals();
    const parts: T.BufferGeometry[] = [body];
    parts.push(fin([[0.04, 0.17], [-0.06, 0.38], [-0.2, 0.2], [-0.14, 0.15]], (z, y) => mix('#5f86b4', '#46688f', y * 2)));
    const fluke = new T.Shape();
    fluke.moveTo(0, 0.03); fluke.quadraticCurveTo(0.28, 0.1, 0.36, -0.12); fluke.quadraticCurveTo(0.14, -0.05, 0, -0.1); fluke.quadraticCurveTo(-0.14, -0.05, -0.36, -0.12); fluke.quadraticCurveTo(-0.28, 0.1, 0, 0.03);
    const fg = new T.ShapeGeometry(fluke, 6); fg.rotateX(Math.PI / 2); fg.translate(0, 0, -0.5 - 0.0); paint(fg, '#46688f');
    parts.push(fg);
    for (const side of [-1, 1]) parts.push(pectoral(side, 0.13, -0.08, 0.1, 0.24, C('#5f86b4'), C('#8fb0d2'), 0.8));
    parts.push(...eyes(0.3, 0.05, 0.165, 0.04, 0.0));
    parts.push(paint(place(new T.TorusGeometry(0.075, 0.009, 5, 10, Math.PI * 0.8), [0, -0.05, 0.47], [0.2, 0, Math.PI * 1.1]), '#34506f'));
    return wrap(parts, SPECIES.dolphin.color, 1, 0.16, 4.2, 4.0);
}
function turtle(): FishModel {
    const parts: T.BufferGeometry[] = [];
    const shell = new T.SphereGeometry(0.5, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const sp = shell.getAttribute('position');
    const hexCol = (x: number, y: number, z: number) => { const a = Math.atan2(z, x), r = Math.hypot(x, z); const cell = Math.sin(a * 6) * Math.cos(r * 18 + a * 3); const rim = r > 0.44; return rim ? C('#e8c96a') : mix('#6cae5b', '#3f8044', cell > 0.2 ? 0.45 : 0).lerp(C('#a6cf67'), (y / 0.5) * 0.45); };
    for (let i = 0; i < sp.count; i++) sp.setY(i, sp.getY(i) * 0.55);
    shell.computeVertexNormals();
    paint(shell, (x, y, z) => hexCol(x, y, z), 0.04, 3);
    parts.push(place(shell, [0, 0.05, 0], [0, 0, 0], [1, 1, 1.22]));
    parts.push(paint(place(new T.CylinderGeometry(0.5, 0.5, 0.06, 28), [0, 0.02, 0], [0, 0, 0], [1, 1, 1.22]), '#f0dba0'));
    parts.push(paint(place(new T.SphereGeometry(0.16, 14, 12), [0, 0.16, 0.66], [0, 0, 0], [1, 0.95, 1.15]), '#7fbf6a'));
    parts.push(paint(place(new T.CylinderGeometry(0.075, 0.11, 0.24, 8), [0, 0.1, 0.52], [Math.PI / 2 - 0.25, 0, 0]), '#79b865'));
    parts.push(...eyes(0.72, 0.21, 0.1, 0.045).map(g => g));
    parts.push(paint(place(new T.TorusGeometry(0.05, 0.007, 5, 10, Math.PI * 0.75), [0, 0.12, 0.8], [0.1, 0, Math.PI * 1.12]), '#3d6b3a'));
    parts.push(paint(place(new T.ConeGeometry(0.06, 0.2, 6), [0, 0.04, -0.7], [-Math.PI / 2, 0, 0]), '#79b865'));
    const flipper = (len: number, wid: number) => paint(place(new T.SphereGeometry(1, 12, 8), [len * 0.5, 0, 0], [0, 0, 0], [len * 0.5, 0.025, wid]), (x) => mix('#79b865', '#4f9a52', x / len));
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.05, side: T.DoubleSide, emissive: SPECIES.turtle.color, emissiveIntensity: 0 });
    const flips: { g: T.Group; side: number; front: boolean }[] = [];
    const extra: T.Object3D[] = [];
    for (const [side, front] of [[1, true], [-1, true], [1, false], [-1, false]] as const) {
        const g = new T.Group();
        const geo = flipper(front ? 0.42 : 0.26, front ? 0.12 : 0.09);
        if (side < 0) geo.scale(-1, 1, 1);
        g.add(new T.Mesh(geo, mat));
        g.position.set(side * 0.42, 0.03, front ? 0.34 : -0.38);
        g.rotation.y = side * (front ? -0.5 : 0.35) * -1;
        extra.push(g);
        flips.push({ g, side, front });
    }
    const model = wrap(parts, SPECIES.turtle.color, 3, 0, 1, 2.6, (t, e) => { for (const f of flips) { const ph = t * (2.6 + e * 1.4) + (f.front ? 0 : Math.PI * 0.7) + (f.side > 0 ? 0 : Math.PI * 0.15); f.g.rotation.z = Math.sin(ph) * (f.front ? 0.45 : 0.25) * f.side; } }, extra);
    const base = model.glow;
    model.glow = v => { base(v); mat.emissiveIntensity = v; };
    const dispose = model.dispose;
    model.dispose = () => { dispose(); mat.dispose(); };
    return model;
}
export function buildFish(id: SpeciesId): FishModel {
    switch (id) {
        case 'ray': return ray();
        case 'seahorse': return seahorse();
        case 'dolphin': return dolphin();
        case 'turtle': return turtle();
        default: return standard(id);
    }
}
export { rng };
