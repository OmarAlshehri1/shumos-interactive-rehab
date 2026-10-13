import * as T from 'three';
import { done, type State } from '@/lib/achievementforest/engine';
import { LEVELS, worldTargets } from '@/lib/achievementforest/milestones';
import { Sculpture, tree, flowers, fern, mushroom, bridge, animal, random, groundY, riverX } from './art';
export interface SceneStats { calls: number; triangles: number; geometries: number; textures: number; builds: number; baked: number; trees: number; pending: number }
interface Options { quality: 'high'|'balanced'|'low'; reducedEffects: boolean; reducedMotion: boolean; highContrast: boolean; cinematic: boolean }
interface BuildEvent { type: 'start'|'complete'; level: number; index: number; id: string }
interface Growth { group: T.Group; level: number; index: number; value: number; target: number; notified: boolean }
interface Life { object: T.Object3D; kind: string; phase: number; base: T.Vector3 }
/** One persistent 3D landscape, 30 scenery milestones. All animation follows authoritative counts. */
export function createScene(canvas: HTMLCanvasElement, opts: Options, event: (e: BuildEvent) => void) {
 const rng=random(1843),renderer=new T.WebGLRenderer({canvas,antialias:opts.quality!=='low',alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio,opts.quality==='high'?1.65:opts.quality==='low'?1:1.25));
 renderer.shadowMap.enabled=opts.quality!=='low';renderer.shadowMap.type=T.PCFShadowMap;
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
 const scene=new T.Scene();scene.background=new T.Color('#b8dbe4');scene.fog=new T.FogExp2('#b8dbe4',.0075);
 const camera=new T.PerspectiveCamera(43,1,.1,240);
 const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.86});
 const leafCanvas=document.createElement('canvas');leafCanvas.width=256;leafCanvas.height=256;
 const lc=leafCanvas.getContext('2d')!;lc.fillStyle='#b7c2a7';lc.fillRect(0,0,256,256);
 for(let i=0;i<2200;i++){const v=120+rng()*120;lc.fillStyle=`rgba(${v},${v},${v},.35)`;lc.beginPath();lc.ellipse(rng()*256,rng()*256,2+rng()*5,1+rng()*3,rng()*6.28,0,Math.PI*2);lc.fill();}
 const leafMap=new T.CanvasTexture(leafCanvas);leafMap.colorSpace=T.SRGBColorSpace;leafMap.wrapS=leafMap.wrapT=T.RepeatWrapping;
 const foliage=new T.MeshStandardMaterial({vertexColors:true,map:leafMap,roughness:.94});
 const rockMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.98});
 const glowMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.5,emissive:'#79d5b5',emissiveIntensity:.28});
 const waterMaterial=new T.MeshStandardMaterial({color:'#62b8b9',metalness:.28,roughness:.24,transparent:true,opacity:.9});
 scene.add(new T.HemisphereLight('#e4f4f8','#688352',1.25));
 const sun=new T.DirectionalLight('#ffe9b3',2.5);sun.position.set(-22,40,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-45;sun.shadow.camera.right=45;sun.shadow.camera.top=45;sun.shadow.camera.bottom=-45;sun.shadow.camera.far=100;sun.shadow.bias=-.0004;sun.shadow.normalBias=.15;scene.add(sun);
 const fill=new T.DirectionalLight('#b6c9fa',.7);fill.position.set(24,18,-30);scene.add(fill);
 const life: Life[]=[],growth: Growth[]=[];let treeCount=0,initialized=false,lastRun=-1,lastSession='',builds=0,pausedT=0;
 const base=new T.Group();scene.add(base);
 // Vertex-painted undulating meadow with a low stream bed and distant hills.
 const terrain=new T.PlaneGeometry(150,150,100,100);terrain.rotateX(-Math.PI/2);const positions=terrain.attributes.position,colors=new Float32Array(positions.count*3);
 for(let i=0;i<positions.count;i++) {
  const x=positions.getX(i),z=positions.getZ(i),river=Math.abs(x-riverX(z));let y=groundY(x,z);
  const far=Math.max(0,Math.abs(x)-34)+Math.max(0,-z-40);y+=far*.11+Math.sin(x*.08+z*.03)*far*.04;
  if(river<4.3&&Math.abs(z)<62)y=-.75+(river/4.3)**3*.85;
  const basin=((x-12)/12)**2+((z+25)/8)**2;
  if(basin<1)y=T.MathUtils.lerp(-.38,y,Math.min(1,basin**3));
  positions.setY(i,y);const shade=.5+.5*Math.sin(x*.37+Math.cos(z*.22))*Math.cos(z*.2);
  const c=new T.Color().lerpColors(new T.Color('#64885b'),new T.Color('#adc578'),shade*.65+rng()*.18);
  if(river<5)c.lerp(new T.Color('#c4bd95'),.5);colors.set([c.r,c.g,c.b],i*3);
 }
 terrain.setAttribute('color',new T.BufferAttribute(colors,3));terrain.computeVertexNormals();const land=new T.Mesh(terrain,material);land.receiveShadow=true;base.add(land);
 // River ribbon: actual geometry and animated ripples, never a background picture.
 const riverGeo=new T.BufferGeometry(),rv:number[]=[],ri:number[]=[];
 for(let i=0;i<=160;i++){const z=-65+i*130/160,w=3.1+Math.sin(z*.07)*.5;rv.push(riverX(z)-w,-.1,z,riverX(z)+w,-.1,z);if(i<160){const k=i*2;ri.push(k,k+2,k+1,k+1,k+2,k+3);}}
 riverGeo.setAttribute('position',new T.Float32BufferAttribute(rv,3));riverGeo.setIndex(ri);riverGeo.computeVertexNormals();const river=new T.Mesh(riverGeo,waterMaterial);base.add(river);
 const ripples=new T.Group();base.add(ripples);const rippleMat=new T.MeshBasicMaterial({color:'#eff9e3',transparent:true,opacity:.32,depthWrite:false});
 for(let i=0;i<45;i++){const z=-42+rng()*80;const ring=new T.Mesh(new T.TorusGeometry(.25+rng()*.45,.012,3,20),rippleMat);ring.rotation.x=Math.PI/2;ring.scale.x=2;ring.position.set(riverX(z)+(rng()-.5)*4,-.065,z);ripples.add(ring);life.push({object:ring,kind:'ripple',phase:rng()*7,base:ring.position.clone()});}
 // Framing rocks, stream banks, old stepping stones and textured grasses are present from the start.
 const rocks=new Sculpture();for(let i=0;i<170;i++){const z=-46+rng()*90,x=riverX(z)+(i%2?1:-1)*(3.8+rng()*1.1),size=.2+rng()*.55;rocks.ellipsoid(['#8e9b84','#a7ad93','#767e73'][i%3],[x,.1,z],[size*1.6,size*.8,size],1);}base.add(rocks.finish(rockMaterial));
 const grasses=new Sculpture();for(let i=0;i<(opts.quality==='low'?1300:3300);i++) {
  const x=(rng()-.5)*80,z=(rng()-.5)*90;if(Math.abs(x-riverX(z))<5)continue;const y=groundY(x,z),h=.18+rng()*.4;
  grasses.add(new T.ConeGeometry(.07,h,3),['#729553','#91ac61','#b2c078'][i%3],[x,y+h/2,z],[1,1,1],[0,rng()*6.28,.1]);
 }base.add(grasses.finish(material));
 const stones=new Sculpture();for(let i=0;i<24;i++){const z=18-i*1.7,x=10+Math.sin(z*.13)*2;stones.ellipsoid(i%2?'#d5c6a3':'#bbbc9c',[x,groundY(x,z)+.1,z],[.7,.16,.55],1);}base.add(stones.finish(material));
 // Sky clouds and layered distant hills produce depth without obscuring the growth.
 const clouds=new Sculpture();for(let i=0;i<12;i++){const x=(rng()-.5)*130,z=-55-rng()*20,y=27+rng()*10;for(let j=0;j<6;j++)clouds.ellipsoid('#eef3e8',[x+j*1.5,y+Math.sin(j)*.6,z],[3.3,1.1,1.8],2);}const cloudMesh=clouds.finish(new T.MeshBasicMaterial({vertexColors:true}));base.add(cloudMesh);
 const hills=new Sculpture();for(let i=0;i<13;i++)hills.ellipsoid(i%2?'#83b2ab':'#94beb5',[-70+i*12,2,-72-rng()*14],[14,5+rng()*8,12],2);base.add(hills.finish(material));
 const green=['#48785b','#619665','#83ab70','#9cb57d'],pink=['#d89cb6','#e5b2c6','#b77eaa','#e8bfcc'],violet=['#9381b7','#b39cca','#c4b5d4','#879b87'];
 function place(o:T.Object3D,x:number,z:number,parent:T.Group,y=groundY(x,z)){o.position.set(x,y,z);parent.add(o);return o;}
 function addTree(parent:T.Group,x:number,z:number,h:number,seed:number,palette:readonly string[]=green,ancient=false){const o=tree(seed,h,palette,material,ancient,foliage);place(o,x,z,parent);treeCount++;life.push({object:o.getObjectByName('crown')!,kind:'crown',phase:seed,base:new T.Vector3()});return o;}
 // A sparse starting landscape. Background tree silhouettes always remain visual scenery.
 for(let i=0;i<16;i++){const x=(i%2?1:-1)*(26+rng()*14),z=-24-rng()*31;addTree(base,x,z,5+rng()*4,70+i,green);}
 addTree(base,-25,17,13,14,pink);addTree(base,29,8,13,52,green);addTree(base,-30,-6,11,19,violet);
 for(let i=0;i<7;i++)place(fern(i,material),12+rng()*15,-28+rng()*45,base);
 function milestone(level:number,index:number){const group=new T.Group();scene.add(group);const item={group,level,index,value:0,target:0,notified:false};growth.push(item);return group;}
 function flowerBed(parent:T.Group,x:number,z:number,n=60,r=3,glow=false){if(Math.abs(x-riverX(z))<r+3.5)x=riverX(z)+(x>=riverX(z)?1:-1)*(r+3.8);place(flowers(Math.floor(x*911+z*127)+5000,n,r,glow?glowMaterial:material,glow),x,z,parent);}
 function addLife(parent:T.Group,kind:'rabbit'|'deer'|'bird'|'butterfly',x:number,z:number,seed:number){const o=animal(kind,material,seed);place(o,x,z,parent,kind==='bird'?4:kind==='butterfly'?1.8:groundY(x,z));life.push({object:o,kind,phase:seed*.78,base:o.position.clone()});return o;}
 function waterFall(parent:T.Group,x:number,z:number,height:number) {
  const s=new Sculpture();for(let i=0;i<13;i++){const a=i*2.4;s.ellipsoid(i%2?'#81907a':'#a5a78c',[x+Math.cos(a)*2.2,height*.4+i%4*.8,z+Math.sin(a)*1.3],[1.4,height*.38,1.3],1);}parent.add(s.finish(rockMaterial));
  for(let i=0;i<4;i++){const water=new T.Mesh(new T.PlaneGeometry(.45,height,1,12),new T.MeshStandardMaterial({color:i%2?'#d7f4e8':'#7cc8c6',transparent:true,opacity:.7,side:T.DoubleSide,roughness:.3}));water.position.set(x+(i-1.5)*.45,height/2,z+1.6);water.rotation.x=.05;parent.add(water);life.push({object:water,kind:'fall',phase:i,base:water.position.clone()});}
  flowerBed(parent,x+3,z+2,35,2);
 }
 // Level one: a little garden on the right of the river.
 {const g=milestone(0,0);place(fern(7,material),9,8,g);flowerBed(g,9,8,15,1);}
 {const g=milestone(0,1);addTree(g,12,3,5.5,18);}
 {const g=milestone(0,2);flowerBed(g,16,9,100,4);flowerBed(g,7,15,65,2.4);}
 {const g=milestone(0,3);addTree(g,19,-3,8,101,pink);flowerBed(g,19,-3,60,2.5);}
 {const g=milestone(0,4);for(let i=0;i<10;i++)addLife(g,'butterfly',10+rng()*8,2+rng()*10,i+5);}
 {const g=milestone(0,5);for(let i=0;i<10;i++)flowerBed(g,8+Math.sin(i*.5)*2,16-i*2,20,1);}
 {const g=milestone(0,6);place(mushroom(1,material),20,13,g);place(mushroom(2,material),8,-5,g);}
 {const g=milestone(0,7);const pond=new T.Mesh(new T.CircleGeometry(3.5,48),waterMaterial);pond.rotation.x=-Math.PI/2;pond.scale.x=1.4;pond.position.set(19,groundY(19,17)+.05,17);g.add(pond);flowerBed(g,23,19,45,1.8);}
 {const g=milestone(0,8);addTree(g,26,-14,9,81,violet);addTree(g,23,22,7,53,green);for(let i=0;i<9;i++)place(fern(i+10,material),6+rng()*18,8+rng()*15,g);}
 {const g=milestone(0,9);flowerBed(g,14,-10,130,4);addTree(g,8,-14,6,191,pink);for(let i=0;i<4;i++)addLife(g,'bird',14+i,-10,i+21);}
 // Level two: expand on the left, keeping the entire earlier garden intact.
 {const g=milestone(1,0);for(let i=0;i<9;i++)addTree(g,-10-rng()*17,-20+rng()*31,8+rng()*4,200+i,i%3?green:violet);}
 {const g=milestone(1,1);waterFall(g,-7,-30,7);}
 {const g=milestone(1,2);const b=bridge(material,9);place(b,riverX(7),7,g,.15);flowerBed(g,-8,8,50,2);}
 {const g=milestone(1,3);for(let i=0;i<4;i++)addLife(g,'rabbit',-9-i*1.8,8-i*2,i+32);}
 {const g=milestone(1,4);addLife(g,'deer',-12,-4,44);addLife(g,'deer',-16,-7,55).scale.setScalar(.68);}
 {const g=milestone(1,5);for(let i=0;i<9;i++)addLife(g,'bird',-20+rng()*35,-12+rng()*25,i+30);}
 {const g=milestone(1,6);flowerBed(g,-15,13,170,5);flowerBed(g,-19,-13,110,4);}
 {const g=milestone(1,7);for(let i=0;i<16;i++)place(fern(i+76,material),-8-rng()*17,-20+rng()*42,g);place(mushroom(4,material),-14,17,g);}
 {const g=milestone(1,8);for(let i=0;i<8;i++)addTree(g,-20+rng()*12,-28+rng()*34,7+rng()*5,i+400,i%2?pink:green);}
 {const g=milestone(1,9);flowerBed(g,-9,-10,120,4);for(let i=0;i<10;i++)addLife(g,'butterfly',-12+rng()*10,4+rng()*10,i+60);addTree(g,-25,20,12,76,pink);}
 // Level three: lake and the ancient central tree beyond the garden and woodland.
 {const g=milestone(2,0);const lake=new T.Mesh(new T.CircleGeometry(9,64),waterMaterial);lake.rotation.x=-Math.PI/2;lake.scale.set(1.3,.85,1);lake.position.set(12,.18,-25);g.add(lake);const s=new Sculpture();for(let i=0;i<45;i++){const a=i*6.283/45;s.ellipsoid('#9ba98c',[12+Math.cos(a)*12,.25,-25+Math.sin(a)*7.7],[.7,.5,.65]);}g.add(s.finish(rockMaterial));}
 {const g=milestone(2,1);addTree(g,-24,-31,15,703,green,true);addTree(g,29,-33,15,722,violet,true);}
 let hero:T.Group;
 {const g=milestone(2,2);hero=addTree(g,3,-20,18,811,['#417d68','#62a183','#8bb799','#b6c68a'],true);const crown=hero.getObjectByName('crown') as T.Mesh;crown.material=foliage.clone();flowerBed(g,3,-18,110,4,true);}
 {const g=milestone(2,3);for(let i=0;i<7;i++)flowerBed(g,-12+i*5,-18+(i%2)*4,70,2.4,true);}
 {const g=milestone(2,4);waterFall(g,24,-35,8);waterFall(g,-20,-39,9);}
 {const g=milestone(2,5);place(bridge(material,8),riverX(-15),-15,g,.2);place(bridge(material,7),17,-18,g,.55).rotation.y=.45;}
 {const g=milestone(2,6);for(let i=0;i<6;i++)addLife(g,i%2?'rabbit':'deer',14+rng()*10,-4+rng()*8,i+110);for(let i=0;i<8;i++)addLife(g,'bird',-6+rng()*18,-20+rng()*12,i+100);}
 let particles:T.Points;
 {const g=milestone(2,7);const n=opts.reducedEffects?40:180,p=new Float32Array(n*3);for(let i=0;i<n;i++)p.set([(rng()-.5)*45,1+rng()*12,-30+rng()*45],i*3);const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(p,3));particles=new T.Points(geo,new T.PointsMaterial({color:'#f3e6a4',size:.09,transparent:true,opacity:.85,depthWrite:false}));g.add(particles);}
 {const g=milestone(2,8);for(let i=0;i<9;i++){flowerBed(g,-25+rng()*50,-8+rng()*30,85,3,true);place(mushroom(i,material),-24+rng()*48,12+rng()*10,g);}addTree(g,27,19,12,850,pink);}
 let jewels:T.Group;
 {const g=milestone(2,9);jewels=new T.Group();jewels.position.copy(hero!.position);g.add(jewels);
  const gemMat=new T.MeshStandardMaterial({color:'#bcffe9',emissive:'#62eeb9',emissiveIntensity:1.4,roughness:.3});
  for(let i=0;i<40;i++){const a=i*2.4,y=8+rng()*9,rad=(18-y)*.45+1;const gem=new T.Mesh(new T.SphereGeometry(.13+rng()*.08,8,6),gemMat);gem.position.set(Math.cos(a)*rad,y,Math.sin(a)*rad);jewels.add(gem);}
  for(let i=0;i<14;i++)addLife(g,'butterfly',-6+rng()*16,-18+rng()*15,i+320);flowerBed(g,4,14,150,4,true);
 }
 const visualProgress = () => LEVELS.map((def,l)=>def.milestones.map((_,i)=>growth.find(g=>g.level===l&&g.index===i)!.value));
 let lastTargets:number[][]=[];
 const draw = ({state:s,connected}:{state:State;connected:boolean},dt:number,time:number) => {
  const animate=s.status!=='paused'&&connected; if(animate&&!opts.reducedMotion)pausedT+=dt;const t=pausedT;
  const targets=worldTargets({level:s.level,done:done(s),target:s.target,complete:s.status==='level-complete'});
  const reset=!initialized||s.run!==lastRun||s.sessionId!==lastSession;
  for(const g of growth) {
   const target=targets[g.level][g.index];
   if(reset){g.value=target;g.notified=target>=1;}
   else if(target>g.target){event({type:'start',level:g.level,index:g.index,id:LEVELS[g.level].milestones[g.index].id});}
   g.target=target;
   // Parallel growth never gates input, and catches up to every authoritative update.
   g.value=opts.reducedMotion?target:T.MathUtils.damp(g.value,target,5,dt);
   if(Math.abs(g.value-target)<.003)g.value=target;
   g.group.visible=g.value>.005;g.group.scale.set(1,Math.max(.001,g.value),1);
   if(g.value===1&&!g.notified){g.notified=true;if(!reset){builds++;event({type:'complete',level:g.level,index:g.index,id:LEVELS[g.level].milestones[g.index].id});}}
   if(target<1)g.notified=false;
  }
  initialized=true;lastRun=s.run;lastSession=s.sessionId;lastTargets=targets;
  // Organic movement; reduced motion freezes drift and wings while retaining state growth.
  for(const a of life) {
   const o=a.object,ph=t+a.phase;
   if(a.kind==='crown')o.rotation.z=opts.reducedMotion?0:Math.sin(ph*.55)*.009;
   else if(a.kind==='ripple'){o.position.z=a.base.z+(t*.7)%3;o.scale.y=.6+(Math.sin(ph)+1)*.5;}
   else if(a.kind==='fall'){o.scale.x=1+Math.sin(ph*3)*.06;}
   else if(a.kind==='bird'||a.kind==='butterfly') {
    const bird=a.kind==='bird';o.position.set(a.base.x+Math.sin(ph*.45)*(bird?3:1.2),a.base.y+Math.sin(ph*.7)*.5,a.base.z+Math.cos(ph*.45)*(bird?2:1));o.rotation.y=-ph*.45;
    for(const name of ['wingL','wingR']){const w=o.getObjectByName(name);if(w)w.rotation.z=Math.sin(ph*(bird?5:7))*.65*(name==='wingL'?1:-1);}
   } else {
    const v=Math.sin(ph*.23);o.position.x=a.base.x+v*1.2;o.position.y=a.base.y+Math.abs(Math.sin(ph*(a.kind==='rabbit'?2:1)))*.025;o.rotation.y=Math.cos(ph*.23)*.35;
   }
  }
  if(particles){particles.rotation.y=Math.sin(t*.07)*.08;particles.position.y=Math.sin(t*.25)*.15;}
  if(jewels)jewels.rotation.y=Math.sin(t*.14)*.015;
  const heroCrown=hero.getObjectByName('crown') as T.Mesh;const heroMat=heroCrown.material as T.MeshStandardMaterial;heroMat.emissive.set('#79eac7');heroMat.emissiveIntensity=growth[29].value*.65;
  const kingdom=s.level===2?done(s)/s.target:0;
  sun.color.set('#ffe9b3').lerp(new T.Color('#ffccad'),kingdom*.6);sun.intensity=2.5-kingdom*.4;
  const sky=new T.Color('#b8dbe4').lerp(new T.Color('#dfbdaf'),kingdom*.65);scene.background=sky;scene.fog!.color.copy(sky);
  const finale=s.level===2&&s.status==='level-complete';
  const distance=finale?1.12:1;const drift=opts.cinematic&&!opts.reducedMotion?Math.sin(t*.055)*1.5:0;
  const desired=new T.Vector3((35+drift)*distance,27*distance,43*distance);
  if(reset)camera.position.copy(desired);else camera.position.lerp(desired,1-Math.exp(-dt*.6));camera.lookAt(0,5,-5);
  renderer.render(scene,camera);
  void time;
 };
 return {
  renderer,draw,
  resize:(w:number,h:number)=>{renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();},
  stats:():SceneStats=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,builds,baked:30,trees:treeCount,pending:growth.filter(g=>Math.abs(g.target-g.value)>.01).length}),
  progress:()=>({values:visualProgress(),targets:lastTargets}),
  dispose:()=>{const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());leafMap.dispose();renderer.dispose();},
 };
}
