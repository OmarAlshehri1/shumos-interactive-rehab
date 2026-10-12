import * as THREE from 'three';
import { dist, edgeKey, type GuardDef, type Pt } from '@/lib/footmaze3d/mazes';
import { guideOf, type Phase } from '@/lib/footmaze3d/captions';
import { actPose, at, CONT_MS, ENTER_MS, routeToFinish, stat, starVisible, worldOf, type State, type World } from '@/lib/footmaze3d/engine';
import { STAGES } from '@/lib/footmaze3d/stages';
import { buildWorld, themeBackground, themeExposure, type Quality, type World3D } from './world';
import { makeCharacter } from './characters';
import { ParticlePool } from './particles';
import { canvasTexture, checkerTexture, chevronTexture, footprintsTexture, glowTexture, ringTexture, wingTexture } from './textures';
import { goSignTexture, plankTexture, stanceSignTexture, streamTexture, tapeTexture, waitSignTexture } from './signs';
import { Disposer, glowSprite, starGeometry, W3 } from './kit';

export interface SceneOptions {
  quality: Quality;
  reducedEffects: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
}

export interface DrawInput {
  state: State;
  connected: boolean;
  /** Visual running clock (ms): the Display's own extrapolation of the authoritative clock. */
  clock: number;
}

export interface SceneStats { calls: number; triangles: number; geometries: number; textures: number; frameMs: number; envBuilds: number; particles: number }

const TILT = (10 * Math.PI) / 180;
const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const PHASE_COLOR: Record<Phase, number> = { ready: 0x7ff4ff, countdown: 0x4aa8ff, go: 0x3ddc84, choose: 0x4aa8ff, wait: 0xffb020, continue: 0x3ddc84, complete: 0xffd23f, ended: 0xffd23f };
const BLOCK_MAX = 2.4;

interface StarObj { group: THREE.Group; star: THREE.Mesh; halo: THREE.Sprite; rays: THREE.Mesh; stamp: THREE.Mesh; id: string; collectAt: number; prev: string; appearAt: number; wasVisible: boolean }
interface Barrier { key: string; group: THREE.Group; mat: THREE.MeshBasicMaterial; posts: THREE.Mesh[]; cur: number }
interface GuardVis {
  def: GuardDef;
  group: THREE.Group;
  char: THREE.Group | null;
  swarm: THREE.Group | null;
  tape: THREE.Mesh;
  sign: THREE.Mesh;
  signMat: THREE.MeshBasicMaterial;
  gateL: THREE.Mesh | null;
  gateR: THREE.Mesh | null;
  stream: THREE.Mesh | null;
  planks: THREE.Mesh[];
  block: Pt; altBlock: Pt | null; nodeP: Pt; dir: Pt; perp: Pt; signP: Pt;
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
  let pxPerUnit = 100;

  const pool = new ParticlePool(lq ? 160 : 520);
  scene.add(pool.points);

  const shared = new Disposer();
  const starGeo = shared.add(starGeometry(0.55, 0.26, 0.16));
  const smallStarGeo = shared.add(starGeometry(0.28, 0.13, 0.08));
  const gold = shared.add(new THREE.MeshStandardMaterial({ color: 0xffc42e, metalness: 0.55, roughness: 0.28, emissive: 0xff9a00, emissiveIntensity: 0.6 }));
  const goldDim = shared.add(new THREE.MeshStandardMaterial({ color: 0xe9b74a, metalness: 0.4, roughness: 0.4, emissive: 0xb86e00, emissiveIntensity: 0.28 }));
  const skippedMat = shared.add(new THREE.MeshStandardMaterial({ color: 0x9aa4b4, metalness: 0.1, roughness: 0.6, transparent: true, opacity: 0.4 }));
  for (const m of [gold, goldDim, skippedMat]) m.userData.keep = true;
  const planeGeo = shared.add(new THREE.PlaneGeometry(1, 1));
  planeGeo.rotateX(-Math.PI / 2);
  const rayTex = canvasTexture('rays', 256, 256, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 14; i++) { ctx.rotate((Math.PI * 2) / 14); const g = ctx.createLinearGradient(0, 0, 0, -h / 2); g.addColorStop(0, 'rgba(255,230,140,0.9)'); g.addColorStop(1, 'rgba(255,230,140,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(0, -h / 2); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill(); }
  });

  const flat = (d: Disposer, tex: THREE.Texture | null, w: number, h: number, o: { color?: number; opacity?: number; additive?: boolean; y?: number; order?: number } = {}) => {
    const mat = d.add(new THREE.MeshBasicMaterial({ map: tex, color: o.color ?? 0xffffff, transparent: true, opacity: o.opacity ?? 1, depthWrite: false, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, toneMapped: false }));
    const m = new THREE.Mesh(planeGeo, mat);
    m.scale.set(w, 1, h); m.position.y = o.y ?? 0.03; m.renderOrder = o.order ?? 2;
    return m;
  };

  let world: World3D | null = null;
  let worldKey = '';
  let course: ReturnType<typeof buildCourse> | null = null;
  let envBuilds = 0;
  let builtAt = -1e9;

  const keyOf = (s: State) => {
    const c = s.config, w = worldOf(s);
    return JSON.stringify([s.stage, c.simple, c.rot, c.mirror, w.width, c.proj.inset, opts.quality, lq, opts.highContrast, s.seed % 9973]);
  };

  function buildCourse(s: State, w: World) {
    const d = new Disposer();
    const g = new THREE.Group();
    const { maze, layout } = w;
    const pos = layout.pos;
    const half = w.width / 2;
    const stage = STAGES[s.stage];
    const P = (id: string) => pos[id];

    // start marker
    const startG = new THREE.Group();
    startG.position.copy(W3(P(maze.start)));
    const nb0 = P(maze.adj[maze.start][0] ?? maze.start);
    const h0 = Math.atan2(nb0[1] - P(maze.start)[1], nb0[0] - P(maze.start)[0]);
    const startRing = flat(d, ringTexture(), w.width * 1.7, w.width * 1.7, { color: 0x3ddc84, y: 0.04, order: 4 });
    const startDisc = flat(d, glowTexture(), w.width * 2.1, w.width * 2.1, { color: 0x3ddc84, additive: true, opacity: 0.4, y: 0.035, order: 3 });
    const feet = flat(d, footprintsTexture(), w.width * 0.9, w.width * 0.9, { y: 0.045, order: 5 });
    feet.rotation.y = h0 - Math.PI / 2;
    startG.add(startDisc, startRing, feet);
    g.add(startG);

    // finish checker
    const fin = P(maze.finish);
    const fnb = P(maze.adj[maze.finish][0]);
    const fh = Math.atan2(fin[1] - fnb[1], fin[0] - fnb[0]);
    const stripTex = checkerTexture().clone(); stripTex.needsUpdate = true; stripTex.repeat.set(Math.max(1, w.width / 0.55), 1); d.add(stripTex);
    const strip = flat(d, stripTex, w.width, 0.5, { y: 0.05, order: 4 });
    strip.rotation.y = fh - Math.PI / 2;
    strip.position.set(fin[0] - Math.cos(fh) * (half + 0.05), 0.05, -(fin[1] - Math.sin(fh) * (half + 0.05)));
    g.add(strip);

    // stars
    const goldHalo = glowTexture();
    const stars: StarObj[] = maze.stars.map((id) => {
      const isFin = id === maze.finish;
      const grp = new THREE.Group();
      const star = new THREE.Mesh(starGeo, gold); star.castShadow = !lq;
      const halo = glowSprite(goldHalo, 0xffd45a, 2.4, 0.7); halo.position.y = 0.1; d.add(halo.material);
      const rays = flat(d, rayTex, 3, 3, { additive: true, opacity: 0.45, y: 0.05, order: 3 });
      const stamp = new THREE.Mesh(smallStarGeo, goldDim); stamp.position.y = 0.06; stamp.visible = false;
      grp.add(halo, rays, star, stamp);
      grp.position.copy(W3(P(id)));
      grp.userData.fin = isFin;
      g.add(grp);
      return { group: grp, star, halo, rays, stamp, id, collectAt: -1e9, prev: 'pending', appearAt: -1e9, wasVisible: true };
    });

    // the child's confirmed position
    const markRing = flat(d, ringTexture(), 2.0, 2.0, { color: 0x3ddc84, y: 0.07, order: 8 });
    const markGlow = flat(d, glowTexture(), 3.0, 3.0, { color: 0x3ddc84, additive: true, opacity: 0.5, y: 0.065, order: 7 });
    const pulse = flat(d, ringTexture(), 2, 2, { color: 0xffb020, y: 0.075, order: 9, opacity: 0 });
    g.add(markGlow, markRing, pulse);

    // chosen corridor highlight
    const headMesh = flat(d, glowTexture(), 1, 1, { color: 0x4fdcff, additive: true, opacity: 0.5, y: 0.06, order: 6 });
    headMesh.visible = false;
    g.add(headMesh);

    // flowing chevrons
    const chevMat = d.add(new THREE.MeshBasicMaterial({ map: chevronTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const chev = new THREE.InstancedMesh(planeGeo, chevMat, 90);
    chev.frustumCulled = false; chev.renderOrder = 7; chev.count = 0;
    g.add(chev);

    // corridors that can close: barrier overlay + posts
    const keys = new Set<string>(maze.closedAtStart);
    for (const ev of maze.events) for (const [a, b] of [...ev.close, ...ev.open]) keys.add(edgeKey(a, b));
    const tapeTex = tapeTexture();
    const barriers: Barrier[] = [...keys].filter((k) => maze.edgeById[k]).map((key) => {
      const e = maze.edgeById[key], a = P(e.a), b = P(e.b);
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      const bg = new THREE.Group();
      const tex = tapeTex.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, (len - w.width) / 0.9), Math.max(1, w.width / 0.5)); d.add(tex);
      const mat = d.add(new THREE.MeshBasicMaterial({ map: tex, color: stage.theme === 'crystal' ? 0x9fe6ff : 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      const over = new THREE.Mesh(planeGeo, mat);
      const cl = Math.max(0.3, len - w.width);
      over.scale.set(cl, 1, w.width * 0.96);
      over.position.set((a[0] + b[0]) / 2, 0.055, -(a[1] + b[1]) / 2);
      over.rotation.y = Math.atan2(dy, dx);
      over.renderOrder = 5;
      bg.add(over);
      const posts: THREE.Mesh[] = [];
      const postMat = d.add(new THREE.MeshStandardMaterial({ color: stage.theme === 'crystal' ? 0x9fe6ff : 0xffb13a, roughness: 0.4, emissive: stage.theme === 'crystal' ? 0x3fb4e0 : 0x7a4a00, emissiveIntensity: 0.6 }));
      for (const [px, py] of [[a[0] + ux * (half + 0.35), a[1] + uy * (half + 0.35)], [b[0] - ux * (half + 0.35), b[1] - uy * (half + 0.35)]]) {
        for (const sgn of [-1, 1]) {
          const post = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 8)), postMat);
          post.position.set(px - uy * sgn * (half - 0.1), 0.21, -(py + ux * sgn * (half - 0.1)));
          post.castShadow = !lq; bg.add(post); posts.push(post);
        }
      }
      bg.visible = false;
      g.add(bg);
      return { key, group: bg, mat, posts, cur: 0 };
    });

    // guardians, gates, bridges, swarms
    const planksTex = plankTexture(), streamTex = streamTexture();
    const guards: GuardVis[] = maze.guards.map((gd) => {
      const grp = new THREE.Group();
      const nodeP = P(gd.at), far = P(gd.edge[0] === gd.at ? gd.edge[1] : gd.edge[0]);
      const len = dist(nodeP, far), dir: Pt = [(far[0] - nodeP[0]) / len, (far[1] - nodeP[1]) / len];
      const perp: Pt = [-dir[1], dir[0]];
      const dB = Math.min(len * 0.6, BLOCK_MAX);
      const block: Pt = [nodeP[0] + dir[0] * dB, nodeP[1] + dir[1] * dB];
      let altBlock: Pt | null = null;
      if (gd.alt) {
        const af = P(gd.alt[0] === gd.at ? gd.alt[1] : gd.alt[0]);
        const al = dist(nodeP, af), ad: Pt = [(af[0] - nodeP[0]) / al, (af[1] - nodeP[1]) / al];
        altBlock = [nodeP[0] + ad[0] * Math.min(al * 0.6, BLOCK_MAX), nodeP[1] + ad[1] * Math.min(al * 0.6, BLOCK_MAX)];
      }
      const signP: Pt = [nodeP[0] + dir[0] * (dB - 1.0), nodeP[1] + dir[1] * (dB - 1.0)];
      // tape across the corridor
      const tapeMat = d.add(new THREE.MeshBasicMaterial({ map: tapeTex.clone(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      (tapeMat.map as THREE.Texture).repeat.set(Math.max(2, w.width / 0.35), 1); tapeMat.map!.needsUpdate = true; d.add(tapeMat.map!);
      const tape = new THREE.Mesh(planeGeo, tapeMat);
      tape.scale.set(0.34, 1, w.width * 0.98);
      tape.renderOrder = 6;
      tape.visible = false;
      const signMat = d.add(new THREE.MeshBasicMaterial({ map: waitSignTexture(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      const sign = new THREE.Mesh(planeGeo, signMat);
      sign.scale.set(Math.min(1.1, w.width * 0.7), 1, Math.min(1.1, w.width * 0.7)); sign.renderOrder = 9; sign.visible = false;
      g.add(tape, sign);
      let char: THREE.Group | null = null, swarm: THREE.Group | null = null, gateL: THREE.Mesh | null = null, gateR: THREE.Mesh | null = null, stream: THREE.Mesh | null = null;
      const planks: THREE.Mesh[] = [];
      if (gd.kind === 'guard') { char = makeCharacter(gd.char, d); char.visible = false; char.scale.setScalar(Math.min(1.25, w.width * 0.8)); grp.add(char); }
      else if (gd.kind === 'swarm') {
        swarm = new THREE.Group();
        const wingGeo = d.add(new THREE.PlaneGeometry(0.42, 0.34)); wingGeo.rotateX(-Math.PI / 2); wingGeo.translate(0.21, 0, 0);
        for (let i = 0; i < 14; i++) {
          const mat = d.add(new THREE.MeshBasicMaterial({ map: wingTexture([330, 45, 280, 200, 20][i % 5]), transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, toneMapped: false }));
          const b = new THREE.Group(), l = new THREE.Group(), r = new THREE.Group();
          const lw = new THREE.Mesh(wingGeo, mat), rw = new THREE.Mesh(wingGeo, mat); rw.scale.x = -1;
          l.add(lw); r.add(rw); b.add(l, r); b.userData = { l, r, ph: i * 0.9, rad: 0.3 + (i % 5) * 0.12 };
          swarm.add(b);
        }
        swarm.visible = false; grp.add(swarm);
      } else if (gd.kind === 'gate') {
        const m = d.add(new THREE.MeshStandardMaterial({ color: stage.theme === 'crystal' ? 0x9fe9ff : 0xc98a4a, roughness: 0.25, transparent: true, opacity: 0.9, emissive: stage.theme === 'crystal' ? 0x3fb4e0 : 0x3a2000, emissiveIntensity: 0.6 }));
        const leaf = () => { const o = new THREE.Mesh(d.add(new THREE.BoxGeometry(half + 0.05, 0.62, 0.3)), m); o.castShadow = !lq; return o; };
        gateL = leaf(); gateR = leaf(); grp.add(gateL, gateR);
      } else {
        const sm = d.add(new THREE.MeshBasicMaterial({ map: streamTex.clone(), transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
        sm.map!.repeat.set(1, 1); d.add(sm.map!);
        stream = new THREE.Mesh(planeGeo, sm); stream.scale.set(1.6, 1, w.width * 1.04); stream.renderOrder = 4; grp.add(stream);
        const pm = d.add(new THREE.MeshStandardMaterial({ map: planksTex, roughness: 0.8 }));
        for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(d.add(new THREE.BoxGeometry(0.28, 0.07, w.width * 0.96)), pm); p.castShadow = !lq; p.visible = false; grp.add(p); planks.push(p); }
      }
      g.add(grp);
      return { def: gd, group: grp, char, swarm, tape, sign, signMat, gateL, gateR, stream, planks, block, altBlock, nodeP, dir, perp, signP };
    });

    return { group: g, d, w, stars, startG, startRing, startDisc, markRing, markGlow, pulse, headMesh, chev, barriers, guards };
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
    const k = keyOf(s);
    if (k === worldKey || t * 1000 - builtAt < 250) return;
    worldKey = k; builtAt = t * 1000; envBuilds++;
    disposeCourse();
    if (world) { scene.remove(world.group); world.dispose(); }
    const w = worldOf(s), stage = STAGES[s.stage];
    world = buildWorld({ theme: stage.theme, maze: w.maze, layout: w.layout, width: w.width, quality: opts.quality, reduced: opts.reducedEffects, highContrast: opts.highContrast, seed: s.seed });
    scene.add(world.group);
    scene.background = new THREE.Color(themeBackground(stage.theme));
    renderer.toneMappingExposure = themeExposure(stage.theme);
    course = buildCourse(s, w);
    scene.add(course.group);
  }

  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const place = (mesh: THREE.InstancedMesh, i: number, p: Pt, ang: number, size: number, y = 0.07) => {
    q.setFromAxisAngle(up, ang - Math.PI / 2);
    ps.set(p[0], y, -p[1]); sc.set(size, 1, size);
    m4.compose(ps, q, sc); mesh.setMatrixAt(i, m4);
  };
  const lengthOf = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
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
  const wp = (p: Pt, h = 0) => new THREE.Vector3(p[0], h, -p[1]);

  let prevStatus = '';
  let prevStage = -1, lastRun = -1;
  let lastCueN = -1, cueAt = -1e9, cueKind = '';
  let frameMs = 0;

  function draw(input: DrawInput, dt: number, t: number) {
    const t0 = performance.now();
    const s = input.state;
    sync(s, t);
    if (!world || !course) { renderer.render(scene, camera); return; }
    const c = course;
    const w = worldOf(s);
    const { maze, layout } = w;
    const pos = layout.pos;
    const half = w.width / 2;
    const st = stat(s);
    const res = st.res.length === maze.stars.length ? st.res : maze.stars.map(() => 'pending' as const);
    const clock = input.clock;
    const sView: State = s.status === 'running' ? { ...s, clock: Math.max(s.clock, clock) } : s;
    const g = guideOf(sView);
    const visualPhase: Phase = !input.connected && s.status === 'running' ? 'wait' : g.phase;
    const playing = s.status === 'running' && input.connected;
    const motion = !opts.reducedMotion;
    const fxScale = lq ? 0.45 : 1;
    const cur = at(s);
    const curP: Pt | null = cur ? pos[cur] : null;
    const stage = STAGES[s.stage];

    if (s.stage !== prevStage || s.run !== lastRun) {
      prevStage = s.stage; lastRun = s.run;
      c.stars.forEach((o, i) => { o.prev = res[i]; o.collectAt = -1e9; o.wasVisible = starVisible(s, maze, o.id); o.appearAt = -1e9; });
      lastCueN = s.cue?.n ?? -1; cueAt = -1e9;
    }
    world.update(t, dt);

    // ---- child marker & start marker ----
    const showGuide = s.status === 'running' || s.status === 'paused';
    const col = new THREE.Color(PHASE_COLOR[visualPhase]);
    const pulseK = 0.5 + 0.5 * Math.sin(t * (visualPhase === 'wait' ? 5 : 3));
    if (curP) {
      c.markRing.position.copy(wp(curP, 0.07)); c.markGlow.position.copy(wp(curP, 0.065));
      const bs = w.width * 1.15 + (motion ? pulseK * 0.25 : 0);
      c.markRing.scale.set(bs, 1, bs); c.markGlow.scale.set(bs * 1.6, 1, bs * 1.6);
      (c.markRing.material as THREE.MeshBasicMaterial).color.copy(col); (c.markGlow.material as THREE.MeshBasicMaterial).color.copy(col);
      (c.markGlow.material as THREE.MeshBasicMaterial).opacity = 0.3 + pulseK * 0.25;
    }
    c.markRing.visible = c.markGlow.visible = showGuide && !!curP;
    c.startRing.scale.setScalar(w.width * 1.7 * (1 + (motion ? Math.sin(t * 2.2) * 0.04 : 0)));
    (c.startRing.material as THREE.MeshBasicMaterial).color.setHex(s.status === 'ready' ? 0x7ff4ff : 0x3ddc84);
    (c.startDisc.material as THREE.MeshBasicMaterial).color.setHex(s.status === 'ready' ? 0x7ff4ff : 0x3ddc84);

    // ---- guidance: flowing chevrons along the shortest route, per hint level ----
    const hinting = s.status === 'running' && clock < s.hintUntil;
    const mode = hinting ? 'always' : w.hint;
    let nChev = 0;
    const guidePhase = (visualPhase === 'go' || visualPhase === 'choose' || visualPhase === 'continue') && playing;
    if (guidePhase && cur && mode !== 'none') {
      const route = routeToFinish(s, w);
      let nodes = route.length > 1 ? route : [];
      if (mode === 'next') nodes = nodes.slice(0, 2);
      if (s.heading && w.maze.adj[cur]?.includes(s.heading) && mode !== 'always') nodes = [cur, s.heading];
      const poly = nodes.map((id) => pos[id]);
      const L = lengthOf(poly);
      if (poly.length > 1 && L > 0.8) {
        const gap = 0.95, margin = 0.75;
        const flow = motion ? (t * 0.7) % gap : 0;
        for (let s0 = margin + flow; s0 < L - 0.5 && nChev < 90; s0 += gap) {
          const { p, a } = along(poly, s0);
          place(c.chev, nChev++, p, a, Math.min(0.62, w.width * 0.4) * (opts.highContrast ? 1.2 : 1));
        }
      }
    }
    c.chev.count = nChev; c.chev.instanceMatrix.needsUpdate = true;

    // ---- chosen corridor highlight (neutral: it confirms the choice was registered, never judges it) ----
    c.headMesh.visible = false;
    if (showGuide && cur && s.heading && pos[s.heading] && !s.act) {
      const a = pos[cur], b = pos[s.heading];
      const L = dist(a, b);
      c.headMesh.visible = true;
      c.headMesh.position.set((a[0] + b[0]) / 2, 0.06, -(a[1] + b[1]) / 2);
      c.headMesh.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
      c.headMesh.scale.set(L, 1, w.width * 0.9);
      (c.headMesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + (motion ? pulseK * 0.14 : 0.1);
    }

    // ---- stars ---
    c.stars.forEach((o, i) => {
      const r = res[i];
      const vis = starVisible(s, maze, o.id);
      if (vis && !o.wasVisible) o.appearAt = t;
      o.wasVisible = vis;
      const prev = o.prev;
      if (prev !== r) {
        if (r === 'confirmed' || r === 'assisted') { o.collectAt = t; pool.burst(o.group.position.x, o.group.position.z, world!.fx.kind, world!.fx.colors, fxScale); }
        o.prev = r;
      }
      const collected = r === 'confirmed' || r === 'assisted';
      const isTarget = showGuide && !collected && r !== 'skipped' && vis;
      const since = t - o.collectAt;
      const showStar = vis && (!collected || since < 1.0);
      const isFin = !!o.group.userData.fin;
      o.group.visible = vis || t - o.appearAt < 0.05 || isFin;
      o.star.visible = showStar && r !== 'skipped' ? true : r === 'skipped' && vis;
      o.star.material = r === 'skipped' ? skippedMat : isTarget || s.status === 'ready' ? gold : goldDim;
      const bob = motion ? Math.sin(t * 2 + i) * 0.06 : 0;
      let scl = (isFin ? 1.55 : 1.05) + (motion && isTarget ? Math.sin(t * 3.2 + i) * 0.07 : 0);
      let y = 0.42 + bob;
      const born = t - o.appearAt;
      if (born < 0.8) scl *= 0.3 + 0.7 * ease(clamp01(born / 0.8));
      if (collected && since < 1.0) { const k = since; y += ease(k) * 1.8; scl *= 1 + Math.sin(k * Math.PI) * 0.5 - ease(k) * 1.0; o.star.rotation.y += dt * 14; }
      else if (!collected) o.star.rotation.y += dt * (motion ? (isTarget ? 1.5 : 0.5) : 0);
      o.star.position.y = y; o.star.scale.setScalar(Math.max(0.01, scl));
      o.halo.visible = showStar && (isTarget || s.status === 'ready' || isFin); (o.halo.material as THREE.SpriteMaterial).opacity = 0.5 + (motion ? Math.sin(t * 3) * 0.2 : 0);
      o.halo.scale.setScalar(isFin ? 3.4 : 2.1);
      o.rays.visible = showStar && (isFin || isTarget) && !collected; o.rays.rotation.y = motion ? t * 0.25 : 0;
      (o.rays.material as THREE.MeshBasicMaterial).opacity = 0.3 + (motion ? Math.sin(t * 2) * 0.12 : 0);
      o.rays.scale.set(isFin ? 4 : 2.6, 1, isFin ? 4 : 2.6);
      o.stamp.visible = collected && since >= 0.9 && !isFin; o.stamp.rotation.y = 0.3;
    });

    // ---- corridors that can close: smooth toward the engine's state ----
    for (const b of c.barriers) {
      const closed = w.closed.has(b.key) ? 1 : 0;
      b.cur += (closed - b.cur) * (1 - Math.exp(-dt * 3.2));
      if (Math.abs(closed - b.cur) < 0.004) b.cur = closed;
      b.group.visible = b.cur > 0.01;
      b.mat.opacity = Math.min(0.85, b.cur * 0.9);
      b.posts.forEach((p) => { p.scale.y = Math.max(0.01, b.cur); p.position.y = 0.21 * b.cur; });
    }

    // ---- guardians / gates / bridges / swarms ----
    const contWin = s.contAt >= 0 && clock - s.contAt < CONT_MS;
    for (const gv of c.guards) {
      const gd = gv.def;
      const running = !!s.act && s.act.id === gd.id;
      const fired = s.fired.includes(gd.id);
      const pose = running ? actPose(s.act!, clock, !!gd.alt) : null;
      const inEnter = pose?.phase === 'enter', inHold = pose?.phase === 'hold', inLeave = pose?.phase === 'leave';
      const atGuardNode = cur === gd.at;
      const blockVec = pose && pose.side === 'alt' && gv.altBlock ? gv.altBlock : gv.block;
      const pBlock: Pt = pose && gv.altBlock && pose.slide > 0 && pose.slide < 1 ? [gv.block[0] + (gv.altBlock[0] - gv.block[0]) * ease(pose.slide), gv.block[1] + (gv.altBlock[1] - gv.block[1]) * ease(pose.slide)] : blockVec;
      // sign: WAIT while the block is on, GO right after
      const showWait = running && !inLeave;
      const showGo = (inLeave || (contWin && fired && atGuardNode && !running)) && (gd.kind === 'guard' || gd.kind === 'swarm' || gd.kind === 'gate' || gd.kind === 'bridge');
      gv.sign.visible = showWait || showGo;
      if (gv.sign.visible) {
        const want = showGo ? goSignTexture() : s.config.stance && (gd.kind === 'guard' || gd.kind === 'swarm') ? stanceSignTexture() : waitSignTexture();
        if (gv.signMat.map !== want) { gv.signMat.map = want; gv.signMat.needsUpdate = true; }
        const k = showGo ? (inLeave ? clamp01(pose!.k * 3) : 1 - clamp01((clock - s.contAt) / CONT_MS - 0.7) * 3.3) : clamp01(((inEnter ? pose!.k : 1)) * 3);
        gv.signMat.opacity = Math.max(0, Math.min(1, k));
        const bob = motion ? 1 + Math.sin(t * 4) * 0.05 : 1;
        gv.sign.position.set(gv.signP[0], 0.075, -gv.signP[1]);
        const sz = Math.min(1.1, w.width * 0.7) * bob;
        gv.sign.scale.set(sz, 1, sz);
      }
      // tape across the blocked corridor
      const tapeOn = running && (gd.kind === 'guard' || gd.kind === 'swarm' || gd.kind === 'gate') && !inLeave;
      gv.tape.visible = tapeOn;
      if (tapeOn) {
        const dir = pose && pose.side === 'alt' && gd.alt ? dirTo(gv, c.w, gd.alt) : gv.dir;
        const base: Pt = [gv.nodeP[0] + dir[0] * (Math.min(dist(gv.nodeP, pBlock), BLOCK_MAX) - 0.55), gv.nodeP[1] + dir[1] * (Math.min(dist(gv.nodeP, pBlock), BLOCK_MAX) - 0.55)];
        gv.tape.position.set(base[0], 0.06, -base[1]);
        gv.tape.rotation.y = Math.atan2(dir[1], dir[0]) + Math.PI / 2;
        (gv.tape.material as THREE.MeshBasicMaterial).opacity = inEnter ? clamp01(pose!.k * 2) * 0.9 : 0.9;
      }
      // the friendly character: pops out of the hedge beside the corridor, stands at the block, then steps back out
      if (gv.char) {
        gv.char.visible = running && !!pose && pose.phase !== 'done';
        if (gv.char.visible) {
          const side = half + 0.55 + 0.4;
          const off = inEnter ? 1 - ease(pose!.k) : inLeave ? ease(pose!.k) : 0;
          const scale = (inEnter ? 0.25 + 0.75 * ease(pose!.k) : inLeave ? 1 - 0.85 * ease(pose!.k) : 1) * Math.min(1.25, w.width * 0.8);
          const dirNow = pose && pose.side === 'alt' && gd.alt ? dirTo(gv, c.w, gd.alt) : gv.dir;
          const perpNow: Pt = [-dirNow[1], dirNow[0]];
          gv.char.position.set(pBlock[0] + perpNow[0] * side * off, (motion && inHold ? Math.abs(Math.sin(t * 5)) * 0.04 : 0) + off * 0.25, -(pBlock[1] + perpNow[1] * side * off));
          gv.char.scale.setScalar(Math.max(0.01, scale));
          const toward = new THREE.Vector2(gv.nodeP[0] - pBlock[0], -(gv.nodeP[1] - pBlock[1]));
          gv.char.rotation.y = Math.atan2(toward.x, toward.y);
          gv.char.traverse((o) => { if (o.userData.arm) o.rotation.z = -2.5 + (motion ? Math.sin(t * 6) * 0.3 : 0); });
        }
      }
      if (gv.swarm) {
        gv.swarm.visible = running && !!pose && pose.phase !== 'done';
        if (gv.swarm.visible) {
          const spread = inEnter ? ease(pose!.k) : inLeave ? 1 + ease(pose!.k) * 2.2 : 1;
          const fade = inLeave ? 1 - ease(pose!.k) : 1;
          gv.swarm.children.forEach((b, i) => {
            const u = b.userData as { l: THREE.Object3D; r: THREE.Object3D; ph: number; rad: number };
            const a = t * (0.9 + (i % 4) * 0.12) + u.ph;
            const R = (w.width * 0.42 + u.rad) * spread;
            b.position.set(pBlock[0] + Math.cos(a) * R, 0.7 + Math.sin(a * 2.1 + i) * 0.14, -(pBlock[1] + Math.sin(a * 1.3) * R * 0.75));
            b.rotation.y = -a + Math.PI / 2;
            const fl = Math.sin(t * 17 + i) * 0.9; u.l.rotation.z = fl; u.r.rotation.z = -fl;
            b.scale.setScalar(Math.max(0.01, fade * (inEnter ? 0.4 + ease(pose!.k) * 0.6 : 1)));
          });
        }
      }
      // gate leaves: open (parked in the walls) except while it is the child's turn to wait
      if (gv.gateL && gv.gateR) {
        const closed = running ? (inEnter ? ease(pose!.k) : inHold ? 1 : 1 - ease(pose!.k)) : 0;
        const along = Math.min(dist(gv.nodeP, gv.block), BLOCK_MAX);
        const rot = Math.atan2(gv.dir[1], gv.dir[0]) + Math.PI / 2;
        const lw = half + 0.05;
        for (const [leaf, sgn] of [[gv.gateL, -1], [gv.gateR, 1]] as const) {
          const open = lw * 1.1 + 0.05;
          const x = sgn * ((open + lw / 2) * (1 - closed) + (lw / 2) * closed);
          leaf.position.set(gv.nodeP[0] + gv.dir[0] * along + gv.perp[0] * x, 0.25, -(gv.nodeP[1] + gv.dir[1] * along + gv.perp[1] * x));
          leaf.rotation.y = rot;
        }
        gv.gateL.visible = gv.gateR.visible = running || false;
      }
      // bridge: a flat stream with planks that extend while the child waits, and stay afterwards
      if (gv.stream) {
        const p = running ? clamp01((clock - s.act!.t0) / Math.max(1, s.act!.leaveAt + 1400 - s.act!.t0)) : fired ? 1 : 0;
        const along = Math.min(dist(gv.nodeP, gv.block), BLOCK_MAX);
        const cx = gv.nodeP[0] + gv.dir[0] * along, cy = gv.nodeP[1] + gv.dir[1] * along;
        const rot = Math.atan2(gv.dir[1], gv.dir[0]);
        gv.stream.position.set(cx, 0.045, -cy); gv.stream.rotation.y = rot;
        (gv.stream.material as THREE.MeshBasicMaterial).map!.offset.x = motion ? (t * 0.15) % 1 : 0;
        const n = gv.planks.length;
        gv.planks.forEach((pl, i) => {
          const on = p * n > i + 0.01;
          pl.visible = on;
          const lift = on ? Math.max(0, 1 - clamp01(p * n - i)) * 0.4 : 0;
          const off = (i - (n - 1) / 2) * 0.3;
          pl.position.set(cx + gv.dir[0] * off, 0.05 + lift, -(cy + gv.dir[1] * off));
          pl.rotation.y = rot + Math.PI / 2;
        });
      }
    }

    // ---- gentle cue pulse at the child's position ----
    if (s.cue && s.cue.n !== lastCueN) {
      lastCueN = s.cue.n; cueAt = t; cueKind = s.cue.kind;
      if (s.cue.kind === 'good' && curP) pool.burst(curP[0], -curP[1], world.fx.kind, world.fx.colors, fxScale * 0.6);
    }
    const pk = (t - cueAt) / 1.6;
    c.pulse.visible = pk >= 0 && pk < 1 && !!curP;
    if (c.pulse.visible && curP) {
      const mat = c.pulse.material as THREE.MeshBasicMaterial;
      mat.color.setHex(cueKind === 'dead' ? 0xffc04a : cueKind === 'good' ? 0x6df0a6 : 0x8fd8ff); mat.opacity = (1 - pk) * 0.95;
      const r = 1.4 + ease(pk) * 2.8;
      c.pulse.scale.set(r, 1, r); c.pulse.position.copy(wp(curP, 0.075));
    }

    // ---- celebration ----
    if (s.status !== prevStatus) {
      if (s.status === 'stage-complete') pool.celebrate(world.fx.kind, world.fx.colors, [6.5, 3.6], fxScale, false);
      else if (s.status === 'ended' && prevStatus !== 'ended') pool.celebrate('grand', world.fx.colors, [7, 3.8], fxScale, true);
      prevStatus = s.status;
    }
    if ((s.status === 'stage-complete' || s.status === 'ended') && Math.random() < dt * (lq ? 0.6 : 1.4)) pool.burst((Math.random() * 2 - 1) * 6.5, (Math.random() * 2 - 1) * 3.5, s.status === 'ended' ? 'grand' : world.fx.kind, world.fx.colors, fxScale * 0.8, s.status === 'ended');
    void stage;

    pool.setPixelsPerUnit(pxPerUnit);
    pool.update(dt);
    renderer.render(scene, camera);
    frameMs = performance.now() - t0;
  }

  function dirTo(gv: GuardVis, w: World, edge: [string, string]): Pt {
    const far = w.layout.pos[edge[0] === gv.def.at ? edge[1] : edge[0]];
    const l = dist(gv.nodeP, far) || 1;
    return [(far[0] - gv.nodeP[0]) / l, (far[1] - gv.nodeP[1]) / l];
  }

  function resize(wd: number, ht: number) {
    const width = Math.max(2, wd), height = Math.max(2, ht), aspect = width / height;
    renderer.setSize(width, height, false);
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
    if (world) { scene.remove(world.group); world.dispose(); world = null; }
    pool.dispose(); shared.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { resize, draw, stats, dispose, renderer, camera };
}

export type FootMazeScene = ReturnType<typeof createScene>;
void ENTER_MS;
