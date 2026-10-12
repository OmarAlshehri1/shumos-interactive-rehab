import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { State } from './engine';
import { STAGES, roadX, roadHeading, targetAim } from './stages';
export interface RenderStats {
    fps: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    frames: number;
}
const mat = (color: T.ColorRepresentation, roughness = 0.85, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });
function rng(seed: number) { let v = seed; return () => { v = (Math.imul(v, 1664525) + 1013904223) >>> 0; return v / 4294967296; }; }
function noise(x: number, z: number) { return Math.sin(x * 0.17 + Math.sin(z * 0.12)) * Math.cos(z * 0.11) + Math.sin(x * 0.037 + z * 0.058) * 2.5 + Math.sin(x * 0.48 - z * 0.31) * 0.17; }
function surfaceTexture(kind: 'rock' | 'ground' | 'road'): T.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const r = rng(kind === 'road' ? 81 : 25);
    const data = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
            const i = (y * 256 + x) * 4;
            const n = r() * 25 + (kind === 'rock' ? noise(x * 0.5, y * 0.5) * 13 : 0);
            const base = kind === 'road' ? [78, 83, 83] : kind === 'rock' ? [126, 119, 102] : [116, 111, 80];
            for (let k = 0; k < 3; k++)
                data.data[i + k] = Math.max(0, Math.min(255, base[k] + n));
            data.data[i + 3] = 255;
        }
    ctx.putImageData(data, 0, 0);
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.colorSpace = T.SRGBColorSpace;
    tex.repeat.set(kind === 'road' ? 1 : 12, kind === 'road' ? 40 : 12);
    return tex;
}
function box(parent: T.Object3D, m: T.Material, w: number, h: number, d: number, x: number, y: number, z: number) { const o = new T.Mesh(Math.min(w,h,d)>0.12?new RoundedBoxGeometry(w,h,d,1,Math.min(0.065,Math.min(w,h,d)*0.08)):new T.BoxGeometry(w,h,d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; }
function cylinder(parent: T.Object3D, m: T.Material, r: number, len: number, x: number, y: number, z: number) { const o = new T.Mesh(new T.CylinderGeometry(r, r, len, 24), m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; }
function bar(parent: T.Object3D, m: T.Material, a: T.Vector3, b: T.Vector3, r = 0.045) { const o = new T.Mesh(new T.CylinderGeometry(r, r, a.distanceTo(b), 12), m); o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()); o.castShadow = true; parent.add(o); return o; }
/** Merge stationary modular details by material; wheels and turret retain their independent articulation. */
function mergeStaticMeshes(group: T.Group) {
    const batches = new Map<T.Material, T.Mesh[]>();
    for (const child of group.children) {
        if (child instanceof T.Mesh && !(child instanceof T.InstancedMesh) && !Array.isArray(child.material)) {
            const list = batches.get(child.material) ?? [];
            list.push(child);
            batches.set(child.material, list);
        }
    }
    for (const [material, meshes] of batches) {
        if (meshes.length < 2)
            continue;
        const parts = meshes.map(m => { m.updateMatrix(); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix); return g; });
        const merged = mergeGeometries(parts);
        parts.forEach(g => g.dispose());
        if (!merged)
            continue;
        const mesh = new T.Mesh(merged, material);
        mesh.castShadow = meshes.some(m => m.castShadow);
        mesh.receiveShadow = meshes.some(m => m.receiveShadow);
        for (const m of meshes) {
            group.remove(m);
            m.geometry.dispose();
        }
        group.add(mesh);
    }
}
function chevronMaterial() {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#b9342e';ctx.fillRect(0,0,512,128);ctx.fillStyle='#ead357';
    for(let y=-100;y<150;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y+75);ctx.lineTo(512,y);ctx.lineTo(512,y+32);ctx.lineTo(256,y+107);ctx.lineTo(0,y+32);ctx.closePath();ctx.fill();}
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    return new T.MeshStandardMaterial({map:texture,roughness:0.55,metalness:0.15});
}
function makeTruck() {
    const g = new T.Group();
    const red = mat('#bd2930', 0.34, 0.28), dark = mat('#202a2d', 0.52, 0.3), silver = mat('#adb8bb', 0.31, 0.72), white = mat('#eee6d4', 0.4, 0.25), rubber = mat('#151c1b'), glass = mat('#355b68', 0.15, 0.55), light = mat('#fff0c0', 0.3);
    (light as T.MeshStandardMaterial).emissive.set('#ffe3a5');
    box(g, dark, 2.45, 0.35, 6.6, 0, 0.9, 0);
    box(g, red, 2.55, 1.7, 2, 0, 2, -2.1);
    box(g, red, 2.65, 1.85, 3.9, 0, 2, 0.95);
    box(g, white, 2.62, 0.16, 2.1, 0, 2.94, -2.1);
    box(g, dark, 2.63, 0.25, 0.65, 0, 1.55, -3.17);
    const wind = box(g, glass, 2.24, 0.84, 0.03, 0, 2.38, -3.12);
    wind.rotation.x = -0.08;
    box(g, red, 0.07, 0.87, 0.05, 0, 2.39, -3.15);
    for (const side of [-1, 1]) {
        box(g, glass, 0.03, 0.76, 1.37, side * 1.29, 2.44, -2.1);
        box(g, silver, 0.09, 0.045, 0.22, side * 1.31, 1.9, -1.8);
        box(g, white, 0.03, 0.15, 5.9, side * 1.335, 1.7, 0.1);
        bar(g, silver, new T.Vector3(side * 1.28, 2.2, -2.8), new T.Vector3(side * 1.68, 2.35, -2.7));
        box(g, dark, 0.22, 0.38, 0.13, side * 1.67, 2.38, -2.72);
        for (let j = 0; j < 3; j++) {
            box(g, silver, 0.035, 1.26, 1.03, side * 1.335, 2.12, -0.45 + j * 1.15);
            for (let k = 0; k < 12; k++)
                box(g, dark, 0.041, 0.012, 0.99, side * 1.36, 1.59 + k * 0.098, -0.45 + j * 1.15);
            box(g, dark, 0.05, 0.045, 0.35, side * 1.38, 1.62, -0.45 + j * 1.15);
        }
        box(g, silver, 0.38, 0.12, 1.5, side * 1.25, 1.18, -2.1);
    }
    box(g, dark, 1.36, 0.46, 0.045, 0, 1.83, -3.17);
    for (let i = 0; i < 6; i++)
        box(g, silver, 1.26, 0.025, 0.05, 0, 1.65 + i * 0.069, -3.2);
    for (const x of [-0.92, 0.92]) {
        box(g, light, 0.38, 0.23, 0.06, x, 1.64, -3.2);
        box(g, silver, 0.46, 0.12, 0.05, x, 1.28, -3.21);
    }
    box(g, silver, 2.7, 0.18, 0.3, 0, 1.13, -3.23);
    box(g, silver, 2.7, 0.18, 0.3, 0, 1.03, 3.04);
    const wheels: T.Group[] = [], front: T.Group[] = [];
    for (const z of [-2.05, 1.9])
        for (const side of [-1, 1]) {
            const pivot = new T.Group();
            pivot.position.set(side * 1.3, 0.82, z);
            g.add(pivot);
            const spin = new T.Group();
            pivot.add(spin);
            const tire = new T.Mesh(new T.TorusGeometry(0.52, 0.2, 12, 32), rubber);
            tire.rotation.y = Math.PI / 2;
            spin.add(tire);
            const hub = new T.Mesh(new T.CylinderGeometry(0.38, 0.38, 0.15, 24), silver);
            hub.rotation.z = Math.PI / 2;
            hub.position.x = side * 0.17;
            spin.add(hub);
            for (let i = 0; i < 8; i++) {
                const bolt = new T.Mesh(new T.SphereGeometry(0.035, 6, 4), dark);
                bolt.position.set(side * 0.26, Math.sin(i * Math.PI / 4) * 0.27, Math.cos(i * Math.PI / 4) * 0.27);
                spin.add(bolt);
            }
            wheels.push(spin);
            if (z < 0)
                front.push(pivot);
            const arch = new T.Mesh(new T.TorusGeometry(0.77, 0.09, 8, 24, Math.PI), dark);
            arch.rotation.y = Math.PI / 2;
            arch.position.set(side * 1.36, 0.84, z);
            g.add(arch);
        }
    box(g, dark, 2.3, 0.14, 3.8, 0, 2.98, 0.96);
    for (const side of [-1, 1]) {
        bar(g, silver, new T.Vector3(side * 1.12, 3.19, -0.9), new T.Vector3(side * 1.12, 3.19, 2.9));
        for (const z of [-0.9, 0.6, 2.9])
            bar(g, silver, new T.Vector3(side * 1.12, 2.98, z), new T.Vector3(side * 1.12, 3.19, z));
    }
    for (const x of [-0.68, -0.25]) {
        bar(g, silver, new T.Vector3(x, 3.2, -0.6), new T.Vector3(x, 3.2, 2.65), 0.035);
    }
    for (let j = 0; j < 14; j++)
        bar(g, silver, new T.Vector3(-0.68, 3.2, -0.6 + j * 0.24), new T.Vector3(-0.25, 3.2, -0.6 + j * 0.24), 0.025);
    const beaconMaterial = new T.MeshStandardMaterial({ color: '#df5539', emissive: '#d74428', emissiveIntensity: 0.3, roughness: 0.2 });
    box(g, dark, 1.7, 0.07, 0.36, 0, 3.08, -2.3);
    for (const x of [-0.65, 0.65])
        cylinder(g, beaconMaterial, 0.18, 0.2, x, 3.21, -2.3);
    box(g, dark, 2.35, 1.4, 0.05, 0, 1.99, 2.94);
    box(g, silver, 0.94, 0.66, 0.07, 0, 1.67, 3);
    for (const x of [-0.7, 0.7]) {
        const reel = new T.Mesh(new T.TorusGeometry(0.28, 0.11, 12, 24), dark);
        reel.position.set(x, 2.32, 3.03);
        g.add(reel);
        box(g, red, 0.48, 0.55, 0.18, x, 1.44, 3.03);
    }
    box(g,chevronMaterial(),2.48,0.36,0.055,0,2.79,3.055);
    // Original pump manifold, valves and pressure gauges on the rear equipment panel.
    for (const x of [-0.28,0.28]) {
        const gauge=cylinder(g,white,0.12,0.025,x,1.88,3.055);gauge.rotation.x=Math.PI/2;
        bar(g,dark,new T.Vector3(x-0.04,1.84,3.077),new T.Vector3(x+0.045,1.93,3.077),0.009);
    }
    for(const x of [-0.32,0,0.32]){const coupling=cylinder(g,silver,0.095,0.14,x,1.46,3.1);coupling.rotation.x=Math.PI/2;const valve=new T.Mesh(new T.TorusGeometry(0.1,0.022,6,14),red);valve.position.set(x,1.62,3.19);g.add(valve);}
    const hosePath=new T.CatmullRomCurve3([new T.Vector3(0.75,2.3,3.02),new T.Vector3(0.92,3.13,2.4),new T.Vector3(0.95,3.16,1.2),new T.Vector3(0.55,3.19,0.5)]);
    g.add(new T.Mesh(new T.TubeGeometry(hosePath,24,0.052,8,false),rubber));
    const brakeMaterial = new T.MeshStandardMaterial({ color: '#b71e22', emissive: '#fb2e21', emissiveIntensity: 0.3 });
    for (const x of [-1.05, 1.05])
        box(g, brakeMaterial, 0.18, 0.3, 0.06, x, 1.69, 3.07);
    const turret = new T.Group();
    turret.position.set(0.55, 3.12, 0.5);
    g.add(turret);
    cylinder(turret, silver, 0.17, 0.17, 0, 0, 0);
    bar(turret, red, new T.Vector3(0, 0, 0), new T.Vector3(0, 0.45, -0.45), 0.1);
    const barrel = bar(turret, silver, new T.Vector3(0, 0.45, -0.45), new T.Vector3(0, 0.52, -1.1), 0.09);
    void barrel;
    g.traverse(o => { if (o instanceof T.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
    } });
    wheels.forEach(mergeStaticMeshes);
    mergeStaticMeshes(turret);
    mergeStaticMeshes(g);
    return { group: g, wheels, front, turret, brakeMaterial, beaconMaterial };
}
const flameVert = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const flameFrag = `varying vec2 vUv;uniform float time;uniform float strength;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec2 p=vUv;float wav=sin(p.y*14.0-time*2.4)*.08+sin(p.y*23.0+time*3.0)*.035;float width=(1.0-p.y)*.45;float edge=smoothstep(width+.1,width-.07,abs(p.x-.5+wav*p.y));float grain=hash(floor(vec2(p.x*25.,p.y*18.-time*4.)));float alpha=edge*smoothstep(0.,.08,p.y)*(1.-smoothstep(.6,1.,p.y))*mix(.6,1.,grain)*strength;vec3 c=mix(vec3(1.,.24,.025),vec3(1.,.88,.35),pow(1.-p.y,2.));gl_FragColor=vec4(c,alpha);}`;
function foliageTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const r = rng(815);
    ctx.strokeStyle = '#665f40';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(128, 250);
    ctx.bezierCurveTo(125, 170, 140, 90, 128, 25);
    ctx.stroke();
    for (let i = 0; i < 480; i++) {
        const a = r() * Math.PI * 2;
        const radius = Math.sqrt(r());
        const x = 128 + Math.cos(a) * radius * 110, y = 128 + Math.sin(a) * radius * 110;
        ctx.fillStyle = `hsl(${82 + r() * 25} ${22 + r() * 22}% ${23 + r() * 25}%)`;
        ctx.beginPath();
        ctx.ellipse(x, y, 3 + r() * 7, 2 + r() * 4, r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    }
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
}
function crownGeometry() { const parts = []; for (const a of [0, Math.PI / 3, Math.PI * 2 / 3]) {
    const g = new T.PlaneGeometry(2.4, 2.4);
    g.rotateY(a);
    parts.push(g);
} const merged = mergeGeometries(parts)!; parts.forEach(g => g.dispose()); return merged; }
function smokeTexture() { const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d')!; const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64); grad.addColorStop(0, 'rgba(125,126,119,0.5)'); grad.addColorStop(0.4, 'rgba(139,139,130,0.3)'); grad.addColorStop(1, 'rgba(140,140,140,0)'); ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); }
export class FireRescueRenderer {
    private renderer: T.WebGLRenderer;
    private scene = new T.Scene();
    private camera = new T.PerspectiveCamera(48, 1, 0.3, 1400);
    private world = new T.Group();
    private truck = makeTruck();
    private state: State;
    private stage = -1;
    private quality = '';
    private observer: ResizeObserver;
    private raf = 0;
    private disposed = false;
    private environment: T.WebGLRenderTarget | null = null;
    private sky: Sky | null = null;
    private fireGroups: T.Group[] = [];
    private flames: T.ShaderMaterial[] = [];
    private smoke: T.Sprite[] = [];
    private stream: T.Mesh;
    private splash: T.Points;
    private splashPositions = new Float32Array(180);
    private sun: T.DirectionalLight;
    private statsAt = 0;
    private statsFrames = 0;
    private previous = 0;
    private shownDistance = 0;
    private shownLateral = 0;
    private shownHeading = 0;
    private viewMix = 0;
    private angle = 0;
    private frames = 0;
    private foliage: T.MeshStandardMaterial | null = null;
    constructor(private host: HTMLElement, state: State, private onStats?: (stats: RenderStats) => void) {
        this.state = state;
        this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        this.renderer.outputColorSpace = T.SRGBColorSpace;
        this.renderer.toneMapping = T.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.8;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = T.PCFShadowMap;
        host.appendChild(this.renderer.domElement);
        const sky = new Sky();
        this.sky = sky;
        sky.scale.setScalar(2000);
        sky.material.uniforms.turbidity.value = 4;
        sky.material.uniforms.rayleigh.value = 1.6;
        sky.material.uniforms.mieCoefficient.value = 0.004;
        sky.material.uniforms.mieDirectionalG.value = 0.8;
        sky.material.uniforms.sunPosition.value.set(-0.5, 0.65, 0.3).normalize();
        this.scene.add(sky);
        const envScene = new T.Scene();
        envScene.add(sky.clone());
        const pmrem = new T.PMREMGenerator(this.renderer);
        this.environment = pmrem.fromScene(envScene, 0.04, 0.1, 4000);
        this.scene.environment = this.environment.texture;
        this.scene.environmentIntensity = 0.12;
        pmrem.dispose();
        this.scene.background = new T.Color('#b6d0dd');
        this.scene.fog = new T.FogExp2('#b6d0dd', 0.0027);
        this.scene.add(new T.HemisphereLight('#d6eeff', '#70654d', 2));
        this.sun = new T.DirectionalLight('#fff1d5', 3.2);
        this.sun.position.set(-80, 110, 30);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.camera.left = -70;
        this.sun.shadow.camera.right = 70;
        this.sun.shadow.camera.top = 70;
        this.sun.shadow.camera.bottom = -70;
        this.sun.shadow.camera.near = 1;
        this.sun.shadow.camera.far = 250;
        this.sun.shadow.normalBias = 0.06;
        this.scene.add(this.sun, this.sun.target, this.world, this.truck.group);
        const water = new T.MeshBasicMaterial({ color: '#9de6ff', transparent: true, opacity: 0.8, depthWrite: false });
        this.stream = new T.Mesh(new T.CylinderGeometry(0.065, 0.18, 1, 10, 8), water);
        this.scene.add(this.stream);
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(this.splashPositions, 3));
        this.splash = new T.Points(geo, new T.PointsMaterial({ color: '#c4f2ff', size: 0.12, transparent: true, opacity: 0.8, depthWrite: false }));
        this.scene.add(this.splash);
        this.observer = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (w && h) {
            this.renderer.setSize(w, h);
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
        } });
        this.observer.observe(host);
        this.buildWorld();
        this.shownDistance = state.distance;
        this.shownLateral = state.lateral;
        this.camera.position.set(roadX(state.stage, state.distance) - 1, 6.5, -state.distance + 14);
        this.raf = requestAnimationFrame(this.frame);
    }
    update(state: State) { this.state = state; if (state.stage !== this.stage || state.config.quality !== this.quality)
        this.buildWorld(); }
    private disposeGroup(group: T.Group) { const geos = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>(); group.traverse(o => { if (o instanceof T.Mesh || o instanceof T.Sprite || o instanceof T.Points) {
        if ('geometry' in o)
            geos.add(o.geometry);
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(m => { materials.add(m); for (const v of Object.values(m))
            if (v instanceof T.Texture)
                textures.add(v); });
    } }); geos.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.clear(); }
    private buildWorld() {
        this.disposeGroup(this.world);
        this.fireGroups = [];
        this.flames = [];
        this.smoke = [];
        this.stage = this.state.stage;
        this.quality = this.state.config.quality;
        const low = this.quality === 'low';
        this.renderer.setPixelRatio(low ? 0.75 : Math.min(devicePixelRatio, 1.5));
        this.renderer.shadowMap.enabled = !low;
        const def = STAGES[this.stage];
        const random = rng(451 + this.stage * 19);
        const forest = def.environment === 'forest', country = def.environment === 'countryside';
        const groundMap = surfaceTexture('ground');
        const ground = mat(forest ? '#63734a' : country ? '#879266' : '#a19b83');
        ground.map = groundMap;
        ground.bumpMap = groundMap;
        ground.bumpScale = 0.2;
        const height = (x: number, z: number) => { const s = -z, c = roadX(this.stage, s), offset = x - c, dist = Math.max(0, Math.abs(offset) - 9); if (offset > 5 && offset < 22 && def.stops.some(stop => Math.abs(s - stop) < 18))
            return -0.12; const mountain = (offset < 0 ? Math.pow(Math.min(dist, 110) * 0.5, 1.18) * 0.7 : -Math.min(dist * 0.12, 10)) * (forest ? 0.22 : country ? 0.65 : 1); return mountain + noise(x, z) * Math.min(dist * 0.25, 2.8) - 0.12; };
        const terrain = new T.PlaneGeometry(540, def.length + 620, low ? 100 : 180, low ? 110 : 210);
        terrain.rotateX(-Math.PI / 2);
        terrain.translate(0, 0, -def.length / 2);
        const pos = terrain.getAttribute('position');
        const colors = [];
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            pos.setY(i, height(x, z));
            const shade = 0.78 + (noise(x, z) + 3) * 0.06;
            colors.push(shade, shade, shade * 0.93);
        }
        terrain.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
        terrain.computeVertexNormals();
        ground.vertexColors = true;
        const land = new T.Mesh(terrain, ground);
        land.receiveShadow = true;
        this.world.add(land);
        const asphalt = mat('#e5dac4');
        const roadMap = surfaceTexture('road');
        asphalt.map = roadMap;
        asphalt.bumpMap = roadMap;
        asphalt.bumpScale = 0.04;
        const roadGeo = new T.BufferGeometry();
        const verts = [], uv = [], idx = [];
        const steps = Math.ceil((def.length + 70) / 2);
        for (let j = 0; j <= steps; j++) {
            const s = -20 + j * 2;
            const x = roadX(this.stage, s);
            const heading = roadHeading(this.stage, s);
            for (const side of [-1, 1]) {
                verts.push(x + side * 4.5 * Math.cos(heading), 0.04, -s + side * 4.5 * Math.sin(heading));
                uv.push((side + 1) / 2, j / steps);
            }
            if (j < steps) {
                const k = j * 2;
                idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
            }
        }
        roadGeo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
        roadGeo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        roadGeo.setIndex(idx);
        roadGeo.computeVertexNormals();
        const road = new T.Mesh(roadGeo, asphalt);
        road.receiveShadow = true;
        this.world.add(road);
        const markings = mat('#e9e6ca');
        for (let s = -10; s < def.length + 45; s += 5) {
            const x = roadX(this.stage, s), heading = roadHeading(this.stage, s);
            const mark = box(this.world, markings, 0.13, 0.014, 2.5, x, 0.065, -s);
            mark.rotation.y = -heading;
            mark.castShadow = false;
            for (const side of [-1, 1]) {
                const edge = box(this.world, markings, 0.1, 0.014, 5.15, x + side * 4.05 * Math.cos(heading), 0.065, -s + side * 4.05 * Math.sin(heading));
                edge.rotation.y = -heading;
                edge.castShadow = false;
            }
        }
        const rockMap = surfaceTexture('rock');
        rockMap.repeat.set(1, 1);
        const stone = mat('#c3b79f');
        stone.map = rockMap;
        stone.bumpMap = rockMap;
        stone.bumpScale = 0.5;
        const count = forest ? (low ? 45 : 80) : country ? (low ? 70 : 130) : (low ? 100 : 180);
        const rockGeo = new T.IcosahedronGeometry(1, 2);
        const rockVertices = rockGeo.getAttribute('position');
        for (let i=0;i<rockVertices.count;i++) {
            const x=rockVertices.getX(i),y=rockVertices.getY(i),z=rockVertices.getZ(i);
            const fracture=0.82+0.18*Math.sin(x*9+y*5-z*7)+0.09*Math.cos(z*13-x*7);
            rockVertices.setXYZ(i,x*fracture,y*fracture,z*fracture);
        }
        rockGeo.computeVertexNormals();
        stone.flatShading=true;
        const rocks = new T.InstancedMesh(rockGeo, stone, count);
        rocks.castShadow = true;
        rocks.receiveShadow = true;
        const dummy = new T.Object3D();
        for (let i = 0; i < count; i++) {
            const s = random() * (def.length + 160) - 50;
            const side = i % 3 ? -1 : 1;
            const radius = side < 0 ? 1.7 + random() * (forest ? 3 : 7) : 0.6 + random() * 2;
            const off = 6 + radius + random() * 65;
            const x = roadX(this.stage, s) + side * off;
            dummy.position.set(x, height(x, -s) + radius * 0.3, -s);
            dummy.rotation.set(random() * 3, random() * 3, random() * 3);
            dummy.scale.set(radius, radius * (0.9 + random()*0.8), radius * (0.7 + random()*0.6));
            dummy.updateMatrix();
            rocks.setMatrixAt(i, dummy.matrix);
        }
        this.world.add(rocks);
        const nTrees = forest ? (low ? 120 : 200) : country ? (low ? 80 : 130) : (low ? 65 : 110);
        const trunkMat = mat('#6f634b');
        const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.13, 0.27, 1, 8), trunkMat, nTrees);
        const leafMat = mat(forest ? '#96ac81' : country ? '#b4b386' : '#a3b18b');
        leafMat.map = foliageTexture();
        leafMat.alphaTest = 0.4;
        leafMat.side = T.DoubleSide;
        this.foliage = leafMat;
        leafMat.onBeforeCompile = (shader) => { shader.uniforms.frTime = { value: 0 }; shader.vertexShader = 'uniform float frTime;\n' + shader.vertexShader; shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.x += sin(frTime + position.y * 2.0) * 0.022 * abs(position.y);'); leafMat.userData.shader = shader; };
        const crowns = new T.InstancedMesh(crownGeometry(), leafMat, nTrees * 7);
        trunks.castShadow = !low;
        crowns.castShadow = !low;
        crowns.receiveShadow = true;
        for (let i = 0; i < nTrees; i++) {
            const s = random() * (def.length + 180) - 40;
            const x = roadX(this.stage, s) + (i % 2 ? -1 : 1) * (8 + random() * 95);
            const y = height(x, -s);
            const h = 3.5 + random() * 4.5;
            dummy.position.set(x, y + h / 2, -s);
            dummy.rotation.set(0, random() * 3, 0);
            dummy.scale.set(1, h, 1);
            dummy.updateMatrix();
            trunks.setMatrixAt(i, dummy.matrix);
            for (let j = 0; j < 7; j++) {
                const a = j * 2.399;
                dummy.position.set(x + Math.cos(a) * 1.3, y + h * 0.8 + (j % 3) * 0.8, -s + Math.sin(a) * 1.3);
                dummy.scale.set(1.6 + random() * 0.6, 1.4 + random() * 0.6, 1.6 + random() * 0.8);
                dummy.updateMatrix();
                crowns.setMatrixAt(i * 7 + j, dummy.matrix);
                crowns.setColorAt(i * 7 + j, new T.Color().setHSL(0.22 + random() * 0.06, 0.15 + random() * 0.1, 0.68 + random() * 0.18));
            }
        }
        this.world.add(trunks, crowns);
        const bushes = new T.InstancedMesh(crowns.geometry, leafMat, low ? 160 : 350);
        for (let i = 0; i < bushes.count; i++) {
            const s = random() * (def.length + 100) - 20;
            const x = roadX(this.stage, s) + (i % 2 ? -1 : 1) * (5.8 + random() * 40);
            dummy.position.set(x, height(x, -s) + 0.3, -s);
            dummy.rotation.set(0, random() * 6, 0);
            const v = 0.3 + random() * 0.6;
            dummy.scale.set(v, v * 0.7, v);
            dummy.updateMatrix();
            bushes.setMatrixAt(i, dummy.matrix);
        }
        this.world.add(bushes);
        // Slim roadside guardrail and reflective posts retain an obvious safe route.
        const rail = mat('#a5aaa4', 0.5, 0.65);
        for (let s = -10; s < def.length + 30; s += 6) {
            const x = roadX(this.stage, s) + 4.75;
            bar(this.world, rail, new T.Vector3(x, 0.1, -s), new T.Vector3(x, 0.9, -s), 0.055);
            bar(this.world, rail, new T.Vector3(x, 0.8, -s), new T.Vector3(roadX(this.stage, s + 6) + 4.75, 0.8, -s - 6), 0.08);
            box(this.world, markings, 0.13, 0.1, 0.09, x, 0.94, -s);
        }
        // Distant ridgelines, original continuous terrain meshes, atmospheric depth.
        for (let j = 0; j < 3; j++) {
            const mGeo = new T.PlaneGeometry(1600, 1000, low ? 35 : 65, low ? 30 : 55);
            mGeo.rotateX(-Math.PI / 2);
            mGeo.translate(-320 + j * 300, 0, -550 - j * 230);
            const p = mGeo.getAttribute('position');
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), z = p.getZ(i);
                const ridge = 70 + 55 * Math.exp(-Math.pow((x + 350 - j * 120) / 230, 2)) + 45 * Math.exp(-Math.pow((x - 300) / 160, 2));
                const shape = Math.exp(-Math.pow((z + 560 + j * 180) / 330, 2));
                const edgeX=Math.max(0,1-Math.pow(Math.abs((x-(-320+j*300))/800),8));
                const edgeZ=Math.max(0,1-Math.pow(Math.abs((z-(-550-j*230))/500),8));
                const crags=Math.sin(x*0.023+j)*17+Math.sin(x*0.067-z*0.018)*9;
                p.setY(i, -45+(ridge+crags+noise(x*0.08,z*0.08)*5)*shape*edgeX*edgeZ);
            }
            mGeo.computeVertexNormals();
            this.world.add(new T.Mesh(mGeo, mat(j === 0 ? '#87958d' : '#98a9a6')));
        }
        const cloudTex = smokeTexture();
        for (let i = 0; i < 12; i++) {
            const cm = new T.SpriteMaterial({ map: cloudTex, color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
            const cloud = new T.Sprite(cm);
            cloud.position.set(-350 + random() * 700, 140 + random() * 100, -250 - random() * 600);
            cloud.scale.set(65, 30, 1);
            this.world.add(cloud);
        }
        mergeStaticMeshes(this.world);
        this.buildFires();
    }
    private buildFires() {
        const def = STAGES[this.stage];
        const map = smokeTexture();
        for (let j = 0; j < def.stops.length; j++)
            for (let k = 0; k < def.targets[j]; k++) {
                const t = targetAim(k, def.targets[j]);
                const group = new T.Group();
                group.position.set(roadX(this.stage, def.stops[j]) + 10, 0, -def.stops[j] + t.x * 9);
                group.userData = { stop: j, target: k };
                this.world.add(group);
                this.fireGroups.push(group);
                for (let i = 0; i < 6; i++) {
                    const material = new T.ShaderMaterial({ uniforms: { time: { value: 0 }, strength: { value: 1 } }, vertexShader: flameVert, fragmentShader: flameFrag, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending });
                    const mesh = new T.Mesh(new T.PlaneGeometry(1.5, 3.5), material);
                    mesh.position.set(Math.cos(i * 2.4) * 1.2, 1.65, Math.sin(i * 2.4) * 1.2);
                    mesh.userData.flame = true;
                    group.add(mesh);
                    this.flames.push(material);
                }
                for (let i = 0; i < 6; i++) {
                    const smoke = new T.Sprite(new T.SpriteMaterial({ map, color: '#7d827d', transparent: true, opacity: 0.34, depthWrite: false }));
                    smoke.position.set(0, 4 + i * 1.1, 0);
                    smoke.scale.set(3 + i * 0.6, 3 + i * 0.6, 1);
                    smoke.userData = { stop: j, target: k, index: i };
                    group.add(smoke);
                    this.smoke.push(smoke);
                }
                const lamp = new T.PointLight('#ffb24e', 4, 12);
                lamp.position.y = 2;
                group.add(lamp);
                const ring = new T.Mesh(new T.RingGeometry(1.8, 1.88, 48), new T.MeshBasicMaterial({ color: '#e9de8b', transparent: true, opacity: 0.65, side: T.DoubleSide }));
                ring.rotation.x = -Math.PI / 2;
                ring.position.y = 0.11;
                group.add(ring);
            }
    }
    private frame = (ms: number) => {
        if (this.disposed)
            return;
        const dt = this.previous ? Math.min(0.05, (ms - this.previous) / 1000) : 0.016;
        this.previous = ms;
        const s = this.state;
        const active = s.status === 'running';
        const moving = active && s.phase === 'driving';
        const blend = 1 - Math.exp(-dt * 9);
        this.shownDistance += (s.distance - this.shownDistance) * blend;
        this.shownLateral += (s.lateral - this.shownLateral) * blend;
        this.shownHeading += (s.heading - this.shownHeading) * blend;
        if (Math.abs(s.distance - this.shownDistance) > 25) {
            this.shownDistance = s.distance;
            this.shownLateral = s.lateral;
        }
        const rh = roadHeading(s.stage, this.shownDistance);
        const x = roadX(s.stage, this.shownDistance) + this.shownLateral * Math.cos(rh);
        const z = -this.shownDistance + this.shownLateral * Math.sin(rh);
        const truck = this.truck;
        truck.group.position.set(x, 0.1 + (moving && !s.config.reducedMotion ? Math.sin(ms * 0.005) * 0.018 * s.speed : 0), z);
        truck.group.rotation.y = -rh - this.shownHeading;
        if (moving)
            this.angle += s.speed * dt / 0.7;
        truck.wheels.forEach(w => w.rotation.x = -this.angle);
        truck.front.forEach(w => w.rotation.y = -s.steering * 0.3);
        truck.brakeMaterial.emissiveIntensity = s.input.brake > 0 || !moving ? 1 : 0.25;
        truck.beaconMaterial.emissiveIntensity = s.config.reducedMotion ? 0.45 : 0.45 + Math.sin(ms * 0.002) * 0.2;
        this.viewMix += ((s.phase === 'firefighting' ? 1 : 0) - this.viewMix) * (1 - Math.exp(-dt * (s.config.reducedMotion ? 1.1 : 0.7)));
        const drivePos = new T.Vector3(x - Math.sin(rh) * 14 - Math.cos(rh)*2.8, 6.6, z + Math.cos(rh) * 14 - Math.sin(rh)*2.8), driveLook = new T.Vector3(roadX(s.stage, this.shownDistance + 11), 1.6, -this.shownDistance - 11);
        const stop = STAGES[s.stage].stops[s.stop];
        const center = new T.Vector3(roadX(s.stage, stop) + 10, 1.4, -stop);
        const firePos = new T.Vector3(roadX(s.stage, stop) - 7, 8, -stop + 12);
        const cameraPos = drivePos.lerp(firePos, this.viewMix);
        const look = driveLook.lerp(center, this.viewMix);
        this.camera.position.lerp(cameraPos, 1 - Math.exp(-dt * (s.config.reducedMotion ? 3 : 4)));
        this.camera.lookAt(look);
        this.sun.position.set(x - 65, 100, z + 45);
        this.sun.target.position.set(x, 0, z - 20);
        for (const g of this.fireGroups) {
            const { stop: fireStop, target } = g.userData;
            const intensity = fireStop < s.stop || s.completed.includes(s.stage) ? 0 : fireStop === s.stop ? s.fires[target] : 1;
            g.traverse(o => { if (o instanceof T.Mesh && o.userData.flame) {
                const m = o.material as T.ShaderMaterial;
                m.uniforms.time.value = s.config.reducedMotion ? 0 : ms / 1000;
                m.uniforms.strength.value = intensity;
                o.scale.y = 0.3 + intensity * 0.7;
                o.quaternion.copy(this.camera.quaternion);
            } if (o instanceof T.PointLight)
                o.intensity = 4 * intensity; });
        }
        for (const p of this.smoke) {
            const { stop: fs, target, index } = p.userData;
            const intensity = fs < s.stop || s.completed.includes(s.stage) ? 0 : fs === s.stop ? s.fires[target] : 1;
            (p.material as T.SpriteMaterial).opacity = intensity * 0.3;
            p.position.y = 3 + index * 1.1 + (s.config.reducedMotion ? 0 : ((ms / 1000 + index) % 3) * 0.35);
            p.position.x = Math.sin(index + ms * 0.0002) * 0.7;
        }
        const flowing = active && s.phase === 'firefighting' && (s.input.water || s.config.autoWater);
        this.stream.visible = flowing;
        this.splash.visible = flowing;
        const endpoint = new T.Vector3(center.x, 0.4 + s.aim.y * 5, center.z + s.aim.x * 9);
        const nozzle = truck.turret;
        if (s.phase === 'firefighting') {
            const local = truck.group.worldToLocal(endpoint.clone()).sub(nozzle.position);
            nozzle.rotation.y = Math.atan2(-local.x, -local.z);
            nozzle.rotation.x = Math.atan2(local.y, Math.hypot(local.x, local.z));
        }
        const origin = nozzle.localToWorld(new T.Vector3(0, 0.52, -1.1));
        if (flowing) {
            const delta = endpoint.clone().sub(origin);
            this.stream.position.copy(origin).add(endpoint).multiplyScalar(0.5);
            this.stream.scale.y = delta.length();
            this.stream.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
            for (let i = 0; i < 60; i++) {
                const t = ((ms * 0.0008 + i * 0.117) % 1);
                this.splashPositions[i * 3] = endpoint.x + Math.sin(i * 2.4) * t * 0.7;
                this.splashPositions[i * 3 + 1] = endpoint.y + Math.sin(t * Math.PI) * 0.65;
                this.splashPositions[i * 3 + 2] = endpoint.z + Math.cos(i * 2.4) * t * 0.7;
            }
            this.splash.geometry.getAttribute('position').needsUpdate = true;
        }
        if (this.foliage?.userData.shader)
            this.foliage.userData.shader.uniforms.frTime.value = s.config.reducedMotion ? 0 : ms * 0.00065;
        this.renderer.render(this.scene, this.camera);
        this.frames++;
        this.statsFrames++;
        if (ms - this.statsAt >= 1000) {
            const info = this.renderer.info;
            this.onStats?.({ fps: Math.round(this.statsFrames * 1000 / (ms - this.statsAt)), drawCalls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, frames: this.frames });
            this.statsAt = ms;
            this.statsFrames = 0;
        }
        this.raf = requestAnimationFrame(this.frame);
    };
    dispose() { this.disposed = true; cancelAnimationFrame(this.raf); this.observer.disconnect(); this.disposeGroup(this.world); this.disposeGroup(this.truck.group); this.stream.geometry.dispose(); (this.stream.material as T.Material).dispose(); this.splash.geometry.dispose(); (this.splash.material as T.Material).dispose(); this.environment?.dispose();
        this.sky?.geometry.dispose();
        this.sky?.material.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
