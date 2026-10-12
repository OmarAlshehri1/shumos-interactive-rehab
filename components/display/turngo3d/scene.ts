import * as THREE from 'three';
import { CONE_R, CONE_SAFE, dist, routePoints, sampleSpline, type Pt } from '@/lib/turngo3d/courses';
import { guideOf, cpPos, type Phase } from '@/lib/turngo3d/captions';
import { activeCp, countdownLeft, schedule, stat, type State } from '@/lib/turngo3d/engine';
import { buildEnvironment, themeBackground, themeExposure, type Env, type Quality } from './themes';
import { ParticlePool } from './particles';
import { bigArrowTexture, canvasTexture, checkerTexture, chevronTexture, footprintsTexture, glowTexture, numberTexture, ringTexture, stopPadTexture, trafficTexture } from './textures';
import { coneParts, Disposer, glowSprite, ribbonGeometry, starGeometry, W3 } from './kit';

export interface SceneOptions {
  quality: Quality;
  reducedEffects: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  coneStyle: 'cone' | 'ring';
}

export interface DrawInput {
  state: State;
  connected: boolean;
  /** Visual running clock (ms): the Display's own extrapolation of the authoritative clock. */
  clock: number;
}

export interface SceneStats { calls: number; triangles: number; geometries: number; textures: number; frameMs: number; envBuilds: number; particles: number }

const TILT = (10 * Math.PI) / 180;
const SEG = 14;
const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const PHASE_COLOR: Record<Phase, number> = { ready: 0x7ff4ff, countdown: 0x4aa8ff, go: 0x3ddc84, wait: 0xffb020, hold: 0xff5a5f, complete: 0xffd23f, ended: 0xffd23f };
const CONE_COLORS = [0xff6a1a, 0xe63946, 0x2f80ed, 0xffc233, 0x2fbf71];

interface StarObj {
  group: THREE.Group;
  star: THREE.Mesh;
  halo: THREE.Sprite;
  rays: THREE.Mesh;
  pad: THREE.Mesh | null;
  beads: THREE.InstancedMesh | null;
  stamp: THREE.Mesh;
  pos: THREE.Vector3;
  collectAt: number;
  returnAt: number;
  prev: string;
}

export function createScene(canvas: HTMLCanvasElement, opts: SceneOptions) {
  const lq = opts.quality === 'low' || opts.reducedEffects;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.quality !== 'low', powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.quality === 'high' ? 2 : opts.quality === 'balanced' ? 1.5 : 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !lq;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 1, 80);
  const camDist = 36;
  camera.position.set(0, camDist * Math.cos(TILT), camDist * Math.sin(TILT));
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  let width = 16, height = 9, aspect = 16 / 9, pxPerUnit = 100;

  const pool = new ParticlePool(lq ? 160 : 520);
  scene.add(pool.points);

  // shared course materials/geometries (disposed with the scene)
  const shared = new Disposer();
  const starGeo = shared.add(starGeometry(0.6, 0.28, 0.16));
  const smallStarGeo = shared.add(starGeometry(0.3, 0.14, 0.08));
  const gold = shared.add(new THREE.MeshStandardMaterial({ color: 0xffc42e, metalness: 0.55, roughness: 0.28, emissive: 0xff9a00, emissiveIntensity: 0.6 }));
  const goldDim = shared.add(new THREE.MeshStandardMaterial({ color: 0xe9b74a, metalness: 0.4, roughness: 0.4, emissive: 0xb86e00, emissiveIntensity: 0.28 }));
  const skippedMat = shared.add(new THREE.MeshStandardMaterial({ color: 0x9aa4b4, metalness: 0.1, roughness: 0.6, transparent: true, opacity: 0.4 }));
  for (const m of [gold, goldDim, skippedMat]) m.userData.keep = true;
  const cp = coneParts();
  const coneBody = shared.add(cp.body), coneBand = shared.add(cp.band), coneBase = shared.add(cp.base);
  const coneMats = CONE_COLORS.map((c) => shared.add(new THREE.MeshStandardMaterial({ color: c, roughness: 0.34, metalness: 0.02, emissive: c, emissiveIntensity: 0.12 })));
  const bandMat = shared.add(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x666666, emissiveIntensity: 0.4 }));
  const baseMat = shared.add(new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.7 }));
  coneMats.forEach((m) => (m.userData.keep = true)); bandMat.userData.keep = true; baseMat.userData.keep = true;
  const planeGeo = shared.add(new THREE.PlaneGeometry(1, 1));
  planeGeo.rotateX(-Math.PI / 2);
  const rayTex = canvasTexture('rays', 256, 256, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 14; i++) { ctx.rotate((Math.PI * 2) / 14); const g = ctx.createLinearGradient(0, 0, 0, -h / 2); g.addColorStop(0, 'rgba(255,230,140,0.9)'); g.addColorStop(1, 'rgba(255,230,140,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(0, -h / 2); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill(); }
  });
  const cautionTex = canvasTexture('caution', 128, 32, (ctx, w, h) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#e63946'; for (let x = -h; x < w + h; x += 32) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 16, h); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, 0); ctx.closePath(); ctx.fill(); } }, { repeat: true });

  const flat = (tex: THREE.Texture | null, w: number, h: number, opts2: { color?: number; opacity?: number; additive?: boolean; y?: number; order?: number } = {}) => {
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: opts2.color ?? 0xffffff, transparent: true, opacity: opts2.opacity ?? 1, depthWrite: false, blending: opts2.additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(planeGeo, mat);
    m.scale.set(w, 1, h);
    m.position.y = opts2.y ?? 0.03;
    m.renderOrder = opts2.order ?? 2;
    return m;
  };

  let env: Env | null = null;
  let envKey = '';
  let envBuilds = 0;
  let envBuiltAt = -1e9;
  let course: ReturnType<typeof buildCourse> | null = null;
  let courseKey = '';
  const tmpV = new THREE.Vector3();

  function geomKey(s: State): string {
    const sch = schedule(s);
    return JSON.stringify([sch.stage.theme, sch.plan.start.map((v) => Math.round(v * 20)), sch.plan.cones.map((p) => p.map((v) => Math.round(v * 20))), sch.plan.cps.map((p) => p.map((v) => Math.round(v * 20))), Math.round(sch.plan.width * 10)]);
  }

  function buildCourse(s: State, e: Env) {
    const d = new Disposer();
    const g = new THREE.Group();
    const sch = schedule(s);
    const plan = sch.plan;
    e.pathMaterial.userData.keep = true;
    const route = routePoints(plan, s.route);
    const spline = sampleSpline(route, SEG);
    const width = plan.width * (opts.highContrast ? 1.08 : 1);

    // --- corridor ---
    const outline = new THREE.Mesh(d.add(ribbonGeometry(spline, width + (opts.highContrast ? 0.5 : 0.34), 0.012, 2)), d.add(new THREE.MeshBasicMaterial({ color: opts.highContrast ? 0xffffff : e.outlineColor, transparent: true, opacity: opts.highContrast ? 0.95 : 0.6, depthWrite: false })));
    outline.renderOrder = 1;
    const ribbonGeo = d.add(ribbonGeometry(spline, width, 0.02, e.pathUv.v, e.pathUv.u));
    const ribbon = new THREE.Mesh(ribbonGeo, e.pathMaterial);
    ribbon.receiveShadow = !lq;
    ribbon.renderOrder = 2;
    g.add(outline, ribbon);
    let colorSig = '';
    const paintRibbon = (res: string[], active: number) => {
      const sig = res.join(',') + '|' + active;
      if (sig === colorSig) return;
      colorSig = sig;
      const col = ribbonGeo.getAttribute('color') as THREE.BufferAttribute;
      const n = spline.length;
      for (let i = 0; i < n; i++) {
        const k = Math.min(Math.floor(i / SEG), res.length - 1);
        const r = res[k];
        let c: [number, number, number] = [0.74, 0.77, 0.84];
        if (k === active) c = [1.04, 1.04, 1.02];
        else if (r === 'confirmed' || r === 'assisted') c = [1.12, 1.02, 0.62];
        else if (r === 'skipped') c = [0.62, 0.62, 0.66];
        col.setXYZ(i * 2, ...c); col.setXYZ(i * 2 + 1, ...c);
      }
      col.needsUpdate = true;
    };

    // active-segment glow (rebuilt on demand)
    const glowMat = d.add(new THREE.MeshBasicMaterial({ color: 0x4fdcff, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }));
    const activeGlow = new THREE.Mesh(new THREE.BufferGeometry(), glowMat);
    activeGlow.renderOrder = 3;
    g.add(activeGlow);
    let glowIdx = -2;
    const setGlow = (k: number) => {
      if (k === glowIdx) return;
      glowIdx = k;
      activeGlow.geometry.dispose();
      if (k < 0) { activeGlow.geometry = new THREE.BufferGeometry(); return; }
      const slice = spline.slice(k * SEG, Math.min(spline.length, (k + 1) * SEG + 1));
      activeGlow.geometry = slice.length > 1 ? ribbonGeometry(slice, width + 0.55, 0.026, 8) : new THREE.BufferGeometry();
    };

    // --- start marker ---
    const startG = new THREE.Group();
    startG.position.copy(W3(plan.start));
    const startRing = flat(ringTexture(), 2.6, 2.6, { color: 0x3ddc84, additive: false, y: 0.04, order: 4 });
    const startDisc = flat(glowTexture(), 2.8, 2.8, { color: 0x3ddc84, additive: true, opacity: 0.4, y: 0.035, order: 3 });
    const feet = flat(footprintsTexture(), 1.2, 1.2, { y: 0.045, order: 5 });
    startG.add(startDisc, startRing, feet);
    g.add(startG);
    const h0 = Math.atan2(route[1][1] - route[0][1], route[1][0] - route[0][0]);
    feet.rotation.y = h0 - Math.PI / 2;
    // big "walk this way" arrow
    const bigArrow = flat(bigArrowTexture(), 0.85, 1.3, { y: 0.06, order: 6 });
    g.add(bigArrow);

    // --- cones ---
    const coneG: { group: THREE.Group; ring: THREE.Mesh; safe: THREE.Mesh; num: THREE.Sprite }[] = [];
    plan.cones.forEach((p, i) => {
      const grp = new THREE.Group();
      grp.position.copy(W3(p));
      const m = coneMats[i % coneMats.length];
      if (opts.coneStyle === 'cone') {
        const b = new THREE.Mesh(coneBase, baseMat), body = new THREE.Mesh(coneBody, m), band = new THREE.Mesh(coneBand, bandMat);
        for (const mesh of [b, body, band]) { mesh.castShadow = !lq; mesh.receiveShadow = !lq; grp.add(mesh); }
        grp.rotation.y = i * 0.7;
      }
      const ring = flat(ringTexture(), CONE_R * 7, CONE_R * 7, { color: 0xffc233, additive: false, y: 0.045, order: 4, opacity: 0.95 });
      const safe = flat(ringTexture(), CONE_SAFE * 2.1, CONE_SAFE * 2.1, { color: 0xffffff, y: 0.04, order: 3, opacity: 0.35 });
      const nm = new THREE.SpriteMaterial({ map: numberTexture(i + 1), transparent: true, depthTest: false, depthWrite: false });
      const num = new THREE.Sprite(d.add(nm)); num.scale.set(0.5, 0.5, 1); num.position.set(0, 1.05, 0.55); num.renderOrder = 60;
      grp.add(ring, safe, num);
      d.add(ring.material as THREE.Material); d.add(safe.material as THREE.Material);
      g.add(grp);
      coneG.push({ group: grp, ring, safe, num });
    });

    // --- stars ---
    const goldHalo = glowTexture();
    const stars: StarObj[] = plan.cps.map((p, i) => {
      const grp = new THREE.Group();
      const star = new THREE.Mesh(starGeo, gold);
      star.castShadow = !lq;
      const halo = glowSprite(goldHalo, 0xffd45a, 2.6, 0.7);
      halo.position.y = 0.1;
      d.add(halo.material);
      const rays = flat(rayTex, 3.2, 3.2, { additive: true, opacity: 0.45, y: 0.05, order: 3 });
      d.add(rays.material as THREE.Material);
      let pad: THREE.Mesh | null = null, beads: THREE.InstancedMesh | null = null;
      if (sch.kinds[i] === 'stop') {
        pad = flat(stopPadTexture(), 2.35, 2.35, { y: 0.04, order: 4 });
        d.add(pad.material as THREE.Material);
        beads = new THREE.InstancedMesh(d.add(new THREE.SphereGeometry(0.075, 8, 6)), d.add(new THREE.MeshBasicMaterial({ color: 0xffffff })), 28);
        const m4 = new THREE.Matrix4();
        for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; m4.setPosition(Math.sin(a) * 1.42, 0.1, -Math.cos(a) * 1.42); beads.setMatrixAt(k, m4); beads.setColorAt(k, new THREE.Color(0x553040)); }
        beads.frustumCulled = false; beads.visible = false;
        grp.add(beads);
      }
      const stamp = new THREE.Mesh(smallStarGeo, goldDim);
      stamp.position.y = 0.06; stamp.visible = false;
      grp.add(halo, rays, star, stamp);
      if (pad) grp.add(pad);
      grp.position.copy(W3(p));
      g.add(grp);
      return { group: grp, star, halo, rays, pad, beads, stamp, pos: W3(p), collectAt: -1e9, returnAt: -1e9, prev: 'pending' };
    });

    // finish strip + flags
    const last = plan.cps.length - 1;
    const fp = plan.cps[last], fa = plan.cps[Math.max(0, last - 1)] ?? plan.start;
    const fh = Math.atan2(fp[1] - fa[1], fp[0] - fa[0]);
    const finish = new THREE.Group();
    const stripTex = checkerTexture().clone();
    stripTex.needsUpdate = true; stripTex.repeat.set(Math.max(1, (width + 0.7) / 2.2), 1);
    d.add(stripTex);
    const strip = flat(stripTex, width + 0.7, 0.55, { y: 0.05, order: 4 });
    strip.rotation.y = fh - Math.PI / 2;
    strip.position.set(-Math.cos(fh) * 1.05, 0.05, Math.sin(fh) * 1.05);
    finish.add(strip);
    for (const sgn of [-1, 1]) {
      const post = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.05, 0.06, 1.9, 8)), d.add(new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.5 })));
      const nx = -Math.sin(fh) * sgn, ny = Math.cos(fh) * sgn, off = width / 2 + 0.45;
      post.position.set(nx * off - Math.cos(fh) * 1.05, 0.95, -(ny * off) + Math.sin(fh) * 1.05);
      post.castShadow = !lq;
      const flag = new THREE.Mesh(d.add(new THREE.PlaneGeometry(0.55, 0.38)), d.add(new THREE.MeshStandardMaterial({ color: sgn > 0 ? 0xff5d8f : 0x3ec6ff, side: THREE.DoubleSide, roughness: 0.6 })));
      flag.position.set(0.3, 0.7, 0);
      post.add(flag);
      finish.add(post);
    }
    finish.position.copy(W3(fp));
    g.add(finish);

    // --- chevrons ---
    const chevCount = 16;
    const chevMat = d.add(new THREE.MeshBasicMaterial({ map: chevronTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const chev = new THREE.InstancedMesh(planeGeo, chevMat, chevCount);
    chev.frustumCulled = false; chev.renderOrder = 7; chev.count = 0;
    g.add(chev);
    // "then turn" hint at the target
    const nextMat = d.add(new THREE.MeshBasicMaterial({ map: chevronTexture(), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const nextHint = new THREE.InstancedMesh(planeGeo, nextMat, 2);
    nextHint.frustumCulled = false; nextHint.renderOrder = 7; nextHint.count = 0;
    g.add(nextHint);

    // --- beacon + cue pulse ---
    const beaconRing = flat(ringTexture(), 2.2, 2.2, { color: 0x3ddc84, y: 0.07, order: 8 });
    const beaconGlow = flat(glowTexture(), 3.0, 3.0, { color: 0x3ddc84, additive: true, opacity: 0.5, y: 0.065, order: 7 });
    const pulse = flat(ringTexture(), 2, 2, { color: 0xffb020, y: 0.075, order: 9, opacity: 0 });
    g.add(beaconGlow, beaconRing, pulse);
    d.add(beaconRing.material as THREE.Material); d.add(beaconGlow.material as THREE.Material); d.add(pulse.material as THREE.Material);

    // --- traffic light decal ---
    const trafficMat = d.add(new THREE.MeshBasicMaterial({ map: trafficTexture('green'), transparent: true, depthWrite: false, toneMapped: false }));
    const traffic = new THREE.Mesh(planeGeo, trafficMat);
    traffic.scale.set(0.62, 1, 1.45); traffic.position.y = 0.08; traffic.renderOrder = 10; traffic.visible = false;
    g.add(traffic);

    // --- friendly character (waits beside the path) ---
    const buddy = new THREE.Group();
    {
      const fur = d.add(new THREE.MeshStandardMaterial({ color: 0xf08a24, roughness: 0.7 })), cream = d.add(new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.8 })), dark = d.add(new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.5 }));
      const sph = (r: number, x: number, y: number, z: number, m: THREE.Material, sx = 1, sy = 1, sz = 1) => { const mm = new THREE.Mesh(d.add(new THREE.SphereGeometry(r, 16, 12)), m); mm.position.set(x, y, z); mm.scale.set(sx, sy, sz); mm.castShadow = !lq; buddy.add(mm); return mm; };
      sph(0.38, 0, 0.42, 0, fur, 1, 1.05, 1); sph(0.26, 0, 0.38, 0.22, cream, 1, 1, 0.7);
      sph(0.3, 0, 0.98, 0, fur); sph(0.14, 0, 0.9, 0.24, cream, 1.2, 0.9, 0.9);
      sph(0.045, -0.1, 1.02, 0.26, dark); sph(0.045, 0.1, 1.02, 0.26, dark); sph(0.05, 0, 0.94, 0.33, dark);
      for (const sgn of [-1, 1]) { const ear = new THREE.Mesh(d.add(new THREE.ConeGeometry(0.1, 0.26, 10)), fur); ear.position.set(sgn * 0.17, 1.3, -0.02); ear.rotation.z = -sgn * 0.25; buddy.add(ear); }
      const tail = sph(0.2, 0, 0.3, -0.42, fur, 0.8, 0.8, 1.6); tail.rotation.x = -0.5;
      const arm = new THREE.Group(); const armMesh = new THREE.Mesh(d.add(new THREE.CapsuleGeometry(0.07, 0.34, 4, 8)), fur); armMesh.position.y = 0.2; arm.add(armMesh); arm.position.set(0.36, 0.66, 0.1); arm.userData.arm = true; buddy.add(arm);
      const glove = new THREE.Mesh(d.add(new THREE.CircleGeometry(0.17, 20)), d.add(new THREE.MeshBasicMaterial({ color: 0xe63946, side: THREE.DoubleSide }))); glove.position.set(0, 0.46, 0.09); arm.add(glove);
      buddy.visible = false;
      g.add(buddy);
    }

    // --- gate + closed-route barrier ---
    const gate = new THREE.Group();
    {
      const wood = d.add(new THREE.MeshStandardMaterial({ color: 0xb8793c, roughness: 0.7 }));
      for (const sgn of [-1, 1]) { const p = new THREE.Mesh(d.add(new THREE.BoxGeometry(0.16, 0.95, 0.16)), wood); p.position.set(sgn * (width / 2 + 0.18), 0.48, 0); p.castShadow = !lq; gate.add(p); }
      const barPivot = new THREE.Group(); barPivot.position.set(-(width / 2 + 0.18), 0.7, 0); barPivot.userData.bar = true;
      const bar = new THREE.Mesh(d.add(new THREE.BoxGeometry(width + 0.36, 0.1, 0.1)), d.add(new THREE.MeshStandardMaterial({ color: 0xff5d5d, roughness: 0.5 })));
      bar.position.x = (width + 0.36) / 2; bar.castShadow = !lq; barPivot.add(bar); gate.add(barPivot);
      gate.visible = false; g.add(gate);
    }
    const tapeMat = d.add(new THREE.MeshBasicMaterial({ map: cautionTex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    const tape = new THREE.Mesh(new THREE.BufferGeometry(), tapeMat);
    tape.renderOrder = 6; tape.visible = false; g.add(tape);
    const closedX = flat(ringTexture(), 1.5, 1.5, { color: 0xff5a5f, y: 0.08, order: 9, opacity: 0.9 }); closedX.visible = false; d.add(closedX.material as THREE.Material); g.add(closedX);
    let tapeFor = '';

    return { group: g, d, plan, route, spline, width, paintRibbon, setGlow, startG, bigArrow, coneG, stars, chev, nextHint, beaconRing, beaconGlow, pulse, traffic, trafficMat, buddy, gate, tape, tapeMat, closedX, finish, startRing, startDisc, setTape(key: string, geo: THREE.BufferGeometry | null) { if (key === tapeFor) { geo?.dispose(); return; } tapeFor = key; tape.geometry.dispose(); tape.geometry = geo ?? new THREE.BufferGeometry(); } };
  }

  function disposeCourse() {
    if (!course) return;
    scene.remove(course.group);
    course.group.traverse((o) => {
      const m = o as THREE.Mesh & { isInstancedMesh?: boolean };
      if (m.isInstancedMesh) (m as unknown as THREE.InstancedMesh).dispose();
      const mat = (m as { material?: THREE.Material | THREE.Material[] }).material;
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) if (!x.userData.keep) x.dispose();
    });
    course.d.dispose();
    course = null;
  }

  function sync(s: State, t: number) {
    const sch = schedule(s);
    const gk = geomKey(s);
    const ek = `${gk}|${opts.quality}|${lq}|${opts.highContrast}`;
    if (ek !== envKey && t * 1000 - envBuiltAt > 250) {
      envKey = ek; envBuiltAt = t * 1000; envBuilds++;
      if (env) { scene.remove(env.group); env.dispose(); }
      const route0 = routePoints(sch.plan, {});
      env = buildEnvironment({ theme: sch.stage.theme, plan: sch.plan, route: sampleSpline(route0, 6), width: sch.plan.width, quality: opts.quality, reduced: opts.reducedEffects, highContrast: opts.highContrast, seed: s.seed });
      scene.add(env.group);
      scene.background = new THREE.Color(themeBackground(sch.stage.theme));
      renderer.toneMappingExposure = themeExposure(sch.stage.theme);
      disposeCourse(); courseKey = '';
    }
    const ck = `${ek}|${JSON.stringify(s.route)}`;
    if (env && ck !== courseKey) {
      courseKey = ck;
      disposeCourse();
      course = buildCourse(s, env);
      scene.add(course.group);
    }
  }

  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  /** Polyline helpers for the active segment. */
  function segmentPoints(c: NonNullable<typeof course>, k: number): Pt[] {
    return c.spline.slice(k * SEG, Math.min(c.spline.length, (k + 1) * SEG + 1));
  }
  function along(pts: Pt[], s: number): { p: Pt; a: number } {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = dist(pts[i - 1], pts[i]);
      if (acc + l >= s || i === pts.length - 1) {
        const k = l > 0 ? clamp01((s - acc) / l) : 0;
        return { p: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k], a: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) };
      }
      acc += l;
    }
    return { p: pts[0], a: 0 };
  }
  const lengthOf = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
  const m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const place = (mesh: THREE.InstancedMesh, i: number, p: Pt, ang: number, size: number, y = 0.07) => {
    // plane lies on the floor; its local -Z ("up" of the texture) must point along the heading
    q.setFromAxisAngle(up, ang - Math.PI / 2);
    ps.set(p[0], y, -p[1]); sc.set(size, 1, size);
    m4.compose(ps, q, sc); mesh.setMatrixAt(i, m4);
  };

  let prevStatus = '';
  let prevStage = -1;
  let lastCueN = -1, cueAt = -1e9, lastRun = -1;
  let frameMs = 0;

  function draw(input: DrawInput, dt: number, t: number) {
    const t0 = performance.now();
    const s = input.state;
    sync(s, t);
    if (!env || !course) { renderer.render(scene, camera); return; }
    const c = course;
    const sch = schedule(s);
    const st = stat(s);
    const res = st.res.length === c.plan.cps.length ? st.res : c.plan.cps.map(() => 'pending' as const);
    const active = s.status === 'running' || s.status === 'paused' ? res.findIndex((r) => r === 'pending') : -1;
    const g = guideOf(s);
    const visualPhase: Phase = !input.connected && s.status === 'running' ? 'wait' : g.phase;
    const playing = s.status === 'running' && input.connected;
    const motion = !opts.reducedMotion;
    const fxScale = lq ? 0.45 : 1;

    // new stage / run: forget one-shot animation history
    if (s.stage !== prevStage || s.run !== lastRun) { prevStage = s.stage; lastRun = s.run; c.stars.forEach((o, i) => { o.prev = res[i]; o.collectAt = -1e9; o.returnAt = -1e9; }); lastCueN = s.cue?.n ?? -1; cueAt = -1e9; }

    env.update(t, dt);
    c.paintRibbon(res, s.status === 'ready' ? -1 : active);
    c.setGlow(s.status === 'running' || s.status === 'paused' ? active : -1);

    // --- phase colour / beacon at the origin ---
    const col = new THREE.Color(PHASE_COLOR[visualPhase]);
    const originP = g.origin;
    const showGuide = s.status !== 'ended' && s.status !== 'stage-complete';
    const pulseK = 0.5 + 0.5 * Math.sin(t * (visualPhase === 'hold' ? 5 : 3));
    c.beaconRing.position.copy(W3(originP, 0.07)); c.beaconGlow.position.copy(W3(originP, 0.065));
    (c.beaconRing.material as THREE.MeshBasicMaterial).color.copy(col); (c.beaconGlow.material as THREE.MeshBasicMaterial).color.copy(col);
    const bs = (visualPhase === 'hold' ? 2.4 : 2.1) + (motion ? pulseK * 0.35 : 0);
    c.beaconRing.scale.set(bs, 1, bs); c.beaconGlow.scale.set(bs * 1.5, 1, bs * 1.5);
    c.beaconRing.visible = c.beaconGlow.visible = showGuide && s.status !== 'ready';
    (c.beaconGlow.material as THREE.MeshBasicMaterial).opacity = 0.3 + pulseK * 0.25;
    // start marker colour: ready = invitation, otherwise calm
    (c.startRing.material as THREE.MeshBasicMaterial).color.setHex(s.status === 'ready' ? 0x7ff4ff : 0x3ddc84);
    (c.startDisc.material as THREE.MeshBasicMaterial).color.setHex(s.status === 'ready' ? 0x7ff4ff : 0x3ddc84);
    const sp = 1 + (motion ? Math.sin(t * 2.2) * 0.04 : 0);
    c.startRing.scale.set(2.6 * sp, 1, 2.6 * sp);

    // --- big arrow at the origin pointing along the segment ---
    const segK = active >= 0 ? active : 0;
    const segPts = segmentPoints(c, segK);
    const segLen = lengthOf(segPts);
    const dir0 = along(segPts, Math.min(0.9, segLen * 0.2)).a;
    const arrowOn = (visualPhase === 'go' || visualPhase === 'countdown' || s.status === 'ready') && s.status !== 'stage-complete' && s.status !== 'ended';
    c.bigArrow.visible = arrowOn;
    if (arrowOn) {
      const o = s.status === 'ready' || active < 0 ? c.plan.start : originP;
      const a = s.status === 'ready' ? Math.atan2(c.route[1][1] - c.route[0][1], c.route[1][0] - c.route[0][0]) : dir0;
      const off = 1.35 + (motion ? Math.sin(t * 3) * 0.1 : 0);
      c.bigArrow.position.set(o[0] + Math.cos(a) * off, 0.06, -(o[1] + Math.sin(a) * off));
      c.bigArrow.rotation.y = a - Math.PI / 2;
      (c.bigArrow.material as THREE.MeshBasicMaterial).opacity = visualPhase === 'countdown' ? 0.55 : 0.95;
    }

    // --- flowing chevrons on the active segment ---
    let nChev = 0;
    if (visualPhase === 'go' && active >= 0 && segLen > 2.2) {
      const gap = 0.95, margin0 = 1.2, margin1 = 1.0;
      const flow = motion && playing ? (t * 0.7) % gap : 0;
      for (let s0 = margin0 + flow; s0 < segLen - margin1 && nChev < 16; s0 += gap) {
        const { p, a } = along(segPts, s0);
        const k = ease(Math.min(1, (s0 - margin0) / 0.9, (segLen - margin1 - s0) / 0.9 + 0.2));
        place(c.chev, nChev++, p, a, 0.62 * (0.35 + 0.65 * k) * (opts.highContrast ? 1.2 : 1));
      }
    }
    c.chev.count = nChev; c.chev.instanceMatrix.needsUpdate = true;

    // --- next-turn hint beyond the active star ---
    let nHint = 0;
    if ((visualPhase === 'go' || visualPhase === 'countdown') && active >= 0 && active < c.plan.cps.length - 1 && g.next && g.next !== 'straight') {
      const nextPts = segmentPoints(c, active + 1);
      for (let i = 0; i < 2; i++) { const { p, a } = along(nextPts, 0.85 + i * 0.7); place(c.nextHint, nHint++, p, a, 0.5, 0.065); }
    }
    c.nextHint.count = nHint; c.nextHint.instanceMatrix.needsUpdate = true;

    // --- stars ---
    const waitKind = s.wait?.kind;
    const waitT = s.wait ? clamp01(1 - (s.wait.until - input.clock) / Math.max(1, s.config.eventMs)) : 1;
    c.stars.forEach((o, i) => {
      const r = res[i];
      const target = W3(cpPos(s, i));
      // a star moved by a route event glides to its new spot (never jumps)
      const moving = s.wait && (waitKind === 'switch' || waitKind === 'block' || waitKind === 'altStar') && i === s.wait.after + 1;
      if (moving) { const from = W3(c.plan.cps[i]); o.group.position.lerpVectors(from, target, ease(clamp01(waitT * 1.7))); }
      else o.group.position.lerp(target, 1 - Math.exp(-dt * 9));
      const prev = o.prev;
      if (prev !== r) {
        if (r === 'confirmed' || r === 'assisted') { o.collectAt = t; pool.burst(o.group.position.x, o.group.position.z, env!.fx.kind, env!.fx.colors, fxScale); }
        else if (r === 'pending' && (prev === 'confirmed' || prev === 'assisted')) o.returnAt = t;
        o.prev = r;
      }
      const isActive = i === active;
      const collected = r === 'confirmed' || r === 'assisted';
      const since = t - o.collectAt;
      const showStar = !collected || since < 1.0;
      o.star.visible = showStar && r !== 'skipped' ? true : r === 'skipped';
      o.star.material = r === 'skipped' ? skippedMat : isActive || s.status === 'ready' ? gold : goldDim;
      const bob = motion ? Math.sin(t * 2 + i) * 0.06 : 0;
      let scl = isActive ? 1.28 + (motion ? Math.sin(t * 3.2) * 0.07 : 0) : s.status === 'ready' ? 1 : 0.78;
      let y = 0.42 + bob;
      if (collected && since < 1.0) { const k = since / 1.0; y += ease(k) * 1.8; scl *= 1 + Math.sin(k * Math.PI) * 0.5 - ease(k) * 1.0; o.star.rotation.y += dt * 14; }
      else if (!collected) { o.star.rotation.y += dt * (motion ? (isActive ? 1.5 : 0.5) : 0); const back = t - o.returnAt; if (back < 0.8) scl *= 0.4 + 0.6 * ease(back / 0.8); }
      if (o.pad && isActive && !collected) scl *= 0.82; // leave the octagon and its hand visible around the star
      const holdingHere = !!s.hold && s.hold.cp === i;
      if (holdingHere) o.star.visible = false; // during the hold the pad and its progress ring are the focus
      o.star.position.y = y; o.star.scale.setScalar(Math.max(0.01, scl));
      o.halo.visible = (isActive || (s.status === 'ready' && !collected)) && showStar; (o.halo.material as THREE.SpriteMaterial).opacity = 0.55 + (motion ? Math.sin(t * 3) * 0.2 : 0);
      o.halo.scale.setScalar(isActive ? 3.2 : 2.0);
      o.rays.visible = isActive; o.rays.rotation.y = motion ? t * 0.25 : 0; (o.rays.material as THREE.MeshBasicMaterial).opacity = 0.35 + (motion ? Math.sin(t * 2) * 0.12 : 0);
      o.rays.scale.set(3.6, 1, 3.6);
      o.stamp.visible = collected && since >= 0.9; o.stamp.rotation.y = 0.3;
      if (o.pad) {
        o.pad.visible = !collected;
        (o.pad.material as THREE.MeshBasicMaterial).opacity = isActive || s.status === 'ready' ? 1 : 0.6;
        if (o.beads) {
          const holding = !!s.hold && s.hold.cp === i;
          o.beads.visible = holding;
          if (holding) {
            const k = clamp01((input.clock - s.hold!.startedAt) / s.hold!.ms);
            const lit = Math.floor(k * 28 + 0.0001), c1 = new THREE.Color(0xff5a5f), c2 = new THREE.Color(0x3ddc84), off = new THREE.Color(0x4a2a38);
            for (let b = 0; b < 28; b++) o.beads.setColorAt(b, b < lit ? c1.clone().lerp(c2, b / 27) : off);
            if (o.beads.instanceColor) o.beads.instanceColor.needsUpdate = true;
          }
        }
      }
    });

    // --- cones: preview rings only while setting up ---
    c.coneG.forEach((o, i) => {
      o.safe.visible = s.status === 'ready'; o.num.visible = s.status === 'ready';
      (o.ring.material as THREE.MeshBasicMaterial).opacity = s.status === 'ready' ? 0.95 : 0.55;
      o.ring.scale.setScalar(CONE_R * 7 * (1 + (motion && s.status === 'ready' ? Math.sin(t * 2 + i) * 0.05 : 0)));
    });

    // --- traffic light decal beside the origin ---
    const hasSignals = sch.kinds.includes('stop') || sch.events.some(Boolean);
    c.traffic.visible = hasSignals && (s.status === 'running' || s.status === 'paused') && showGuide && (visualPhase === 'wait' || visualPhase === 'hold');
    if (c.traffic.visible) {
      const lit = visualPhase === 'go' ? 'green' : visualPhase === 'hold' ? 'red' : visualPhase === 'wait' ? 'amber' : visualPhase === 'countdown' ? 'amber' : 'none';
      const want = trafficTexture(lit);
      if (c.trafficMat.map !== want) { c.trafficMat.map = want; c.trafficMat.needsUpdate = true; }
      const side = originP[1] >= 0 ? -1 : 1;
      const off = c.width / 2 + 1.35;
      const heading = dir0;
      const nx = -Math.sin(heading) * side, ny = Math.cos(heading) * side;
      c.traffic.position.set(originP[0] + nx * off, 0.08, -(originP[1] + ny * off));
      c.traffic.rotation.y = 0; // always upright on the floor: readable from any side of the projection
    }

    // --- friendly character (wait event) ---
    const buddyOn = !!s.wait && s.wait.kind === 'character';
    if (buddyOn) {
      const side = originP[1] >= 0 ? -1 : 1, off = c.width / 2 + 1.2, heading = dir0;
      const nx = -Math.sin(heading) * -side, ny = Math.cos(heading) * -side;
      c.buddy.position.set(originP[0] + nx * off, 0, -(originP[1] + ny * off));
      c.buddy.rotation.y = -(heading - Math.PI / 2) + Math.PI * 0.5 * -side;
      const pop = ease(clamp01(waitT * 5));
      c.buddy.scale.setScalar(Math.max(0.01, 1.05 * pop));
      c.buddy.traverse((o) => { if (o.userData.arm) o.rotation.z = -1.5 + (motion ? Math.sin(t * 6) * 0.25 : 0); });
    }
    c.buddy.visible = buddyOn;

    // --- gate (opens after a confirmed stop) ---
    const gateIdx = s.wait?.kind === 'gate' ? s.wait.after : -1;
    c.gate.visible = gateIdx >= 0;
    if (gateIdx >= 0) {
      const pts = segmentPoints(c, gateIdx + 1), L = lengthOf(pts), { p, a } = along(pts, L * 0.42);
      c.gate.position.set(p[0], 0, -p[1]); c.gate.rotation.y = a + Math.PI / 2; // local +X across the corridor
      c.gate.traverse((o) => { if (o.userData.bar) o.rotation.y = -ease(clamp01((waitT - 0.25) / 0.6)) * (Math.PI / 2.1); });
    }

    // --- closed old route (switch / block / altStar) ---
    const routeEvt = !!s.wait && (waitKind === 'switch' || waitKind === 'block' || waitKind === 'altStar');
    c.tape.visible = routeEvt && waitKind !== 'altStar'; c.closedX.visible = c.tape.visible;
    if (routeEvt && s.wait) {
      const i = s.wait.after + 1, from = i === 0 ? c.plan.start : cpPos(s, i - 1), to = c.plan.cps[i];
      const key = `${i}|${from.join(',')}|${to.join(',')}`;
      const spl = sampleSpline([from, to], 6);
      c.setTape(key, waitKind === 'altStar' ? null : ribbonGeometry(spl, 0.42, 0.075, 0.5));
      (c.tapeMat as THREE.MeshBasicMaterial).opacity = 0.35 + 0.5 * Math.min(1, waitT * 3) * (1 - clamp01((waitT - 0.8) * 5));
      const mid: Pt = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      c.closedX.position.set(mid[0], 0.08, -mid[1]); c.closedX.scale.set(1.5, 1, 1.5);
      (c.closedX.material as THREE.MeshBasicMaterial).opacity = (c.tapeMat as THREE.MeshBasicMaterial).opacity;
    }

    // --- gentle cue pulse (therapist-reported deviation / repeat): soft, never alarming ---
    if (s.cue && s.cue.n !== lastCueN) { lastCueN = s.cue.n; cueAt = t; }
    const pk = (t - cueAt) / 1.6;
    c.pulse.visible = pk >= 0 && pk < 1;
    if (c.pulse.visible && s.cue) {
      const colr = s.cue.kind === 'cone' ? 0xff9ec2 : s.cue.kind === 'deviation' ? 0xffc04a : 0x8fd8ff;
      const mat = c.pulse.material as THREE.MeshBasicMaterial;
      mat.color.setHex(colr); mat.opacity = (1 - pk) * 0.95;
      const r = 1.6 + ease(pk) * 3.2;
      c.pulse.scale.set(r, 1, r); c.pulse.position.copy(W3(originP, 0.075));
    }

    // --- stage / session celebration ---
    if (s.status !== prevStatus) {
      if (s.status === 'stage-complete') pool.celebrate(env.fx.kind, env.fx.colors, [6.5, 3.6], fxScale, false);
      else if (s.status === 'ended' && prevStatus !== 'ended') pool.celebrate('grand', env.fx.colors, [7, 3.8], fxScale, true);
      prevStatus = s.status;
    }
    if ((s.status === 'stage-complete' || s.status === 'ended') && Math.random() < dt * (lq ? 0.6 : 1.4)) pool.burst((Math.random() * 2 - 1) * 6.5, (Math.random() * 2 - 1) * 3.5, s.status === 'ended' ? 'grand' : env.fx.kind, env.fx.colors, fxScale * 0.8, s.status === 'ended');

    pool.setPixelsPerUnit(pxPerUnit);
    pool.update(dt);
    void tmpV;
    renderer.render(scene, camera);
    frameMs = performance.now() - t0;
  }

  function resize(w: number, h: number) {
    width = Math.max(2, w); height = Math.max(2, h); aspect = width / height;
    renderer.setSize(width, height, false);
    // fit the whole 16 x 9 floor area (contain), with a sliver of margin; the ground plane extends beyond it
    const halfW = 8.15, halfH = 4.65 * Math.cos(TILT);
    const top = Math.max(halfH, halfW / aspect);
    camera.left = -top * aspect; camera.right = top * aspect; camera.top = top; camera.bottom = -top;
    camera.updateProjectionMatrix();
    const bufH = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    pxPerUnit = bufH / (2 * top);
  }

  function stats(): SceneStats {
    const i = renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, frameMs: Math.round(frameMs * 10) / 10, envBuilds, particles: pool.alive };
  }

  function dispose() {
    disposeCourse();
    if (env) { scene.remove(env.group); env.dispose(); env = null; }
    pool.dispose(); shared.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { resize, draw, stats, dispose, renderer, camera };
}

export type TurnGoScene = ReturnType<typeof createScene>;
void countdownLeft; void activeCp;
