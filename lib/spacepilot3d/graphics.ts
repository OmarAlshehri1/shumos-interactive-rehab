import { WorldChaseCamera } from "./worldCamera";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { FlightSceneState } from "./presentation";

export type GraphicsQuality = "low" | "medium" | "high";
export const QUALITY_DPR: Record<GraphicsQuality, number> = { low: 0.8, medium: 1.25, high: 1.75 };
export const SHIP_MODEL_URL = "/spacepilot3d/models/aurora.glb";
const noiseGLSL = `
float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise3(p)*.55+noise3(p*2.03)*.27+noise3(p*4.01)*.13+noise3(p*8.04)*.05;}
`;

/** One instance owns every GPU resource and pending model request. No game rules. */
export function createFlightGraphics(renderer: THREE.WebGLRenderer) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const geometry = <T extends THREE.BufferGeometry>(g: T) => { geometries.add(g); return g; };
  const material = <T extends THREE.Material>(m: T) => { materials.add(m); return m; };
  const texture = <T extends THREE.Texture>(t: T) => { textures.add(t); return t; };
  const request = new AbortController();
  let disposed = false, loaded = false;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x040b17);
  scene.fog = new THREE.FogExp2(0x060e1c, 0.0006);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 30000);
  scene.add(new THREE.HemisphereLight(0xc1dfff, 0x080e1c, 1.05));
  const sun = new THREE.DirectionalLight(0xe1efff, 2.9); sun.position.set(-9, 12, 6); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x458edb, 2.2); rim.position.set(8, 3, -10); scene.add(rim);
  const environment = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environment, 0.07);
  scene.environment = environmentTarget.texture; scene.environmentIntensity = 0.85;
  environment.dispose(); pmrem.dispose();

  // Analytic radial falloff shared by engine, collection and fiery particles.
  const glowData = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4, r = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
    glowData[i] = glowData[i + 1] = glowData[i + 2] = 255; glowData[i + 3] = Math.round(Math.pow(Math.max(0, 1 - r), 2.5) * 255);
  }
  const glow = texture(new THREE.DataTexture(glowData, 64, 64)); glow.needsUpdate = true;
  const sprite = (color: number, opacity: number, size: number) => {
    const m = material(new THREE.SpriteMaterial({ map: glow, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const s = new THREE.Sprite(m); s.scale.set(size, size, 1); return s;
  };
  const chase = new WorldChaseCamera();
  const ship = new THREE.Group(); ship.name = "spacecraft"; scene.add(ship);
  const shell = material(new THREE.MeshStandardMaterial({ color: 0x789ebd, metalness: 0.72, roughness: 0.32 }));
  const dark = material(new THREE.MeshStandardMaterial({ color: 0x173954, metalness: 0.7, roughness: 0.27 }));
  const cyan = material(new THREE.MeshBasicMaterial({ color: 0x8cecff }));
  const engineGlow: THREE.Sprite[] = [], enginePlumes: THREE.Sprite[] = [], tierTwo: THREE.Object3D[] = [], tierThree: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const nozzle = new THREE.Mesh(geometry(new THREE.CircleGeometry(.20, 32)), cyan); nozzle.position.set(side * .95, 0, 1.38); ship.add(nozzle);
    const light = sprite(0x42bfff, .85, 1.35); light.position.copy(nozzle.position); ship.add(light); engineGlow.push(light);
    for (let i = 0; i < 8; i++) { const s = sprite(0x339cff, .25, .62); s.position.set(side * .95, 0, 1.5 + i * .16); ship.add(s); enginePlumes.push(s); }
    const enhanced = new THREE.Mesh(geometry(new THREE.TorusGeometry(.37, .05, 10, 32)), cyan); enhanced.position.set(side * .95, 0, 1.2); ship.add(enhanced); tierTwo.push(enhanced);
    const wingShape = new THREE.Shape(); wingShape.moveTo(side * .6, .25); wingShape.lineTo(side * 2.2, .9); wingShape.lineTo(side * 2.1, 1.05); wingShape.lineTo(side * .6, .6); wingShape.closePath();
    const wing = new THREE.Mesh(geometry(new THREE.ExtrudeGeometry(wingShape, { depth: .07, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 1 })), shell); wing.rotation.x = Math.PI / 2; ship.add(wing); tierThree.push(wing);
    const strip = new THREE.Mesh(geometry(new THREE.BoxGeometry(.75, .035, .1)), cyan); strip.position.set(side * 1.65, .02, .83); ship.add(strip); tierThree.push(strip);
    const fin = new THREE.Mesh(geometry(new THREE.BoxGeometry(.1, .4, .65)), dark); fin.position.set(side * 1.95, .14, .85); fin.rotation.z = side * -.25; ship.add(fin); tierThree.push(fin);
  }
  const started = performance.now(); let assetLoadMs = 0;
  const ready = fetch(SHIP_MODEL_URL, { signal: request.signal }).then(response => { if (!response.ok) throw Error(`Spacecraft could not load (${response.status}).`); return response.arrayBuffer(); }).then(buffer => new GLTFLoader().parseAsync(buffer, "/spacepilot3d/models/")).then(gltf => {
    gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const m of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(m);
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) { textures.add(value); value.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); }
        if (m instanceof THREE.MeshStandardMaterial) m.envMapIntensity = 1.15;
      }
    });
    if (disposed) { disposeResources(); return; }
    // Original Aurora GLB authored at the unchanged hull/wing/pod proxy scale.
    ship.add(gltf.scene);
    // Compile every encounter material before advertising readiness. First ring
    // or fiery encounter must not introduce a mid-session shader stall.
    encounters.forEach(({ mesh }, i) => { mesh.visible = true; mesh.material = i % 3 === 0 ? gold : i % 3 === 1 ? rock : fiery; });
    return renderer.compileAsync(scene, camera).then(() => { if (!disposed) { loaded = true; assetLoadMs = performance.now() - started; } });
  });

  const rockGeometries = [0, 1, 2].map(seed => {
    const g = geometry(new THREE.IcosahedronGeometry(1, 5)), a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) {
      const x=a.getX(i),y=a.getY(i),z=a.getZ(i);
      let d=.84+.10*Math.sin(x*4+seed)*Math.cos(y*5-z*3)+.045*Math.sin(z*17+x*11)*Math.cos(y*13);
      for(let crater=0;crater<4;crater++){const v=new THREE.Vector3(Math.sin(crater*7+seed),Math.cos(crater*4+seed),Math.sin(crater*3+2)).normalize();const dot=x*v.x+y*v.y+z*v.z;d-=.11*Math.pow(Math.max(0,dot),35);}
      a.setXYZ(i,x*d,y*d,z*d);
    }
    g.computeVertexNormals(); return g;
  });
  const rockSurface = (fire: boolean) => {
    const m = material(new THREE.MeshStandardMaterial({ color: 0x62605c, roughness: .96, metalness: .05 }));
    m.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vRock;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock=position;');
      shader.fragmentShader = 'varying vec3 vRock;\n' + noiseGLSL + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\nfloat grain=fbm(vRock*28.);float strata=fbm(vRock*6.);diffuseColor.rgb*=mix(.23,1.15,smoothstep(.18,.8,grain))*(.65+strata*.5);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(dFdx(grain),dFdy(grain),0.)*.65);');
      if (fire) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat vein=1.-smoothstep(.025,.08,abs(fbm(vRock*7.)-.48));totalEmissiveRadiance+=vec3(1.8,.38,.025)*vein;');
    };
    m.customProgramCacheKey = () => `space-rock-${fire}`; return m;
  };
  const rock = rockSurface(false), fiery = rockSurface(true);
  const ringGeometry=geometry(new THREE.TorusGeometry(1,.065,12,80));
  const ringGlowGeometry=geometry(new THREE.TorusGeometry(1,.13,8,80));
  const ringGlowMaterial=material(new THREE.MeshBasicMaterial({color:0xffbc32,transparent:true,opacity:.13,blending:THREE.AdditiveBlending,depthWrite:false}));
  const ringAxis=new THREE.Vector3(0,0,1),ringNormal=new THREE.Vector3();
  const gold = material(new THREE.MeshStandardMaterial({ color: 0xffce50, metalness: .82, roughness: .24, emissive: 0xffa92b, emissiveIntensity: .16 }));
  const encounters = Array.from({ length: 6 }, (_, index) => {
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>(rockGeometries[index % 3], rock); mesh.name = `encounter-${index}`; scene.add(mesh);
    const halo = new THREE.Mesh(ringGlowGeometry,ringGlowMaterial); scene.add(halo);
    const flames = Array.from({ length: 6 }, () => { const s = sprite(0xff8d32, .45, .9); scene.add(s); return s; });
    return { mesh, halo, flames };
  });
  const effects = Array.from({ length: 4 }, () => {
    const group = new THREE.Group(); scene.add(group);
    const particles = Array.from({ length: 12 }, () => { const s = sprite(0xffd267, .9, .22); group.add(s); return s; });
    return { group, particles, at: -1 };
  });
  let eventCursor = 0, effectCursor = 0, eventRun = '', effectTime = 0;

  // Static procedural sky geometry; gameplay objects are always real meshes.
  const skyMaterials: THREE.PointsMaterial[] = [];
  for (let layer = 0; layer < 3; layer++) {
    const points = new Float32Array(([1800, 600, 150][layer]) * 3);
    for (let i = 0; i < points.length / 3; i++) { const random = (n: number) => { const a = Math.sin(i * n + layer * 71) * 43758.5453; return a - Math.floor(a); }; points[i * 3] = (random(127.1) - .5) * 5000; points[i * 3 + 1] = (random(269.5) - .5) * 2800; points[i * 3 + 2] = -200 - random(183.3) * 9000; }
    const g = geometry(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(points, 3));
    const m = material(new THREE.PointsMaterial({ color: [0x6685a7, 0xa1cbe7, 0xe4dbcb][layer], size: [1.4, 2.4, 3.6][layer], sizeAttenuation: false, fog: false, map: glow, transparent: true, depthWrite: false, opacity: [.65, .85, .9][layer] })); skyMaterials.push(m); scene.add(new THREE.Points(g, m));
  }
  const nebula = new THREE.Mesh(geometry(new THREE.SphereGeometry(18000, 48, 24)), material(new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, vertexShader: 'varying vec3 vSky;void main(){vSky=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 vSky;'+noiseGLSL+'void main(){vec3 p=normalize(vSky);float n=fbm(p*7.+fbm(p*12.)*.8);float band=exp(-pow((p.y+p.x*.35+.15)*3.,2.));float fine=fbm(p*28.);vec3 c=vec3(.002,.006,.014)+mix(vec3(.024,.044,.085),vec3(.035,.023,.051),smoothstep(.3,.7,fine))*pow(n,2.)*band;gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' })));
  nebula.position.set(0,0,-4500);scene.add(nebula);
  const planetSurface=(variant:number)=>{
    const m=material(new THREE.MeshStandardMaterial({color:0xffffff,roughness:.82,metalness:.08}));
    m.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 vPlanet;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPlanet=position;');
      shader.fragmentShader='varying vec3 vPlanet;\n'+noiseGLSL+shader.fragmentShader;
      const terrain=variant===1 ? 'float bands=sin(p.y*26.+fbm(p*5.)*5.);vec3 surface=mix(vec3(.14,.07,.035),vec3(.46,.31,.20),bands*.5+.5);surface*=.6+fbm(p*35.)*.5;' : variant===2 ? 'float grit=fbm(p*45.);float pits=smoothstep(.22,.5,fbm(p*13.));vec3 surface=vec3(.32,.35,.39)*(.35+pits*.6+grit*.4);' : 'float land=smoothstep(.50,.555,fbm(p*2.+fbm(p*4.)*.65));float height=fbm(p*25.);vec3 water=mix(vec3(.012,.055,.11),vec3(.035,.19,.27),height);vec3 ground=mix(vec3(.06,.14,.10),vec3(.40,.29,.14),height);vec3 surface=mix(water,ground,land);surface=mix(surface,vec3(.77,.83,.84),smoothstep(.80,.97,abs(p.y)+height*.10));float clouds=smoothstep(.63,.78,fbm(p*12.+fbm(p*6.)*2.));surface=mix(surface,vec3(.74,.82,.87),clouds*.85);';
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nvec3 p=normalize(vPlanet);'+terrain+'float day=smoothstep(-.15,.45,dot(p,normalize(vec3(-.65,.4,.7))));diffuseColor.rgb*=surface*mix(.045,1.,day);');
    };m.customProgramCacheKey=()=>`r2-planet-${variant}`;return m;
  };
  const planetMaterial=planetSurface(0);
  const planet=new THREE.Mesh(geometry(new THREE.SphereGeometry(7.5,64,40)),planetMaterial);planet.name='azure-planet';planet.scale.setScalar(5);planet.position.set(-180,-70,-500);scene.add(planet);
  const atmosphere=new THREE.Mesh(geometry(new THREE.SphereGeometry(7.7,48,32)),material(new THREE.ShaderMaterial({transparent:true,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending,vertexShader:'varying vec3 vN;varying vec3 vV;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 vN;varying vec3 vV;void main(){float a=pow(1.-abs(dot(normalize(vN),normalize(vV))),3.);gl_FragColor=vec4(.12,.42,.78,a*.35);}' })));planet.add(atmosphere);
  // Fixed world landmarks and formations. These never follow or rotate with the
  // camera. All decorative rocks are outside the maximum navigable X envelope.
  const landmarks: THREE.Object3D[] = [planet];
  const moon = new THREE.Mesh(geometry(new THREE.SphereGeometry(15, 40, 28)), planetSurface(2)); moon.position.set(-112, -45, -550); moon.name = "near-moon"; scene.add(moon); landmarks.push(moon);
  const amberPlanet = new THREE.Mesh(geometry(new THREE.SphereGeometry(62, 64, 40)), planetSurface(1)); amberPlanet.position.set(230, -100, -1550); amberPlanet.name = "ringed-planet"; scene.add(amberPlanet); landmarks.push(amberPlanet);
  const ring = new THREE.Mesh(geometry(new THREE.RingGeometry(79, 106, 72)), material(new THREE.MeshStandardMaterial({ color: 0x8596a5, roughness: .85, side: THREE.DoubleSide, transparent: true, opacity: .45 }))); ring.position.copy(amberPlanet.position); ring.rotation.x = 1.05; ring.rotation.y = -.3; scene.add(ring);
  const farPlanet = new THREE.Mesh(geometry(new THREE.SphereGeometry(90, 32, 24)), planetMaterial); farPlanet.name = "distant-planet"; farPlanet.position.set(-250, -400, -3400); scene.add(farPlanet); landmarks.push(farPlanet);
  const formations = new THREE.InstancedMesh(rockGeometries[1], rock, 72), transform = new THREE.Object3D();
  formations.name = 'distant-asteroid-formations';
  for (let i = 0; i < 72; i++) { const cluster = Math.floor(i / 6), side = cluster % 2 ? 1 : -1; const random = (n: number) => { const value = Math.sin(i * n + 41) * 43758.5453; return value - Math.floor(value); }; transform.position.set(side * (96 + random(127.1) * 65), -65 + random(269.5) * 85, -180 - cluster * 420 - random(183.3) * 90); transform.rotation.set(i * .7, i * .4, i * .3); transform.scale.setScalar(2 + (i % 4)); transform.updateMatrix(); formations.setMatrixAt(i, transform.matrix); }
  formations.computeBoundingSphere(); scene.add(formations);
  const dustPositions = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) { const random = (n: number) => { const x = Math.sin(i * n + 6) * 43758.5453; return x - Math.floor(x); }; dustPositions[i*3] = (random(127.1) - .5) * 260; dustPositions[i*3+1] = (random(269.5) - .5) * 130; dustPositions[i*3+2] = -random(183.3) * 6500; }
  const dustGeometry = geometry(new THREE.BufferGeometry()); dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions,3));
  const dust = new THREE.Points(dustGeometry, material(new THREE.PointsMaterial({ color: 0x7c9db2, map: glow, size: .24, transparent: true, opacity: .36, depthWrite: false }))); scene.add(dust);
  let displayedTier=1,upgradeAt=-10;
  let quality: GraphicsQuality = 'medium', reducedEffects = false, reducedCamera = false;
  function disposeResources() { for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) { t.dispose(); const data = t.source?.data; if (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) data.close(); } geometries.clear(); materials.clear(); textures.clear(); }
  return {
    scene, camera, ready, get loaded() { return loaded; }, get assetLoadMs() { return assetLoadMs; },
    setReducedEffects(value: boolean) { reducedEffects = value; dust.visible = !value; },
    setReducedCameraMotion(value: boolean) { reducedCamera = value; },
    landmarkProjections() { return landmarks.map(o => ({ name: o.name, world: o.position.toArray(), ndc: o.position.clone().project(camera).toArray() })); },
    setQuality(value: GraphicsQuality) { quality = value; atmosphere.visible = value !== 'low'; skyMaterials[0].visible = value !== 'low'; },
    update(state: FlightSceneState, delta: number) {
      const identity = `${state.sessionId}/${state.runId}`;
      if (identity !== eventRun) { eventRun = identity; chase.reset(); eventCursor = effectCursor = 0; effectTime = 0; for (const e of effects) e.at = -1; }
      if (delta > 0 && delta <= .25 && ['running', 'mission-complete', 'complete'].includes(state.status)) effectTime += delta;
      if ('z' in state.ship) {
        const pose = state.ship;
        ship.position.set(pose.x, pose.y, pose.z); ship.rotation.set(pose.pitch, -pose.yaw, pose.bank, 'YXZ');
        const view = chase.update(pose, state.status === 'running' ? delta : 0, reducedCamera || !!state.flightSettings?.reducedCamera, state.flightSettings);
        camera.position.set(view.position.x, view.position.y, view.position.z); camera.up.set(0,1,0); camera.lookAt(view.target.x, view.target.y, view.target.z);
        if (camera.fov !== view.fov) { camera.fov = view.fov; camera.updateProjectionMatrix(); }
      } else {
        // Historical unpaired preview only; the active Display always receives world poses.
        ship.position.set(state.ship.x, state.ship.y, 0); ship.rotation.set(0,0,state.ship.bank);
        camera.position.set(-2.2 + state.ship.x * .3, 7 + state.ship.y * .55, 9); camera.lookAt(5.4 + state.ship.x * .3, -13 + state.ship.y * .55, -25);
      }
      planet.rotation.y = reducedEffects ? 0 : effectTime * .006;
      if(identity!==eventRun||state.stats.upgradeTier<displayedTier){displayedTier=state.stats.upgradeTier;upgradeAt=-10;}
      if(state.stats.upgradeTier>displayedTier){displayedTier=state.stats.upgradeTier;upgradeAt=effectTime;}
      const reveal=reducedEffects?1:Math.min(1,Math.max(0,(effectTime-upgradeAt)/1.1));
      for (const item of tierTwo) {item.visible = state.stats.upgradeTier >= 2;item.scale.setScalar(displayedTier===2?.75+.25*reveal:1);}
      for (const item of tierThree) {item.visible = state.stats.upgradeTier >= 3;item.scale.setScalar(.75+.25*reveal);}
      for (const s of engineGlow) s.material.opacity = state.stats.upgradeTier >= 2 ? 1 : .7;
      enginePlumes.forEach((s, i) => { const k = i % 8; s.visible = !reducedEffects && (quality !== 'low' || k < 4); s.position.z = 1.5 + k * (state.stats.upgradeTier >= 2 ? .30 : .22); s.material.opacity = (.28 - k * .026) * (1 + Math.sin(effectTime * 8 + k) * .08); });
      encounters.forEach(({ mesh, halo, flames }, i) => {
        const o = state.objects[i]; mesh.visible = !!o && o.presented && o.outcome === 'pending'; if (!o) return;
        mesh.geometry = o.kind === 'ring' ? ringGeometry : rockGeometries[i % 3]; mesh.material = o.kind === 'ring' ? gold : o.kind === 'fiery' ? fiery : rock;
        mesh.position.set(o.x, o.y, o.z); mesh.scale.setScalar(o.scale);
        const visualTime = reducedEffects ? 0 : state.elapsedSeconds;
        if (o.kind === 'ring') {
          const normal=o.ring?.normal??{x:0,y:0,z:1};
          mesh.quaternion.setFromUnitVectors(ringAxis,ringNormal.set(normal.x,normal.y,normal.z));
          mesh.rotateZ(visualTime*.18+i);mesh.scale.setScalar((o.ring?.innerRadius??2)/.935);
        }
        else mesh.rotation.set(visualTime * .16 + i, visualTime * .21 + i, i);
        halo.visible = mesh.visible && o.kind === 'ring'; halo.position.copy(mesh.position);halo.quaternion.copy(mesh.quaternion);halo.scale.copy(mesh.scale);
        flames.forEach((s, k) => { s.visible = mesh.visible && !reducedEffects && o.kind === 'fiery' && (quality !== 'low' || k < 2); const t = (effectTime * .7 + k / 6) % 1; s.position.set(o.x + Math.sin(k * 2.4) * o.scale * .5, o.y + Math.cos(k * 2.4) * o.scale * .5, o.z - .3 - t * 1.9); s.scale.setScalar(o.scale * (1 - t) * 1.3); s.material.opacity = (1 - t) * .45; });
      });
      while (eventCursor < state.events.length) {
        const event = state.events[eventCursor++]; if (event.sessionId !== state.sessionId || event.runId !== state.runId || !['collected', 'collision'].includes(event.outcome)) continue;
        const object = state.objects.find(o => o.id === event.objectId); if (!object) continue;
        const effect = effects[effectCursor++ % effects.length]; effect.at = effectTime; effect.group.position.set(object.x, object.y, "z" in state.ship ? object.z : 0);
        for (const particle of effect.particles) particle.material.color.setHex(event.outcome === 'collected' ? 0xffd466 : 0xff7840);
      }
      for (const e of effects) { const age = effectTime - e.at; e.group.visible = !reducedEffects && e.at >= 0 && age < .7; if (!e.group.visible) continue; e.particles.forEach((p, i) => { const a = i / 12 * Math.PI * 2; p.position.set(Math.cos(a) * age * 3, Math.sin(a) * age * 3, Math.sin(i * 7) * age); p.material.opacity = 1 - age / .7; }); }
    },
    dispose() { if (disposed) return; disposed = true; request.abort(); formations.dispose(); scene.clear(); environmentTarget.dispose(); disposeResources(); },
  };
}
