import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tube } from './islands';
import { merge, paint, place, vertexMaterial } from './util';

/**
 * The Pearl: an original lofted motor-launch. Local axes: forward is -Z, stern +Z, starboard +X, up +Y, waterline y = 0.
 * Parts that must move (wheel, propeller, pennant) are returned separately; everything else is merged by material.
 */
const L = 5.4;
const zAt = (t: number) => L / 2 - t * L;
const beam = (t: number) => 1.02 * Math.pow(1 - Math.pow(t, 2.6), 0.8) + 0.015;
const topAt = (t: number) => 0.62 + 0.55 * Math.pow(t, 2.2);
const keelAt = (t: number) => -0.62 + 0.97 * Math.pow(t, 3.2);
const K = 10;
function section(t: number, inset = 0, lowerInset = 0): T.Vector3[] {
    const b = Math.max(0.01, beam(t) - inset), top = topAt(t) - (inset ? 0.0 : 0), yk = keelAt(t) + lowerInset, z = zAt(t);
    const pts: T.Vector3[] = [];
    for (let i = -K; i <= K; i++) {
        const phi = Math.abs(i) / K * Math.PI / 2;
        pts.push(new T.Vector3(Math.sign(i) * b * Math.pow(Math.sin(phi), 0.78), top - (top - yk) * Math.pow(Math.cos(phi), 1.2), z));
    }
    return pts;
}
function hullGeometry(color: (p: T.Vector3, t: number) => T.Color, flip = false, inset = 0): T.BufferGeometry {
    const N = 26, pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
        const t = i / N * 0.995;
        for (const p of section(t, inset, inset)) { pos.push(p.x, p.y, p.z); const c = color(p, t); col.push(c.r, c.g, c.b); }
    }
    const W = K * 2 + 1;
    for (let i = 0; i < N; i++) for (let j = 0; j < W - 1; j++) {
        const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
        if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}
const C = (h: string) => new T.Color(h);
function hullColor(p: T.Vector3, t: number): T.Color {
    const top = topAt(t);
    if (p.y < -0.2) return C('#a5392f').lerp(C('#6d2a2a'), Math.min(1, (-0.2 - p.y) * 1.4));
    if (p.y < 0.02) return C('#fbf8f0');
    if (p.y > top - 0.2 && p.y < top - 0.045) return C('#0f9fa0');
    return C('#f6efe0').lerp(C('#e6d9bf'), Math.min(1, Math.abs(p.x) * 0.15));
}
function plank(t0: number, t1: number, y: number, inset: number, shade: string): T.BufferGeometry {
    const a = beam(t0) - inset, b = beam(t1) - inset, c = C(shade);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([-a, y, zAt(t0), a, y, zAt(t0), b, y, zAt(t1), -b, y, zAt(t1)], 3));
    g.setAttribute('color', new T.Float32BufferAttribute(Array(4).fill([c.r, c.g, c.b]).flat(), 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    return g;
}
export interface Boat {
    group: T.Group;
    wheel: T.Group;
    prop: T.Mesh;
    flag: T.Mesh;
    foam: T.Mesh;
    foamMaterial: T.ShaderMaterial;
    lantern: T.Mesh;
}
export function buildBoat(): Boat {
    const group = new T.Group();
    const main: T.BufferGeometry[] = [];
    main.push(hullGeometry(hullColor));
    main.push(hullGeometry((p) => C('#e8dcc2').lerp(C('#d6c29c'), Math.min(1, Math.max(0, -p.y * 0.8))), true, 0.1));
    // transom, floor planks, foredeck
    const tr = section(0), tc = new T.Color('#f6efe0');
    const transom = new T.BufferGeometry();
    transom.setAttribute('position', new T.Float32BufferAttribute(tr.flatMap(p => [p.x, p.y, p.z]), 3));
    transom.setAttribute('color', new T.Float32BufferAttribute(tr.flatMap(() => [tc.r, tc.g, tc.b]), 3));
    const fan: number[] = [];
    for (let i = 1; i < tr.length - 1; i++) fan.push(0, i + 1, i);
    transom.setIndex(fan);
    transom.computeVertexNormals();
    main.push(transom);
    for (let i = 0; i < 11; i++) main.push(plank(0.03 + i * 0.065, 0.03 + (i + 1) * 0.065, 0.2, 0.12, i % 2 ? '#c4955d' : '#b4814a'));
    const fore = [0.74, 0.8, 0.86, 0.92, 0.98];
    for (let i = 0; i < fore.length - 1; i++) main.push(plank(fore[i], fore[i + 1], topAt(fore[i + 1]) - 0.06, 0.02, i % 2 ? '#d9c8a2' : '#e6d8b6'));
    // gunwale rails, bow rail, fenders
    for (const side of [-1, 1]) {
        const pts = Array.from({ length: 12 }, (_, i) => { const t = i / 11 * 0.97; return new T.Vector3(side * beam(t), topAt(t) + 0.035, zAt(t)); });
        main.push(tube(pts, () => 0.05, () => C('#a56f38'), 6));
        const rail = Array.from({ length: 6 }, (_, i) => { const t = 0.72 + i / 5 * 0.24; return new T.Vector3(side * beam(t) * 0.97, topAt(t) + 0.62, zAt(t)); });
        main.push(tube(rail, () => 0.028, () => C('#e4e8ec'), 6));
        for (let i = 0; i < 6; i++) { const t = 0.72 + i / 5 * 0.24; main.push(paint(place(new T.CylinderGeometry(0.022, 0.022, 0.62, 6), [side * beam(t) * 0.97, topAt(t) + 0.31, zAt(t)]), '#e4e8ec')); }
        for (const t of [0.22, 0.42, 0.62]) main.push(paint(place(new T.CapsuleGeometry(0.07, 0.34, 4, 8), [side * (beam(t) + 0.08), 0.18, zAt(t)], [Math.PI / 2, 0, 0]), '#f4f6f8'));
    }
    const bowRail = Array.from({ length: 2 }, (_, i) => new T.Vector3((i ? 1 : -1) * beam(0.96) * 0.97, topAt(0.96) + 0.62, zAt(0.96)));
    main.push(tube([bowRail[0], new T.Vector3(0, topAt(0.99) + 0.62, zAt(0.99)), bowRail[1]], () => 0.028, () => C('#e4e8ec'), 6));
    // seats with cushions
    for (const [t, tone] of [[0.3, '#17b0bd'], [0.52, '#17b0bd']] as const) {
        const w = beam(t) * 2 - 0.3;
        main.push(paint(place(new RoundedBoxGeometry(w, 0.16, 0.5, 3, 0.06), [0, 0.52, zAt(t)]), tone, 0.04), paint(place(new T.BoxGeometry(w - 0.05, 0.3, 0.46), [0, 0.37, zAt(t)]), '#e8dcc2'));
        main.push(paint(place(new RoundedBoxGeometry(w, 0.5, 0.12, 3, 0.05), [0, 0.88, zAt(t) + 0.28], [-0.12, 0, 0]), tone, 0.04));
    }
    // helm console + glass frame
    main.push(paint(place(new RoundedBoxGeometry(1.15, 0.56, 0.5, 3, 0.07), [0, 0.5, zAt(0.7)]), '#f2ead8'), paint(place(new T.BoxGeometry(1.0, 0.04, 0.38), [0, 0.8, zAt(0.7)]), '#3a4752'));
    main.push(paint(place(new T.BoxGeometry(0.34, 0.02, 0.18), [0, 0.835, zAt(0.7) - 0.05]), '#0b2a3a'));
    // canopy: four posts and a striped arched roof
    const chrome: T.BufferGeometry[] = [];
    for (const [x, z] of [[-0.92, zAt(0.55)], [0.92, zAt(0.55)], [-0.92, zAt(0.1)], [0.92, zAt(0.1)]] as const) chrome.push(paint(place(new T.CylinderGeometry(0.035, 0.035, 1.95, 8), [x, 1.18, z]), '#dfe5ea'));
    chrome.push(paint(place(new T.CylinderGeometry(0.03, 0.03, 1.84, 8), [0, 2.12, zAt(0.33)], [Math.PI / 2, 0, 0]), '#dfe5ea'));
    const roofParts: T.BufferGeometry[] = [];
    const zFront = zAt(0.6), zBack = zAt(0.05), seg = 12;
    for (let s = 0; s < seg; s++) {
        const z0 = zFront + (zBack - zFront) * s / seg, z1 = zFront + (zBack - zFront) * (s + 1) / seg;
        const pos: number[] = [], idx: number[] = [], col: number[] = [];
        const c = C(s % 2 ? '#fdfbf4' : '#12a7ad');
        for (let k = 0; k <= 10; k++) { const a = (k / 10 - 0.5) * Math.PI * 0.62, x = Math.sin(a) * 1.28, y = 2.1 + Math.cos(a) * 0.32 - 0.32 + 0.0; pos.push(x, y, z0, x, y, z1); col.push(c.r, c.g, c.b, c.r, c.g, c.b); if (k) { const b = (k - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        roofParts.push(g);
    }
    main.push(...roofParts);
    // outboard motor, bow ornament (a small gold pearl), lantern post
    main.push(paint(place(new RoundedBoxGeometry(0.5, 0.72, 0.42, 3, 0.08), [0, 0.46, L / 2 + 0.3]), '#26333d'), paint(place(new T.BoxGeometry(0.52, 0.1, 0.44), [0, 0.7, L / 2 + 0.3]), '#12a7ad'), paint(place(new T.CylinderGeometry(0.07, 0.07, 1.25, 8), [0, -0.3, L / 2 + 0.38]), '#26333d'), paint(place(new T.CylinderGeometry(0.15, 0.1, 0.34, 10), [0, -0.9, L / 2 + 0.38], [Math.PI / 2, 0, 0]), '#2c3a45'));
    main.push(paint(place(new T.SphereGeometry(0.1, 12, 10), [0, topAt(0.97) + 0.12, zAt(0.97)]), '#f2d27c'));
    main.push(paint(place(new T.CylinderGeometry(0.02, 0.02, 1.5, 6), [0.62, 1.4, zAt(0.0) - 0.15]), '#e4e8ec'));
    // life ring on the canopy post
    main.push(paint(place(new T.TorusGeometry(0.24, 0.07, 8, 20), [0.97, 1.4, zAt(0.1)], [0, Math.PI / 2, 0]), (x, y, z) => C(Math.sin(Math.atan2(y - 1.4, z - zAt(0.1)) * 4) > 0 ? '#e8423a' : '#fbf8f0')));
    const mainMesh = new T.Mesh(merge(main), vertexMaterial({ roughness: 0.5, metalness: 0.04, side: T.DoubleSide }));
    mainMesh.name = 'hull';
    group.add(mainMesh);
    const chromeMesh = new T.Mesh(merge(chrome), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.85 }));
    group.add(chromeMesh);
    // wheel (animated), propeller (animated), pennant (animated), glass, lantern
    const wheel = new T.Group();
    const wp: T.BufferGeometry[] = [paint(new T.TorusGeometry(0.22, 0.026, 8, 24), '#8a5a2b'), paint(place(new T.CylinderGeometry(0.05, 0.05, 0.06, 12), [0, 0, 0], [Math.PI / 2, 0, 0]), '#d9c28a')];
    for (let i = 0; i < 6; i++) wp.push(paint(place(new T.CylinderGeometry(0.012, 0.012, 0.44, 5), [0, 0, 0], [0, 0, i / 6 * Math.PI]), '#8a5a2b'));
    for (let i = 0; i < 6; i++) wp.push(paint(place(new T.SphereGeometry(0.03, 6, 5), [Math.cos(i / 6 * Math.PI * 2) * 0.27, Math.sin(i / 6 * Math.PI * 2) * 0.27, 0]), '#8a5a2b'));
    wheel.add(new T.Mesh(merge(wp), vertexMaterial({ roughness: 0.4, metalness: 0.1 })));
    wheel.position.set(0, 1.05, zAt(0.7) + 0.33);
    wheel.rotation.x = -0.55;
    const wheelPivot = new T.Group();
    wheelPivot.position.copy(wheel.position);
    wheel.position.set(0, 0, 0);
    wheelPivot.add(wheel);
    group.add(wheelPivot);
    const blades: T.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) blades.push(paint(place(new T.BoxGeometry(0.36, 0.02, 0.11), [0.18, 0, 0], [0.4, 0, 0]).applyMatrix4(new T.Matrix4().makeRotationZ(i / 3 * Math.PI * 2)), '#aab6bf'));
    const prop = new T.Mesh(merge(blades), vertexMaterial({ roughness: 0.3, metalness: 0.8, side: T.DoubleSide }));
    prop.position.set(0, -0.9, L / 2 + 0.6);
    group.add(prop);
    const flagGeo = new T.BufferGeometry();
    flagGeo.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 0.5, -0.12, 0, 0, -0.3, 0], 3));
    flagGeo.setIndex([0, 1, 2]);
    flagGeo.computeVertexNormals();
    const flag = new T.Mesh(flagGeo, new T.MeshStandardMaterial({ color: '#f2b53a', side: T.DoubleSide, roughness: 0.7 }));
    flag.position.set(0.62, 2.12, zAt(0.0) - 0.15);
    group.add(flag);
    const glassPts = new T.Mesh(new T.PlaneGeometry(1.7, 0.62), new T.MeshPhysicalMaterial({ color: '#bfeeff', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0, transmission: 0, side: T.DoubleSide, depthWrite: false }));
    glassPts.position.set(0, 1.2, zAt(0.7) - 0.28);
    glassPts.rotation.x = -0.32;
    group.add(glassPts);
    const lantern = new T.Mesh(new T.SphereGeometry(0.1, 10, 8), new T.MeshStandardMaterial({ color: '#fff2c0', emissive: '#ffd166', emissiveIntensity: 1.2 }));
    lantern.position.set(0, 2.0, zAt(0.33));
    group.add(lantern);
    // soft waterline foam ring following the hull outline
    const fpos: number[] = [], fuv: number[] = [], fidx: number[] = [];
    const outline: { x: number; z: number }[] = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24 * 0.985; outline.push({ x: beam(t), z: zAt(t) }); }
    const loop = [...outline.map(p => ({ x: p.x, z: p.z })), ...outline.slice().reverse().map(p => ({ x: -p.x, z: p.z }))];
    loop.forEach((p, i) => {
        const nxt = loop[(i + 1) % loop.length], prv = loop[(i + loop.length - 1) % loop.length];
        const tx = nxt.x - prv.x, tz = nxt.z - prv.z, tl = Math.hypot(tx, tz) || 1;
        // outward normal of the outline: starboard half runs stern -> bow (normal points +x), port half is its mirror
        const outward = i <= 24 ? 1 : -1;
        const nx = tz / tl * outward * -1, nz = tx / tl * outward;
        for (const [o, a] of [[-0.12, 1], [0.55, 0]] as const) { fpos.push(p.x + nx * o * -1, 0.04, p.z + nz * o * -1); fuv.push(i / loop.length, a); }
    });
    for (let i = 0; i < loop.length; i++) { const a = i * 2, b = ((i + 1) % loop.length) * 2; fidx.push(a, a + 1, b, a + 1, b + 1, b); }
    const fg = new T.BufferGeometry();
    fg.setAttribute('position', new T.Float32BufferAttribute(fpos, 3));
    fg.setAttribute('uv', new T.Float32BufferAttribute(fuv, 2));
    fg.setIndex(fidx);
    const foamMaterial = new T.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false, side: T.DoubleSide, uniforms: { uTime: { value: 0 }, uPower: { value: 0.6 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform float uTime; uniform float uPower; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){ float lace = h(floor(vec2(vUv.x*70. + uTime*0.8, vUv.y*5.)));
          float a = (1.-smoothstep(0.,1.,vUv.y)) * (0.35 + 0.65*smoothstep(0.2,0.9,lace)) * uPower;
          gl_FragColor = vec4(vec3(1.), clamp(a, 0., 0.8));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const foam = new T.Mesh(fg, foamMaterial);
    foam.renderOrder = 4;
    group.add(foam);
    return { group, wheel: wheelPivot, prop, flag, foam, foamMaterial, lantern };
}
