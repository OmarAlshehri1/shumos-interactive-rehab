import * as T from 'three';
import { bearingTo, currentMarker, distanceTo, wrapPi, type Quality, type State } from './engine';
import { SPECIES, STAGES, type SpeciesId } from './stages';
import { buildBoat, type Boat } from './render/boat';
import { buildSeaGardens, buildSchools } from './render/coral';
import { ENV_STYLES, type EnvStyle } from './render/environments';
import { buildFish, type FishModel } from './render/fish';
import { Particles } from './render/fx';
import { buildHorizon, buildIsland } from './render/islands';
import { buildGulls } from './render/life';
import { buildArrow, buildMarkers, type MarkerViews } from './render/markers';
import { makeClouds, makeSky, sunDirection } from './render/sky';
import { disposeObject, waveHeight, waveSlope } from './render/util';
import { Ocean } from './render/water';

export interface RenderStats {
    fps: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    frames: number;
}
const PIXEL_RATIO: Record<Quality, number> = { high: 1.75, medium: 1.25, low: 0.9 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const toThree = (x: number, y: number) => new T.Vector3(x, 0, -y);

/**
 * Pearl Voyage 3D renderer. Draws a deterministic `State` and nothing else: boat motion is smoothed and gently
 * extrapolated between state updates, the fish encounter is choreographed locally from phase changes, and
 * every effect is cosmetic. Reduced motion removes leaps, camera lag changes and most particles.
 */
export class PearlVoyageRenderer {
    private renderer: T.WebGLRenderer;
    private scene = new T.Scene();
    private camera = new T.PerspectiveCamera(52, 1, 0.3, 4200);
    private world = new T.Group();
    private state: State;
    private stageIndex = -1;
    private quality: Quality | '' = '';
    private markerRadius = -1;
    private observer: ResizeObserver;
    private raf = 0;
    private disposed = false;
    private env!: EnvStyle;
    private envTarget: T.WebGLRenderTarget | null = null;
    private ocean!: Ocean;
    private sky!: T.Mesh;
    private clouds!: T.Group;
    private horizon!: T.Group;
    private islandFoams: T.ShaderMaterial[] = [];
    private gardenTime: { value: number } = { value: 0 };
    private schools!: ReturnType<typeof buildSchools>;
    private gulls!: ReturnType<typeof buildGulls>;
    private markers!: MarkerViews;
    private boat!: Boat;
    private arrow = buildArrow();
    private route!: T.InstancedMesh;
    private hemi = new T.HemisphereLight('#ffffff', '#ffffff', 1.4);
    private sun = new T.DirectionalLight('#ffffff', 3);
    private splash = new Particles(420, false);
    private wake = new Particles(360, false);
    private sparkle = new Particles(420, true);
    private fishCache = new Map<SpeciesId, FishModel>();
    private fish: FishModel | null = null;
    // displayed (smoothed) boat
    private shown = { x: 0, y: 0, heading: 0, speed: 0, steering: 0 };
    private seeded = false;
    private stateAt = 0;
    private camHeading = 0;
    private camReady = false;
    private lookAt = new T.Vector3();
    private time = 0;
    private previous = 0;
    private statsAt = 0;
    private statsFrames = 0;
    private frames = 0;
    private phaseAt = { encounter: -1, celebrate: -1, sailing: 0 };
    private lastPhase = '';
    private lastMarker = -1;
    private flags = { appear: false, land: false, burst: false, ripple: 0 };
    private lastLeap = 0;
    private wakeCarry = 0;
    private holdSmooth = 0;
    private glow = 0;
    private lastFishPos = new T.Vector3();

    constructor(private host: HTMLElement, state: State, private onStats?: (stats: RenderStats) => void) {
        this.state = state;
        this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.outputColorSpace = T.SRGBColorSpace;
        this.renderer.toneMapping = T.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.92;
        host.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
        this.scene.add(this.world, this.hemi, this.sun, this.sun.target);
        this.scene.add(this.splash.points, this.wake.points, this.sparkle.points);
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(host);
        this.resize();
        this.buildWorld();
        this.raf = requestAnimationFrame(this.frame);
    }
    update(state: State) {
        const prev = this.state;
        this.state = state;
        this.stateAt = performance.now();
        if (state.phase !== prev.phase || state.marker !== prev.marker || state.stage !== prev.stage) this.onPhase(prev);
        if (state.stage !== this.stageIndex || state.config.quality !== this.quality) this.buildWorld();
        else if (Math.abs(state.config.markerRadius - this.markerRadius) > 0.01) this.buildMarkers();
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, PIXEL_RATIO[state.config.quality]));
    }
    private resize() {
        const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }
    private onPhase(prev: State) {
        const s = this.state;
        if (s.phase === 'encounter' && prev.phase !== 'encounter') {
            this.phaseAt.encounter = this.time;
            this.flags = { appear: false, land: false, burst: false, ripple: 0 };
            this.lastLeap = 0;
            this.useFish(currentMarker(s).species);
        }
        if (s.phase === 'celebrate' && prev.phase !== 'celebrate') { this.phaseAt.celebrate = this.time; this.flags.burst = false; }
        if (s.phase === 'sailing') { this.phaseAt.sailing = this.time; if (this.fish) this.fish.group.visible = false; }
    }
    private useFish(id: SpeciesId) {
        if (this.fish) this.fish.group.visible = false;
        let model = this.fishCache.get(id);
        if (!model) { model = buildFish(id); this.fishCache.set(id, model); this.world.add(model.group); }
        model.group.visible = false;
        this.fish = model;
    }
    private clearWorld() {
        disposeObject(this.world);
        this.world.clear();
        this.fishCache.forEach(m => m.dispose());
        this.fishCache.clear();
        this.fish = null;
        this.ocean?.dispose();
        this.markers?.dispose();
        this.schools?.mesh.geometry.dispose();
        this.gulls?.dispose();
        this.envTarget?.dispose();
        this.envTarget = null;
        this.islandFoams = [];
    }
    private buildWorld() {
        this.clearWorld();
        const s = this.state, def = STAGES[s.stage];
        this.stageIndex = s.stage;
        this.quality = s.config.quality;
        const q = s.config.quality;
        this.env = ENV_STYLES[def.env];
        const env = this.env;
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, PIXEL_RATIO[q]));
        this.renderer.toneMappingExposure = env.sky.exposure + 0.3;
        this.renderer.setClearColor(env.horizon);
        this.scene.fog = new T.FogExp2(env.fog, env.fogDensity);
        this.scene.background = null;
        this.sky = makeSky(env);
        this.world.add(this.sky);
        // environment lighting from the very same sky dome the player sees
        const envScene = new T.Scene();
        envScene.add(makeSky(env));
        const pmrem = new T.PMREMGenerator(this.renderer);
        this.envTarget = pmrem.fromScene(envScene, 0, 0.1, 3000);
        pmrem.dispose();
        envScene.traverse(o => { const m = o as T.Mesh; m.geometry?.dispose(); (m.material as T.Material | undefined)?.dispose(); });
        this.scene.environment = this.envTarget.texture;
        this.scene.environmentIntensity = 0.5;
        this.hemi.color.set(env.hemiSky); this.hemi.groundColor.set(env.hemiGround); this.hemi.intensity = env.hemiIntensity;
        this.sun.color.set(env.sunColor); this.sun.intensity = env.sunIntensity;
        this.clouds = makeClouds(env, q === 'low' ? Math.round(env.cloudCount / 2) : env.cloudCount, def.islands[0].seed);
        this.world.add(this.clouds);
        this.horizon = buildHorizon(env, def.islands[0].seed, q);
        this.world.add(this.horizon);
        this.ocean = new Ocean(env, q, def.islands, def.reefs);
        this.world.add(this.ocean.seabed, this.ocean.mesh);
        def.islands.forEach((isl, i) => { const built = buildIsland(isl, env, i, q, def.start); this.world.add(built.group); this.islandFoams.push(built.foam); });
        const gardens = buildSeaGardens(env, def.reefs, def.islands, q);
        this.gardenTime = gardens.uniform;
        this.world.add(gardens.group);
        this.schools = buildSchools(env, def.reefs, q);
        this.world.add(this.schools.mesh);
        this.gulls = buildGulls(q === 'low' ? 2 : q === 'medium' ? 4 : 6, def.islands[0].seed);
        this.world.add(this.gulls.group);
        this.boat = buildBoat();
        this.world.add(this.boat.group);
        this.world.add(this.arrow);
        const pearl = new T.Mesh(new T.SphereGeometry(0.28, 12, 10), new T.MeshStandardMaterial({ color: '#ffd98a', emissive: '#ffb627', emissiveIntensity: 0.8, roughness: 0.2 }));
        this.route = new T.InstancedMesh(pearl.geometry, pearl.material, 14);
        this.route.frustumCulled = false;
        this.world.add(this.route);
        this.buildMarkers();
        this.seeded = false;
        this.camReady = false;
        if (s.phase !== 'sailing') this.useFish(currentMarker(s).species);
    }
    private buildMarkers() {
        if (this.markers) { this.world.remove(this.markers.group); this.markers.dispose(); }
        const s = this.state;
        this.markerRadius = s.config.markerRadius;
        this.markers = buildMarkers(STAGES[s.stage].markers, s.config.markerRadius);
        this.world.add(this.markers.group);
    }
    private waveAmp() { return this.env.water.amp * (this.state.config.reducedMotion ? 0.55 : 1); }
    private frame = (ms: number) => {
        if (this.disposed) return;
        this.raf = requestAnimationFrame(this.frame);
        const dt = this.previous ? Math.min(0.05, (ms - this.previous) / 1000) : 0.016;
        this.previous = ms;
        const s = this.state, cfg = s.config, reduced = cfg.reducedMotion;
        this.time += dt * (reduced ? 0.6 : 1);
        const time = this.time, amp = this.waveAmp();
        // ---- boat: smoothed, gently extrapolated between state updates
        const since = clamp((ms - this.stateAt) / 1000, 0, 0.25);
        const ahead = s.status === 'running' && s.phase === 'sailing' ? s.speed * since : 0;
        const tx = s.x + Math.sin(s.heading) * ahead, ty = s.y + Math.cos(s.heading) * ahead;
        if (!this.seeded || Math.hypot(tx - this.shown.x, ty - this.shown.y) > 30) { this.shown = { x: tx, y: ty, heading: s.heading, speed: s.speed, steering: s.steering }; this.seeded = true; }
        const k = 1 - Math.exp(-dt * 9);
        this.shown.x += (tx - this.shown.x) * k; this.shown.y += (ty - this.shown.y) * k;
        this.shown.heading = wrapPi(this.shown.heading + wrapPi(s.heading - this.shown.heading) * k);
        this.shown.speed += (s.speed - this.shown.speed) * k; this.shown.steering += (s.steering - this.shown.steering) * (1 - Math.exp(-dt * 5));
        const sh = this.shown, bp = toThree(sh.x, sh.y);
        const bob = waveHeight(bp.x, bp.z, time, amp) * 0.9 + (reduced ? 0 : Math.sin(time * 2.1) * 0.018);
        const fx = Math.sin(sh.heading), fz = -Math.cos(sh.heading);
        const sl = waveSlope(bp.x, bp.z, time, amp);
        const pitch = Math.atan(sl.dx * fx + sl.dz * fz) * 0.9 - clamp(sh.speed, 0, 6) * 0.01;
        const roll = Math.atan(sl.dx * Math.cos(sh.heading) + sl.dz * Math.sin(sh.heading)) * 0.9 + sh.steering * sh.speed * 0.022;
        const b = this.boat;
        b.group.position.set(bp.x, bob + 0.05, bp.z);
        b.group.rotation.set(pitch, -sh.heading, roll, 'YXZ');
        b.wheel.children[0].rotation.z = -sh.steering * 2.4;
        b.prop.rotation.z += dt * (2 + sh.speed * 14);
        b.flag.rotation.y = Math.sin(time * 5) * 0.25;
        b.foamMaterial.uniforms.uTime.value = time;
        b.foamMaterial.uniforms.uPower.value = 0.45 + clamp(sh.speed / 4, 0, 1) * 0.45;
        (b.lantern.material as T.MeshStandardMaterial).emissiveIntensity = 0.9 + Math.sin(time * 1.3) * 0.2;
        // ---- marker geometry in three space
        const def = STAGES[s.stage], m = currentMarker(s), mp = toThree(m.x, m.y);
        const dist = distanceTo(sh, m), enc = s.phase !== 'sailing';
        // ---- camera rig: behind and above, no shake, never a sudden zoom
        const bearing = bearingTo(sh, m);
        // during an encounter the camera swings to the rear quarter so the boat never hides the fish
        const side = s.marker % 2 ? 1 : -1;
        const camTarget = enc ? sh.heading + side * 0.62 : sh.heading + clamp(wrapPi(bearing - sh.heading) * 0.38, -0.7, 0.7);
        if (!this.camReady) { this.camHeading = camTarget; this.camReady = true; }
        this.camHeading = wrapPi(this.camHeading + wrapPi(camTarget - this.camHeading) * (1 - Math.exp(-dt * (reduced ? 0.8 : 1.5))));
        const back = enc ? 15.5 : 13.5, up = enc ? 6.9 : 5.8;
        const cx = bp.x - Math.sin(this.camHeading) * back, cz = bp.z + Math.cos(this.camHeading) * back;
        const wantPos = new T.Vector3(cx, up + Math.max(0, waveHeight(cx, cz, time, amp)) * 0.4, cz);
        if (this.camera.position.lengthSq() === 0 || this.camera.position.distanceTo(wantPos) > 60) this.camera.position.copy(wantPos);
        this.camera.position.lerp(wantPos, 1 - Math.exp(-dt * (reduced ? 2.2 : 3.4)));
        const look = enc ? new T.Vector3(bp.x + (mp.x - bp.x) * 0.62, 1.4, bp.z + (mp.z - bp.z) * 0.62) : new T.Vector3(bp.x + Math.sin(this.camHeading) * 9.5, 0.9, bp.z - Math.cos(this.camHeading) * 9.5);
        this.lookAt.lerp(look, 1 - Math.exp(-dt * (reduced ? 2.5 : 4)));
        if (this.lookAt.lengthSq() === 0) this.lookAt.copy(look);
        this.camera.lookAt(this.lookAt);
        // ---- lights follow the action so the sun stays on screen
        const sd = sunDirection(this.env);
        this.sun.position.set(bp.x + sd.x * 220, sd.y * 220, bp.z + sd.z * 220);
        this.sun.target.position.copy(bp);
        this.sky.position.copy(this.camera.position);
        this.clouds.position.set(this.camera.position.x, 0, this.camera.position.z);
        this.clouds.rotation.y = time * 0.0025;
        this.horizon.position.set(this.camera.position.x, -2, this.camera.position.z);
        // ---- ocean glow around the active marker
        const encT = enc && this.phaseAt.encounter >= 0 ? time - this.phaseAt.encounter : 0;
        const celT = s.phase === 'celebrate' && this.phaseAt.celebrate >= 0 ? time - this.phaseAt.celebrate : 0;
        const markerGlow = s.phase === 'encounter' ? Math.min(1, encT / 1.2) * 0.85 : s.phase === 'celebrate' ? 1.4 * Math.exp(-celT * 0.5) : 0.22;
        this.glow += (markerGlow - this.glow) * (1 - Math.exp(-dt * 3));
        this.ocean.update(time, this.camera.position, { boat: { x: bp.x, z: bp.z, speed: sh.speed, heading: sh.heading }, marker: { x: mp.x, z: mp.z, radius: s.config.markerRadius, glow: this.glow } }, s.phase === 'celebrate' ? Math.max(0, 1 - celT / 1.5) : 0);
        this.hemi.intensity = this.env.hemiIntensity + (s.phase === 'celebrate' ? 0.35 * Math.max(0, Math.sin(Math.min(celT, 1.6) / 1.6 * Math.PI)) : 0);
        this.islandFoams.forEach(f => { f.uniforms.uTime.value = time; });
        this.gardenTime.value = time;
        if (this.quality !== 'low' || this.frames % 2 === 0) this.schools.update(time);
        this.gulls.update(time, this.camera.position);
        // ---- markers, route guidance, direction arrow
        const resolved = def.markers.map((_, i) => s.events.some(e => e.key === `${s.stage}:${i}`));
        this.markers.update(time, s.marker, resolved, reduced, cfg.highContrast, (x, z) => waveHeight(x, z, time, amp), s.phase !== 'sailing');
        const hold = this.holdSmooth += (s.hold - this.holdSmooth) * (1 - Math.exp(-dt * 8));
        const showHold = s.phase === 'encounter' && s.encounterMs > 1200;
        this.markers.setHold(hold, s.holding ? 0.5 + 0.5 * Math.sin(time * 9) : 0, showHold, new T.Vector3(mp.x, waveHeight(mp.x, mp.z, time, amp), mp.z));
        const guide = s.phase === 'sailing' && s.status !== 'ended' && s.status !== 'stage-complete' && (cfg.steeringAssist > 0.05 || cfg.autoDrive) && dist > cfg.markerRadius * 1.3;
        const dir = new T.Vector3(mp.x - bp.x, 0, mp.z - bp.z).normalize();
        const matrix = new T.Matrix4(), scale = new T.Vector3();
        for (let i = 0; i < 14; i++) {
            const d = 8 + i * 4.6, on = guide && d < dist - cfg.markerRadius * 0.9;
            const p = new T.Vector3(bp.x + dir.x * d, waveHeight(bp.x + dir.x * d, bp.z + dir.z * d, time, amp) + 0.5 + (reduced ? 0 : Math.sin(time * 2.2 + i * 0.7) * 0.12), bp.z + dir.z * d);
            matrix.compose(p, new T.Quaternion(), scale.setScalar(on ? 1 - i / 18 : 0.0001));
            this.route.setMatrixAt(i, matrix);
        }
        this.route.instanceMatrix.needsUpdate = true;
        const showArrow = s.phase === 'sailing' && s.status === 'running' && dist > cfg.markerRadius * 1.6;
        this.arrow.visible = showArrow;
        if (showArrow) {
            const heading = Math.atan2(dir.x, -dir.z);
            this.arrow.position.set(bp.x + dir.x * 8.5, bob + 1.5 + (reduced ? 0 : Math.sin(time * 2.4) * 0.15), bp.z + dir.z * 8.5);
            this.arrow.rotation.set(0.62, -heading, 0, 'YXZ');
        }
        // ---- fish encounter choreography
        this.directFish(dt, time, encT, celT, bp, mp, amp);
        // ---- wake and bow spray
        if (!reduced || this.frames % 3 === 0) {
            this.wakeCarry += dt * clamp(sh.speed, 0, 5) * 9;
            while (this.wakeCarry >= 1) {
                this.wakeCarry -= 1;
                const stern = new T.Vector3(bp.x - fx * 2.9 + (Math.random() - 0.5) * 1.2, 0.08, bp.z - fz * 2.9 + (Math.random() - 0.5) * 1.2);
                this.wake.emit({ pos: stern, vel: new T.Vector3(-fx * 0.4, 0, -fz * 0.4), spread: 0.35, count: 1, life: 2.6, size: [0.9, 3.6], color: ['#ffffff', '#b8f0f0'], alpha: 0.5, drag: 0.5, speed: 0.6 });
                if (sh.speed > 1.2 && Math.random() < 0.5) this.splash.emit({ pos: new T.Vector3(bp.x + fx * 2.6, 0.3, bp.z + fz * 2.6), vel: new T.Vector3(fx * 0.6, 1.4, fz * 0.6), spread: 1.4, count: 1, life: 0.8, size: [0.18, 0.05], color: ['#ffffff', '#d8f8ff'], alpha: 0.9, gravity: 6, speed: 1 });
            }
        }
        const vh = this.renderer.domElement.height / this.renderer.getPixelRatio();
        this.wake.update(dt, vh, this.camera.fov); this.splash.update(dt, vh, this.camera.fov); this.sparkle.update(dt, vh, this.camera.fov);
        this.renderer.render(this.scene, this.camera);
        this.frames++;
        this.statsFrames++;
        if (ms - this.statsAt >= 1000) {
            const info = this.renderer.info;
            this.onStats?.({ fps: Math.round(this.statsFrames * 1000 / (ms - (this.statsAt || ms - 1000))), drawCalls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, frames: this.frames });
            this.statsAt = ms;
            this.statsFrames = 0;
        }
    };
    private directFish(dt: number, time: number, encT: number, celT: number, bp: T.Vector3, mp: T.Vector3, amp: number) {
        const f = this.fish, s = this.state, reduced = s.config.reducedMotion;
        if (!f) return;
        const size = f.size;
        const surface = (x: number, z: number) => waveHeight(x, z, time, amp);
        const show = s.phase === 'encounter' && encT > 0.7 || s.phase === 'celebrate' && celT < 2.4;
        f.group.visible = show;
        if (!show) return;
        const rise = reduced ? clamp((encT - 0.7) / 2.2, 0, 1) : 1;
        const holdK = clamp(s.hold, 0, 1);
        const stand = new T.Vector3(bp.x - Math.sin(this.shown.heading) * -1 * 0, 0, bp.z);
        void stand;
        const radius = 4.2 - holdK * 1.9;
        const ang = (encT + 3.3) * 0.5;
        const swim = new T.Vector3(mp.x + Math.cos(ang) * radius, 0, mp.z + Math.sin(ang) * radius);
        const tangent = new T.Vector3(-Math.sin(ang), 0, Math.cos(ang));
        let pos = new T.Vector3(swim.x, surface(swim.x, swim.z) + 0.12 * size * 0.4 - (1 - rise) * 2.2, swim.z), dirV = tangent.clone(), pitch = 0, roll = 0, energy = 0.7, glow = 0.1 + holdK * 0.55;
        const leapOf = (t0: number, dur: number, height: number, spin: number, from: T.Vector3, to: T.Vector3) => {
            const u = (time - t0) / dur;
            if (u < 0 || u > 1) return false;
            const p = from.clone().lerp(to, u);
            pos = new T.Vector3(p.x, surface(p.x, p.z) - 0.15 + height * 4 * u * (1 - u), p.z);
            dirV = to.clone().sub(from).setY(0).normalize();
            pitch = Math.atan2(height * 4 * (1 - 2 * u), dur * 2.2) * 0.9;
            roll = spin * u * Math.PI * 2;
            energy = 1.4;
            return true;
        };
        const emitSplash = (p: T.Vector3, n: number) => { if (reduced) return; this.splash.emit({ pos: new T.Vector3(p.x, 0.15, p.z), vel: new T.Vector3(0, 3.2, 0), spread: 2.2, count: n, life: 1.1, size: [0.34, 0.08], color: ['#ffffff', '#cdf6ff'], alpha: 0.95, gravity: 9, speed: 1 }); };
        if (s.phase === 'encounter') {
            if (!reduced) {
                const t0 = this.phaseAt.encounter + 0.7, dur = 1.5;
                const from = new T.Vector3(mp.x - tangent.x * 1.5, 0, mp.z - tangent.z * 1.5), to = swim.clone();
                if (leapOf(t0, dur, 1.35 * size * 0.62, 0, from, to)) {
                    if (!this.flags.appear) { this.flags.appear = true; emitSplash(from, 26); this.wake.emit({ pos: new T.Vector3(from.x, 0.1, from.z), count: 6, life: 2, size: [1, 5], color: ['#ffffff', '#bff3ff'], alpha: 0.5, spread: 2 }); }
                } else if (time > t0 + dur) {
                    if (!this.flags.land) { this.flags.land = true; emitSplash(swim, 20); }
                    if (this.lastLeap === 0) this.lastLeap = time + 2.5;
                    const lt0 = this.lastLeap;
                    const lFrom = swim.clone(), lTo = new T.Vector3(mp.x + Math.cos(ang + 0.5) * radius, 0, mp.z + Math.sin(ang + 0.5) * radius);
                    if (time >= lt0 && !leapOf(lt0, 1.1, 0.7 * size * 0.55, 0, lFrom, lTo) && time > lt0 + 1.1) { emitSplash(lTo, 12); this.lastLeap = time + 4.5 + (Math.sin(lt0) + 1) * 1.2; }
                    else if (time >= lt0 && time < lt0 + 1.1 && this.flags.ripple !== lt0) { this.flags.ripple = lt0; emitSplash(lFrom, 8); }
                }
            }
            if (this.fish) f.glow(glow);
        } else {
            const t0 = this.phaseAt.celebrate;
            const target = new T.Vector3(bp.x + Math.sin(this.shown.heading) * 3.4, 0, bp.z - Math.cos(this.shown.heading) * 3.4);
            const from = swim.clone();
            if (!reduced && time < t0 + 1.7) {
                leapOf(t0, 1.7, 2.1 * size * 0.62, 1, from, target);
                glow = 1.25;
            } else if (!reduced) {
                const u = clamp((time - t0 - 1.7) / 0.7, 0, 1);
                pos = new T.Vector3(target.x, surface(target.x, target.z) - 0.1 - u * 3, target.z);
                dirV = target.clone().sub(from).setY(0).normalize();
                glow = 1 - u * 0.6;
            } else {
                const u = clamp(celT / 2.2, 0, 1);
                pos = new T.Vector3(swim.x, surface(swim.x, swim.z) + 0.1 + Math.sin(u * Math.PI) * 0.7, swim.z);
                glow = 1.0 * (1 - u * 0.7);
            }
            if (!this.flags.burst) {
                this.flags.burst = true;
                const at = new T.Vector3(target.x, 1.8, target.z);
                this.sparkle.emit({ pos: at, spread: reduced ? 2 : 5, count: reduced ? 40 : 130, life: 2.2, size: [0.5, 0.05], color: ['#fff3c0', '#ffbf40'], alpha: 1, gravity: reduced ? 0.4 : 1.4, speed: 1.2 });
                this.sparkle.emit({ pos: new T.Vector3(mp.x, 0.4, mp.z), spread: 3, count: reduced ? 20 : 60, life: 2, size: [0.4, 0.05], color: ['#c8fff0', '#5ff0d0'], alpha: 0.9, gravity: -0.5, speed: 1 });
                if (!reduced) emitSplash(target, 36);
            }
            f.glow(glow);
        }
        f.group.scale.setScalar(size * 1.7);
        f.group.position.copy(pos);
        f.group.rotation.set(-pitch, Math.atan2(dirV.x, dirV.z), roll, 'YXZ');
        f.tick(time, energy);
        this.lastFishPos.copy(pos);
        void dt;
    }
    dispose() {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.observer.disconnect();
        this.clearWorld();
        this.splash.dispose(); this.wake.dispose(); this.sparkle.dispose();
        disposeObject(this.arrow);
        this.scene.environment = null;
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.renderer.domElement.remove();
    }
}
export const speciesName = (id: SpeciesId) => SPECIES[id].nameAr;
