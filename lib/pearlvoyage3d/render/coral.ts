import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Island, Reef } from '../stages';
import type { EnvStyle } from './environments';
import { SEABED_Y } from './environments';
import { fbm, paint, place, rng } from './util';

const PALETTE = ['#ff5d9e', '#ff8a3d', '#9b5cff', '#ffd23f', '#27d3c3', '#ff6f61', '#e0549a', '#5fc8ff'];
const withSway = (g: T.BufferGeometry, w: number | ((x: number, y: number, z: number) => number)) => {
    const pos = g.getAttribute('position');
    const a = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) a[i] = typeof w === 'number' ? w : w(pos.getX(i), pos.getY(i), pos.getZ(i));
    g.setAttribute('aSway', new T.BufferAttribute(a, 1));
    return g;
};
const flat = (g: T.BufferGeometry) => { const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); if (n.getAttribute('uv')) n.deleteAttribute('uv'); return n; };

/** vertex-coloured material whose `aSway` vertices wave gently in the current: kelp, fans and anemones move, rock stays still */
export function swayMaterial() {
    const uniform = { value: 0 };
    const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: T.DoubleSide });
    m.onBeforeCompile = shader => {
        shader.uniforms.uTime = uniform;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSway; uniform float uTime;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.x += sin(uTime*1.25 + position.y*1.6 + position.z*1.1) * 0.14 * aSway; transformed.z += cos(uTime*1.05 + position.y*1.3 + position.x*0.9) * 0.1 * aSway;');
    };
    m.customProgramCacheKey = () => 'pv3-sway';
    return { material: m, uniform };
}
function branching(r: () => number, base: T.Color, tip: T.Color, height: number): T.BufferGeometry[] {
    const parts: T.BufferGeometry[] = [];
    const up = new T.Vector3(0, 1, 0);
    const grow = (origin: T.Vector3, dir: T.Vector3, len: number, rad: number, depth: number) => {
        const g = flat(new T.CylinderGeometry(rad * 0.62, rad, len, 5, 1));
        const q = new T.Quaternion().setFromUnitVectors(up, dir);
        const mid = origin.clone().addScaledVector(dir, len / 2);
        place(g, [mid.x, mid.y, mid.z], new T.Euler().setFromQuaternion(q).toArray().slice(0, 3) as [number, number, number]);
        const t = 1 - depth / 3;
        paint(g, base.clone().lerp(tip, t), 0.1, Math.floor(r() * 1e5));
        withSway(g, 0.08 * t);
        parts.push(g);
        if (depth <= 0) return;
        const end = origin.clone().addScaledVector(dir, len);
        const n = depth === 3 ? 3 : 2;
        for (let i = 0; i < n; i++) {
            const d = dir.clone().add(new T.Vector3((r() - 0.5) * 1.1, 0.5 + r() * 0.3, (r() - 0.5) * 1.1)).normalize();
            grow(end, d, len * 0.72, rad * 0.66, depth - 1);
        }
    };
    grow(new T.Vector3(0, 0, 0), new T.Vector3((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3).normalize(), height * 0.34, 0.14, 3);
    return parts;
}
function boulder(r: () => number, base: T.Color, accent: T.Color, size: number): T.BufferGeometry {
    const g = new T.IcosahedronGeometry(1, 3);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ridge = 1 + 0.06 * Math.sin(x * 9 + z * 7) * Math.cos(y * 8 + x * 5);
        pos.setXYZ(i, x * ridge, Math.max(y, -0.15) * 0.75 * ridge, z * ridge);
    }
    g.computeVertexNormals();
    paint(g, (x, y, z) => base.clone().lerp(accent, 0.5 + 0.5 * Math.sin(x * 9 + z * 7) * Math.cos(y * 8 + x * 5)), 0.05, Math.floor(r() * 1e5));
    withSway(g, 0);
    return place(g, [0, size * 0.3, 0], [0, r() * 6, 0], size);
}
function tableCoral(r: () => number, color: T.Color, size: number): T.BufferGeometry {
    const top = flat(new T.CylinderGeometry(size, size * 0.75, 0.16, 14));
    const stalk = flat(new T.CylinderGeometry(0.16, 0.24, size * 0.9, 6));
    paint(top, color.clone().lerp(new T.Color('#ffffff'), 0.15), 0.08, Math.floor(r() * 1e5));
    paint(stalk, color.clone().multiplyScalar(0.55), 0.05, 4);
    withSway(top, 0); withSway(stalk, 0);
    place(top, [0, size * 0.9, 0], [(r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25]);
    place(stalk, [0, size * 0.45, 0]);
    return mergeGeometries([top, stalk], false)!;
}
function fan(r: () => number, color: T.Color, size: number): T.BufferGeometry {
    const g = flat(new T.CircleGeometry(1, 28, 0, Math.PI));
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 11) * 0.06);
    paint(g, (x, y) => color.clone().lerp(new T.Color('#ffd0e8'), Math.max(0, y) * 0.5 + (Math.sin(x * 22) > 0.3 ? 0.18 : 0)), 0.05, Math.floor(r() * 1e5));
    withSway(g, (_x, y) => Math.max(0, y) * 0.6);
    return place(g, [0, 0.1, 0], [0, r() * 6, 0], [size, size * 1.1, size]);
}
function anemone(r: () => number, color: T.Color): T.BufferGeometry {
    const parts: T.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
        const a = r() * 6.28, d = r() * 0.28, g = flat(new T.ConeGeometry(0.045, 0.7 + r() * 0.35, 5, 1));
        paint(g, (x, y) => color.clone().lerp(new T.Color('#fff4f8'), Math.max(0, y + 0.4) * 0.6), 0.05, i + 1);
        withSway(g, (_x, y) => Math.max(0, y + 0.4) * 1.4);
        parts.push(place(g, [Math.cos(a) * d, 0.4, Math.sin(a) * d], [(r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5]));
    }
    const base = flat(new T.CylinderGeometry(0.28, 0.34, 0.2, 8));
    paint(base, color.clone().multiplyScalar(0.7)); withSway(base, 0);
    parts.push(place(base, [0, 0.1, 0]));
    return mergeGeometries(parts, false)!;
}
function kelp(r: () => number, height: number): T.BufferGeometry {
    const parts: T.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
        const g = flat(new T.PlaneGeometry(0.16, height * (0.7 + r() * 0.5), 1, 5));
        const lean = (r() - 0.5) * 0.4, a = r() * 6.28;
        paint(g, (x, y) => new T.Color('#2f9d4e').lerp(new T.Color('#a8e05a'), Math.max(0, (y / height) + 0.5)), 0.1, i + 3);
        withSway(g, (_x, y) => Math.max(0, y / height + 0.5) * 1.6);
        parts.push(place(g, [Math.cos(a) * 0.25, height * 0.4, Math.sin(a) * 0.25], [lean, r() * 6, lean]));
    }
    return mergeGeometries(parts, false)!;
}
export function buildSeaGardens(env: EnvStyle, reefs: Reef[], islands: Island[], quality: 'high' | 'medium' | 'low') {
    const group = new T.Group();
    const { material, uniform } = swayMaterial();
    const parts: T.BufferGeometry[] = [];
    const density = (quality === 'high' ? 1 : quality === 'medium' ? 0.65 : 0.4) * env.coralBoost;
    reefs.forEach(reef => {
        const r = (() => { const f = rng(reef.seed * 53 + 11); return f; })();
        const cx = reef.x, cz = -reef.y;
        const bed = flat(new T.CircleGeometry(reef.r * 1.15, 24).rotateX(-Math.PI / 2));
        const bedPos = bed.getAttribute('position');
        for (let i = 0; i < bedPos.count; i++) bedPos.setY(i, fbm(bedPos.getX(i) * 0.3 + reef.seed, bedPos.getZ(i) * 0.3, 2) * 0.35);
        paint(bed, (x, y, z) => new T.Color(env.sand[1]).lerp(new T.Color(env.rock[0]), fbm(x * 0.4, z * 0.4, 5) * 0.7), 0.05, reef.seed);
        withSway(bed, 0);
        parts.push(place(bed, [cx, SEABED_Y + 0.06, cz]));
        const n = Math.round(reef.r * reef.r * 0.4 * density);
        for (let i = 0; i < n; i++) {
            const a = r() * 6.28, d = Math.sqrt(r()) * reef.r * 0.95;
            const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = SEABED_Y + 0.15 + fbm(x * 0.3 + reef.seed, z * 0.3, 2) * 0.3;
            const base = new T.Color(PALETTE[Math.floor(r() * PALETTE.length)]), tip = base.clone().lerp(new T.Color('#fff2e0'), 0.35);
            const kind = r();
            const pieces: T.BufferGeometry[] = kind < 0.32 ? branching(r, base, tip, (1.9 + r() * 1.1) * Math.min(1.5, 0.6 + env.coralBoost * 0.5)) : kind < 0.52 ? [boulder(r, base, new T.Color(PALETTE[Math.floor(r() * PALETTE.length)]), 0.55 + r() * 0.85)] : kind < 0.66 ? [tableCoral(r, base, 0.8 + r() * 0.9)] : kind < 0.8 ? [fan(r, base, 0.7 + r() * 0.7)] : kind < 0.9 ? [anemone(r, base)] : [kelp(r, 1.3 + r() * 1.1)];
            for (const g of pieces) parts.push(place(g, [x, y, z]));
        }
    });
    islands.forEach(isl => {
        const r = rng(isl.seed * 7 + 5);
        for (let i = 0; i < Math.round(4 * density); i++) {
            const a = r() * 6.28, d = isl.r * (1.12 + r() * 0.4);
            parts.push(place(kelp(r, 1.2 + r() * 1.2), [isl.x + Math.cos(a) * d, SEABED_Y + 0.2, -isl.y + Math.sin(a) * d]));
        }
    });
    if (parts.length) {
        const mesh = new T.Mesh(mergeGeometries(parts.map(p => { if (!p.getAttribute('aSway')) withSway(p, 0); if (!p.getAttribute('color')) paint(p, '#ffffff'); const n = p.index ? p.toNonIndexed() : p; if (n.getAttribute('uv')) n.deleteAttribute('uv'); return n; }), false)!, material);
        mesh.frustumCulled = false;
        group.add(mesh);
        parts.forEach(p => p.dispose());
    }
    return { group, uniform };
}
/** schools of small silver-blue fish drifting over the reefs, one instanced draw call, visible through the shallows */
export function buildSchools(env: EnvStyle, reefs: Reef[], quality: 'high' | 'medium' | 'low') {
    const per = quality === 'high' ? 16 : quality === 'medium' ? 10 : 5;
    const body = flat(new T.SphereGeometry(0.5, 8, 6));
    const bp = body.getAttribute('position');
    for (let i = 0; i < bp.count; i++) bp.setXYZ(i, bp.getX(i) * 0.34, bp.getY(i) * 0.5, bp.getZ(i) * 1.1);
    const tail = flat(new T.ConeGeometry(0.25, 0.4, 3));
    place(tail, [0, 0, -0.62], [-Math.PI / 2, 0, 0]);
    const geo = mergeGeometries([paint(body, '#ffffff'), paint(tail, '#dfeeff')], false)!;
    const mat = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.2, emissive: '#223344', emissiveIntensity: 0.25 });
    const total = Math.max(1, reefs.length * per);
    const mesh = new T.InstancedMesh(geo, mat, total);
    const items: { cx: number; cz: number; rad: number; ang: number; speed: number; depth: number; phase: number }[] = [];
    const palette = ['#d8ecff', '#9fd8ff', '#ffe9a3', '#ffb0a0'].map(c => new T.Color(c));
    reefs.forEach((reef, ri) => {
        const r = rng(reef.seed * 3 + 1);
        const tint = palette[ri % palette.length];
        for (let i = 0; i < per; i++) {
            items.push({ cx: reef.x, cz: -reef.y, rad: reef.r * (0.35 + r() * 0.55), ang: r() * 6.28, speed: (0.12 + r() * 0.14) * (r() > 0.5 ? 1 : -1), depth: -0.9 - r() * 0.9, phase: r() * 6.28 });
            mesh.setColorAt(items.length - 1, tint.clone().lerp(new T.Color('#ffffff'), r() * 0.3));
        }
    });
    const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), s = new T.Vector3(1, 1, 1);
    const update = (t: number) => {
        items.forEach((f, i) => {
            const a = f.ang + t * f.speed, wob = Math.sin(t * 1.4 + f.phase) * 0.15;
            p.set(f.cx + Math.cos(a) * f.rad, f.depth + wob, f.cz + Math.sin(a) * f.rad);
            e.set(0, -a + (f.speed > 0 ? Math.PI : 0) + Math.PI / 2 * (f.speed > 0 ? -1 : 1) * 0, 0);
            const dir = f.speed > 0 ? 1 : -1;
            e.y = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir) * -1 + Math.PI / 2;
            q.setFromEuler(e);
            m.compose(p, q, s.setScalar(0.9 + Math.sin(f.phase) * 0.15));
            mesh.setMatrixAt(i, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
    };
    mesh.count = items.length;
    mesh.frustumCulled = false;
    return { mesh, update };
}
