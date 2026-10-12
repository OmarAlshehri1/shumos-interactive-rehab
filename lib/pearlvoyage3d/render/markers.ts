import * as T from 'three';
import type { MarkerDef } from '../stages';
import { disposeObject, glowTexture, rng } from './util';

const beamMaterial = (color: string, strength: number) => new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, fog: false,
    uniforms: { uColor: { value: new T.Color(color) }, uStrength: { value: strength }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; uniform float uTime; varying vec2 vUv;
    void main(){ float h = 1. - vUv.y; float a = pow(1.-h, 1.7) * (0.75 + 0.25*sin(uTime*1.6 + h*9.)) * uStrength; gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
});
const discMaterial = (color: string) => new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, uniforms: { uColor: { value: new T.Color(color) }, uStrength: { value: 1 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; uniform float uTime; varying vec2 vUv;
    void main(){ float d = length(vUv - 0.5) * 2.; float edge = smoothstep(0.55, 1., d) * (1. - smoothstep(0.98, 1., d)); float core = (1. - smoothstep(0., 0.9, d)) * 0.12;
    float pulse = 0.75 + 0.25 * sin(uTime * 2. - d * 5.); gl_FragColor = vec4(uColor, (edge * 0.5 + core) * pulse * uStrength);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
});
const ringProgress = () => new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, fog: false, uniforms: { uProgress: { value: 0 }, uPulse: { value: 0 }, uA: { value: new T.Color('#ffd166') }, uB: { value: new T.Color('#5ff0d0') } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float uProgress; uniform float uPulse; uniform vec3 uA; uniform vec3 uB; varying vec2 vP;
    void main(){ float ang = atan(vP.x, vP.y); float t = (ang < 0. ? ang + 6.2831853 : ang) / 6.2831853;
    float filled = step(t, uProgress); vec3 c = mix(uA, uB, t); vec3 base = vec3(1.) * 0.9; float a = mix(0.32, 0.98, filled);
    c = mix(base, c, filled); c += uPulse * 0.25 * filled; gl_FragColor = vec4(c, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
});
export interface MarkerViews {
    group: T.Group;
    update(time: number, active: number, resolved: boolean[], reduced: boolean, contrast: boolean, wave: (x: number, z: number) => number, encounter?: boolean): void;
    holdRing: T.Mesh;
    setHold(progress: number, pulse: number, show: boolean, at: T.Vector3 | null): void;
    dispose(): void;
}
/** golden discovery rings with a light beam, ripples and calm sparkles; the active marker is large, later ones a quiet preview */
export function buildMarkers(markers: MarkerDef[], radius: number): MarkerViews {
    const group = new T.Group();
    const r = rng(404);
    const items = markers.map((m, i) => {
        const root = new T.Group();
        root.position.set(m.x, 0.1, -m.y);
        const coreMat = new T.MeshBasicMaterial({ color: '#ffb81f', transparent: true, opacity: 0.98, fog: false, toneMapped: false });
        const core = new T.Mesh(new T.TorusGeometry(radius, 0.22, 12, 96), coreMat);
        core.rotation.x = Math.PI / 2;
        const glowMat = new T.MeshBasicMaterial({ color: '#ffb627', transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false, fog: false });
        const glow = new T.Mesh(new T.TorusGeometry(radius, 1.0, 12, 96), glowMat);
        glow.rotation.x = Math.PI / 2;
        const discMat = discMaterial('#ffd166');
        const disc = new T.Mesh(new T.CircleGeometry(radius, 64), discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.05;
        const beamGeo = new T.CylinderGeometry(radius * 0.07, radius * 0.2, 46, 24, 1, true);
        const beamMat = beamMaterial('#ffb627', 0.34);
        const beam = new T.Mesh(beamGeo, beamMat);
        beam.position.y = 23;
        const wideMat = beamMaterial('#ffd27a', 0.1);
        const wide = new T.Mesh(new T.CylinderGeometry(radius * 0.2, radius * 0.62, 40, 24, 1, true), wideMat);
        wide.position.y = 20;
        const ripples = [0, 1, 2].map(() => { const m2 = new T.MeshBasicMaterial({ color: '#fff3c8', transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, fog: false }); const mesh = new T.Mesh(new T.RingGeometry(0.94, 1, 72), m2); mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.06; return mesh; });
        const sparks = new T.Points(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(new Float32Array(42 * 3), 3)), new T.PointsMaterial({ color: '#ffe9a8', map: glowTexture('#ffffff', 64), size: 0.9, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false }));
        sparks.frustumCulled = false;
        const seeds = Array.from({ length: 42 }, () => ({ a: r() * 6.28, s: 0.12 + r() * 0.2, h: r(), rr: 0.55 + r() * 0.5 }));
        const pearl = new T.Mesh(new T.SphereGeometry(0.55, 20, 14), new T.MeshStandardMaterial({ color: '#fff7e6', emissive: '#ffd98a', emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.2 }));
        root.add(disc, glow, core, beam, wide, sparks, pearl, ...ripples);
        group.add(root);
        return { sc: i === 0 ? 1 : 0.5, root, core, glow, disc, beam, wide, ripples, sparks, seeds, pearl, mats: { coreMat, glowMat, discMat, beamMat, wideMat }, index: i };
    });
    const holdMat = ringProgress();
    const holdRing = new T.Mesh(new T.RingGeometry(2.3, 2.9, 96, 1), holdMat);
    holdRing.rotation.x = -Math.PI / 2;
    holdRing.visible = false;
    holdRing.renderOrder = 7;
    group.add(holdRing);
    return {
        group, holdRing,
        update(time, active, resolved, reduced, contrast, wave, encounter = false) {
            for (const it of items) {
                const isActive = it.index === active, gone = resolved[it.index] && !isActive;
                it.root.visible = !gone;
                if (gone) continue;
                const target = isActive ? (encounter ? 0.46 : 1) : 0.5;
                it.sc += (target - it.sc) * 0.06;
                const s = it.sc;
                const bob = reduced ? 0 : Math.sin(time * 1.1 + it.index) * 0.05;
                it.root.position.y = 0.12 + wave(it.root.position.x, it.root.position.z) + bob;
                it.root.scale.set(s, 1, s);
                const hc = contrast ? 1.6 : 1;
                it.mats.coreMat.opacity = isActive ? (encounter ? 0.7 : 1) : 0.55;
                it.core.scale.setScalar(1);
                it.core.scale.z = hc;
                it.mats.glowMat.opacity = (isActive ? 0.3 : 0.12) * hc;
                it.mats.discMat.uniforms.uTime.value = time; it.mats.discMat.uniforms.uStrength.value = isActive ? 1 : 0.4;
                it.mats.beamMat.uniforms.uTime.value = time; it.mats.beamMat.uniforms.uStrength.value = isActive ? (encounter ? 0.14 : 0.34) * hc : 0;
                it.mats.wideMat.uniforms.uStrength.value = isActive ? 0.1 : 0;
                it.pearl.visible = isActive && !encounter;
                it.pearl.position.y = 1.4 + (reduced ? 0 : Math.sin(time * 1.4) * 0.2);
                it.ripples.forEach((rp, k) => {
                    const ph = ((time * 0.35 + k / 3) % 1);
                    const mat = rp.material as T.MeshBasicMaterial;
                    rp.scale.setScalar(radius * (0.25 + ph * 0.85));
                    mat.opacity = (1 - ph) * (isActive ? 0.55 : 0.25) * (reduced ? 0.6 : 1);
                });
                const pos = it.sparks.geometry.getAttribute('position') as T.BufferAttribute;
                it.seeds.forEach((sd, k) => {
                    const a = sd.a + time * sd.s * (reduced ? 0.3 : 1), rr = radius * sd.rr * 0.95, h = ((sd.h + time * 0.08 * (reduced ? 0.4 : 1)) % 1);
                    pos.setXYZ(k, Math.cos(a) * rr, 0.3 + h * 7, Math.sin(a) * rr);
                });
                pos.needsUpdate = true;
                it.sparks.visible = isActive;
            }
        },
        setHold(progress, pulse, show, at) {
            holdRing.visible = show && !!at;
            if (at) holdRing.position.set(at.x, at.y + 0.18, at.z);
            holdMat.uniforms.uProgress.value = progress;
            holdMat.uniforms.uPulse.value = pulse;
        },
        dispose() { disposeObject(group); },
    };
}
/** a golden chevron floating above the boat that points at the active marker */
export function buildArrow(): T.Group {
    const g = new T.Group();
    const shape = new T.Shape();
    shape.moveTo(0, 1.5); shape.lineTo(1.1, -0.2); shape.lineTo(0.42, -0.2); shape.lineTo(0.42, -1.1); shape.lineTo(-0.42, -1.1); shape.lineTo(-0.42, -0.2); shape.lineTo(-1.1, -0.2); shape.lineTo(0, 1.5);
    const geo = new T.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
    geo.rotateX(-Math.PI / 2);
    geo.center();
    const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color: '#ffc83d', emissive: '#ff9f1c', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3, transparent: true, opacity: 0.95 }));
    g.add(mesh);
    g.scale.setScalar(0.9);
    return g;
}
