import * as T from 'three';
import { merge, paint, place, rng, vertexMaterial } from './util';

/** a few gulls circling high above the lagoon; wings flap by rotating two shared-geometry meshes */
export function buildGulls(count: number, seed: number) {
    const r = rng(seed + 77);
    const body = merge([paint(place(new T.SphereGeometry(0.5, 8, 6), [0, 0, 0], [0, 0, 0], [0.45, 0.4, 1.3]), '#f4f6f8'), paint(place(new T.ConeGeometry(0.22, 0.8, 4), [0, 0, 0.95], [Math.PI / 2, 0, 0]), '#f0f2f5'), paint(place(new T.ConeGeometry(0.06, 0.4, 4), [0, -0.05, -1.05], [-Math.PI / 2, 0, 0]), '#ffb347'), paint(place(new T.SphereGeometry(0.2, 8, 6), [0, 0.1, 0.85]), '#ffffff')]);
    const wing = (side: number) => {
        const shape = new T.Shape();
        shape.moveTo(0, 0.4); shape.quadraticCurveTo(1.4, 0.7, 2.6, 0.05 + 0.1); shape.lineTo(2.3, -0.1); shape.quadraticCurveTo(1.2, -0.3, 0, -0.4); shape.lineTo(0, 0.4);
        const g = new T.ShapeGeometry(shape, 6).rotateX(-Math.PI / 2);
        paint(g, (x) => new T.Color('#f6f8fa').lerp(new T.Color('#4a5560'), Math.max(0, (x - 1.8) / 0.8)), 0);
        if (side < 0) g.scale(-1, 1, 1);
        return g;
    };
    const mat = vertexMaterial({ roughness: 0.8, side: T.DoubleSide });
    const group = new T.Group();
    const left = wing(-1), right = wing(1), bodyGeo = body;
    const gulls = Array.from({ length: count }, (_, i) => {
        const g = new T.Group();
        const b = new T.Mesh(bodyGeo, mat);
        const wl = new T.Group(), wr = new T.Group();
        wl.add(new T.Mesh(left, mat)); wr.add(new T.Mesh(right, mat));
        wl.position.x = -0.15; wr.position.x = 0.15;
        g.add(b, wl, wr);
        g.scale.setScalar(1.3);
        group.add(g);
        return { g, wl, wr, rad: 60 + r() * 90, h: 28 + r() * 30, speed: (0.05 + r() * 0.05) * (i % 2 ? 1 : -1), phase: r() * 6.28, flap: 3 + r() * 1.5 };
    });
    const update = (t: number, center: T.Vector3) => {
        for (const o of gulls) {
            const a = o.phase + t * o.speed;
            o.g.position.set(center.x + Math.cos(a) * o.rad, o.h + Math.sin(t * 0.4 + o.phase) * 2.5, center.z + Math.sin(a) * o.rad);
            o.g.rotation.y = -a + (o.speed > 0 ? 0 : Math.PI) + Math.PI;
            const f = Math.sin(t * o.flap + o.phase) * 0.45 + 0.1;
            o.wl.rotation.z = -f; o.wr.rotation.z = f;
            o.g.rotation.z = 0.12 * (o.speed > 0 ? 1 : -1);
        }
    };
    const dispose = () => { bodyGeo.dispose(); left.dispose(); right.dispose(); mat.dispose(); };
    return { group, update, dispose };
}
