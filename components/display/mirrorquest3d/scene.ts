import * as T from 'three';
import { LIMBS, type State, target } from '@/lib/mirrorquest3d/engine';
import { makeRig, SEAT_HEIGHT } from './rig';
export { makeRig, type Rig } from './rig';
export function createStudio(canvas:HTMLCanvasElement,initial:State){
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,initial.config.quality==='high'?1.5:1));renderer.shadowMap.enabled=initial.config.quality==='high';renderer.shadowMap.type=T.PCFShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
 const scene=new T.Scene();scene.background=new T.Color(0x263f49);scene.fog=new T.Fog(0x263f49,16,38);
 const camera=new T.OrthographicCamera(-4,4,2.08,-2.08,.1,40);camera.position.set(0,3.4,12);camera.lookAt(0,1.65,0);
 scene.add(new T.HemisphereLight(0xe5f4ff,0x69786f,1.6));
 const key=new T.DirectionalLight(0xffe4bf,2.5);key.position.set(-3,7,6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6});key.shadow.bias=-.001;scene.add(key);
 const fill=new T.DirectionalLight(0x9be1e8,1.1);fill.position.set(5,4,-2);scene.add(fill);
 const mat=(color:number,metalness=0,emissive=0)=>new T.MeshStandardMaterial({color,roughness:.64,metalness,emissive,emissiveIntensity:.45});
 const stone=mat(0x506a70),dark=mat(0x304751),trim=mat(0x839b98,.3),accent=mat(0x95cebf,.2,0x3b8b83),gold=mat(0xd8b678,.3);
 const box=(p:number[],s:number[],m:T.Material,parent:T.Object3D=scene)=>{const mesh=new T.Mesh(new T.BoxGeometry(s[0],s[1],s[2]),m);mesh.position.set(p[0],p[1],p[2]);mesh.receiveShadow=true;mesh.castShadow=true;parent.add(mesh);return mesh;};
 const floor=new T.Mesh(new T.PlaneGeometry(60,60),mat(0x65807e));floor.rotation.x=-Math.PI/2;floor.position.y=-.14;floor.receiveShadow=true;scene.add(floor);
 box([0,2.4,-3.1],[18,6,.35],dark);
 // Recessed architectural bays, warm framing and a softly lit central arch.
 for(const sign of [-1,1]){
  box([sign*3.8,2.3,-2.85],[4.7,4.5,.12],stone);
  for(let i=0;i<5;i++)box([sign*(1.6+i*.92),2.3,-2.65],[.035,4.5,.12],trim);
  box([sign*3.8,.30,-2.52],[4.7,.08,.16],gold);box([sign*3.8,4.12,-2.5],[4.7,.06,.16],accent);
  box([sign*3.8,1.4,-2.64],[4.7,.025,.10],trim);
 }
 box([0,1.9,-2.7],[2.5,3.8,.12],mat(0x3b5660));
 const arch=new T.Mesh(new T.TorusGeometry(1.27,.075,10,64,Math.PI),gold);arch.position.set(0,2.43,-2.54);scene.add(arch);
 for(const sign of [-1,1])box([sign*1.27,1.31,-2.54],[.15,2.24,.15],gold);
 const chairs:T.Group[]=[];
 for(const x of [-1.82,1.82]){
  const platform=new T.Mesh(new T.CylinderGeometry(.96,1.03,.15,64),mat(0x354f55,.25));platform.position.set(x,-.075,.02);platform.receiveShadow=true;scene.add(platform);
  const ring=new T.Mesh(new T.TorusGeometry(.94,.019,8,64),accent);ring.rotation.x=Math.PI/2;ring.position.set(x,.004,.02);scene.add(ring);
  const chair=new T.Group();chair.position.x=x;scene.add(chair);chairs.push(chair);
  const upholstery=mat(0x446f72),frame=mat(0xc5b58f,.35);
  box([0,SEAT_HEIGHT-.06,.05],[.72,.12,.64],upholstery,chair);box([0,1.05,-.29],[.72,.83,.12],upholstery,chair);
  for(const a of [-1,1])for(const b of [-1,1])box([a*.29,.29,b*.23],[.055,.59,.055],frame,chair);
  for(const a of [-1,1])box([a*.37,.89,.07],[.065,.07,.57],frame,chair);
 }
 const player=makeRig(initial.config.character),teacher=makeRig(initial.config.character),ghost=makeRig(initial.config.character,true);
 player.root.position.x=-1.82;teacher.root.position.x=1.82;ghost.root.position.set(-1.82,0,-.065);ghost.root.scale.setScalar(1.045);scene.add(ghost.root,player.root,teacher.root);
 let frames=0,last=performance.now(),fps=0,demonstrationKey='',demonstrationTime=0,lastSeated:boolean|undefined;
 const neutral={RIGHT_HAND:0,LEFT_HAND:0,RIGHT_FOOT:0,LEFT_FOOT:0};
 const draw=(s:State,delta:number)=>{
  const r=canvas.getBoundingClientRect(),w=Math.max(1,Math.floor(r.width)),h=Math.max(1,Math.floor(r.height));
  if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);
  const halfWidth=2.08*w/h;if(camera.right!==halfWidth){camera.left=-halfWidth;camera.right=halfWidth;camera.updateProjectionMatrix();}
  const seated=s.config.presentation==='seated',blend=s.config.reducedMotion||lastSeated!==seated?1:1-Math.exp(-Math.min(delta,.1)*10),p=target(s),key=`${s.stage}:${s.pose}:${s.demonstration}`;
  lastSeated=seated;
  if(key!==demonstrationKey){demonstrationKey=key;demonstrationTime=performance.now();}
  const demonstrating=!s.config.reducedMotion&&performance.now()-demonstrationTime<300;
  player.pose(s.player,seated,blend);teacher.pose(demonstrating?neutral:p.target,seated,blend);ghost.pose(p.target,seated,1);chairs.forEach(c=>c.visible=seated);
  const color=new T.Color(s.feedback==='matched'?0x1ecf78:s.feedback==='near'?0xf69a35:0x2bbbdb);
  ghost.materials.forEach(m=>{m.color.lerp(color,.2);m.emissive.lerp(color,.2);m.opacity=.075;});
  ghost.limbMaterials.forEach((ms,i)=>ms.forEach(m=>{m.opacity=p.active.includes(LIMBS[i])?.66:.15;m.emissiveIntensity=p.active.includes(LIMBS[i])?.45:.2;}));
  ghost.joints.forEach((j,i)=>j.traverse(o=>{if(o.userData.activeMarker)o.visible=p.active.includes(LIMBS[i]);}));
  renderer.render(scene,camera);frames++;const now=performance.now();if(now-last>=1000){fps=frames*1000/(now-last);frames=0;last=now;}
 };
 return{draw,stats:()=>({fps,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries}),dispose:()=>{const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();scene.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();}};
}
