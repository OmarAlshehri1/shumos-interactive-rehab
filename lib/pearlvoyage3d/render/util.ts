import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function rng(seed: number) {
    let v = (seed * 2654435761) >>> 0;
    return () => { v = (Math.imul(v, 1664525) + 1013904223) >>> 0; return v / 4294967296; };
}
const hash = (x: number, y: number, seed = 0) => { const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return h - Math.floor(h); };
/** smooth value noise in [0,1] */
export function noise2(x: number, y: number, seed = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, y: number, seed = 0) => noise2(x, y, seed) * 0.55 + noise2(x * 2.1, y * 2.1, seed + 3) * 0.3 + noise2(x * 4.3, y * 4.3, seed + 7) * 0.15;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** the one wave definition: the water shader mirrors it so the boat rides the visible surface */
export function waveHeight(x: number, z: number, t: number, amp: number) {
    return amp * (0.55 * Math.sin(0.11 * x + 0.07 * z + t * 0.9) + 0.3 * Math.sin(-0.09 * x + 0.15 * z + t * 1.15 + 1.3) + 0.15 * Math.sin(0.31 * x - 0.21 * z + t * 1.7 + 2.1));
}
export function waveSlope(x: number, z: number, t: number, amp: number) {
    const a = 0.11 * x + 0.07 * z + t * 0.9, b = -0.09 * x + 0.15 * z + t * 1.15 + 1.3, c = 0.31 * x - 0.21 * z + t * 1.7 + 2.1;
    return {
        dx: amp * (0.55 * 0.11 * Math.cos(a) - 0.3 * 0.09 * Math.cos(b) + 0.15 * 0.31 * Math.cos(c)),
        dz: amp * (0.55 * 0.07 * Math.cos(a) + 0.3 * 0.15 * Math.cos(b) - 0.15 * 0.21 * Math.cos(c)),
    };
}
/** world metres (x east, y north) to three.js space */
export const toThree = (x: number, y: number, h = 0) => new T.Vector3(x, h, -y);

/** adds a per-vertex colour to a geometry; `fn` may vary the colour by position */
export function paint(g: T.BufferGeometry, color: T.ColorRepresentation | ((x: number, y: number, z: number, i: number) => T.Color), jitter = 0, seed = 1): T.BufferGeometry {
    const pos = g.getAttribute('position');
    const arr = new Float32Array(pos.count * 3);
    const fn = typeof color === 'function' ? color : null;
    const base = fn ? null : new T.Color(color as T.ColorRepresentation);
    const r = rng(seed);
    const tmp = new T.Color();
    for (let i = 0; i < pos.count; i++) {
        const c = base ? tmp.copy(base) : fn!(pos.getX(i), pos.getY(i), pos.getZ(i), i);
        const j = jitter ? 1 + (r() - 0.5) * jitter : 1;
        arr[i * 3] = c.r * j; arr[i * 3 + 1] = c.g * j; arr[i * 3 + 2] = c.b * j;
    }
    g.setAttribute('color', new T.BufferAttribute(arr, 3));
    return g;
}
export function place(g: T.BufferGeometry, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1): T.BufferGeometry {
    const m = new T.Matrix4().compose(new T.Vector3(...pos), new T.Quaternion().setFromEuler(new T.Euler(...rot)), typeof scale === 'number' ? new T.Vector3(scale, scale, scale) : new T.Vector3(...scale));
    g.applyMatrix4(m);
    return g;
}
/** merges coloured parts (all must share attributes); disposes the inputs */
export function merge(parts: T.BufferGeometry[]): T.BufferGeometry {
    const norm = parts.map(p => { const g = p.index ? p.toNonIndexed() : p; if (g !== p) p.dispose(); if (!g.getAttribute('color')) paint(g, '#ffffff'); if (g.getAttribute('uv')) g.deleteAttribute('uv'); return g; });
    const out = mergeGeometries(norm, false)!;
    norm.forEach(g => g.dispose());
    return out;
}
export const vertexMaterial = (opts: { roughness?: number; metalness?: number; side?: T.Side; flat?: boolean; emissive?: T.ColorRepresentation; emissiveIntensity?: number } = {}) => new T.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.82, metalness: opts.metalness ?? 0, side: opts.side ?? T.FrontSide, flatShading: opts.flat ?? false, emissive: opts.emissive ?? '#000000', emissiveIntensity: opts.emissiveIntensity ?? 0 });
export function disposeObject(root: T.Object3D) {
    const geos = new Set<T.BufferGeometry>(), mats = new Set<T.Material>(), tex = new Set<T.Texture>();
    root.traverse(o => {
        const m = o as T.Mesh;
        if (m.geometry) geos.add(m.geometry);
        const mm = m.material as T.Material | T.Material[] | undefined;
        for (const x of Array.isArray(mm) ? mm : mm ? [mm] : []) { mats.add(x); for (const v of Object.values(x)) if (v instanceof T.Texture) tex.add(v); }
    });
    geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); tex.forEach(t => t.dispose());
}
/** soft radial sprite texture (glow) */
export function glowTexture(inner = '#ffffff', size = 128): T.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, inner); grad.addColorStop(0.35, inner + '66'); grad.addColorStop(1, inner + '00');
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
}
