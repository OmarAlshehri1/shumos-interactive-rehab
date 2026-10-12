'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { distance, kindOf, pathPoint, radiusOf, summary, targetOf, type Point, type State } from '@/lib/bubblepopwall3d/engine';
import styles from './dome.module.css';

const C={brass:0xc49958,ink:0x5d527a,teal:0x3bc7b3,rose:0xe28bc0,lilac:0x9c7bd5,cream:0xfff4dd};
const world=(p:Point)=>new THREE.Vector3((p.x-.5)*10.8,3.7+(.5-p.y)*6,2.5);
const mat=(color:number,metalness=0,roughness=.55)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
function mesh(g:THREE.BufferGeometry,m:THREE.Material,parent:THREE.Object3D,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;}
function tube(points:THREE.Vector3[],radius:number,m:THREE.Material,parent:THREE.Object3D){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),64,radius,6,false),m,parent);}
function ring(r:number,width:number,m:THREE.Material,parent:THREE.Object3D,x=0,y=0,z=0){return mesh(new THREE.TorusGeometry(r,width,8,72),m,parent,x,y,z);}
function littleWorld(kind:number){
  const g=new THREE.Group(),gold=mat(C.brass,.65,.28),land=mat(kind===2?0xb9a5ef:0x45b894),trunk=mat(0x9a799d);
  const island=mesh(new THREE.DodecahedronGeometry(.65,1),land,g,0,-.32);island.scale.set(1,.32,.85);
  const underside=mesh(new THREE.ConeGeometry(.52,.55,7),mat(0xa4a3cc),g,0,-.62);underside.rotation.z=Math.PI;
  for(let i=0;i<5;i++){
    const a=i*2.4,x=Math.cos(a)*.4,z=Math.sin(a)*.35;
    if(kind===1){const star=mesh(new THREE.OctahedronGeometry(.11),gold,g,x,.15+(i%3)*.12,z);star.rotation.z=.4;
      tube([new THREE.Vector3(0,.45,0),new THREE.Vector3(x,.15+(i%3)*.12,z)],.009,gold,g);
    }else{
      mesh(new THREE.CylinderGeometry(.02,.035,.33,5),trunk,g,x,-.08,z);
      const crown=mesh(new THREE.IcosahedronGeometry(.16,1),mat(i%2?C.rose:C.teal),g,x,.12,z);crown.scale.set(.8,1.6,.8);
      mesh(new THREE.SphereGeometry(.045,8,6),gold,g,x,.35,z);
    }
  }
  // Original friendly light creature with eyes, ears and two wing-shaped fins.
  const creature=new THREE.Group();creature.position.set(.07,.25,.16);g.add(creature);
  const body=mesh(new THREE.SphereGeometry(.17,16,12),mat(C.cream),creature);body.scale.set(1,1.1,.9);
  for(const side of [-1,1]){
    const ear=mesh(new THREE.ConeGeometry(.045,.16,8),gold,creature,side*.095,.18);ear.rotation.z=-side*.4;
    mesh(new THREE.SphereGeometry(.022,8,6),mat(C.ink),creature,side*.055,.025,.145);
    const fin=mesh(new THREE.SphereGeometry(.085,10,8),mat(C.rose),creature,side*.2,-.03);fin.scale.set(1.2,.35,.7);fin.rotation.z=side*.3;
  }
  return g;
}
function bubble(kind:number,quality:string){
  const g=new THREE.Group();
  const glass=new THREE.MeshPhysicalMaterial({color:0xf4f7ff,metalness:0,roughness:.07,transmission:quality==='high'?.94:0,transparent:quality!=='high',opacity:quality==='high'?1:.17,thickness:.16,ior:1.15,clearcoat:1,iridescence:1,iridescenceIOR:1.3,envMapIntensity:1.3,side:THREE.FrontSide});
  mesh(new THREE.SphereGeometry(1,quality==='high'?48:24,quality==='high'?32:16),glass,g);
  const rim=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{tint:{value:new THREE.Color(C.lilac)}},vertexShader:'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 n; varying vec3 v;uniform vec3 tint; void main(){float f=pow(1.-abs(dot(normalize(n),normalize(v))),3.);gl_FragColor=vec4(mix(tint,vec3(1.),.55),f*.75);}' });
  mesh(new THREE.SphereGeometry(1.005,32,24),rim,g);
  const inside=littleWorld(kind);inside.scale.setScalar(.91);g.add(inside);
  // Curved pearly highlights and a tiny hanging brass ornament.
  const shine=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.7});
  for(const [start,length] of [[.5,.6],[1.5,.18]]){const arc=mesh(new THREE.TorusGeometry(.94,.016,5,40,length),shine,g,0,0,.2);arc.rotation.z=start;arc.rotation.y=.35;}
  mesh(new THREE.OctahedronGeometry(.08),mat(C.brass,.5),g,0,-1.12);
  return g;
}
export function DomeScene({state:s}: {state:State}){
  const host=useRef<HTMLDivElement>(null),latest=useRef(s),[failed,setFailed]=useState(false);
  useEffect(()=>{latest.current=s;},[s]);
  useEffect(()=>{
    const el=host.current;if(!el)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{queueMicrotask(()=>setFailed(true));return;}
    const scene=new THREE.Scene();scene.background=new THREE.Color(0xb9d5e1);scene.fog=new THREE.Fog(0xb9d5e1,23,55);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,s.config.quality==='high'?1.5:1));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
    el.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','قبة زجاجية وعوالم حية داخل فقاعات ثلاثية الأبعاد');
    const camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.set(0,5.2,18);camera.lookAt(0,3.4,0);
    const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xfef7eb,0x676d9d,1.1));
    const sun=new THREE.DirectionalLight(0xffefd5,2);sun.position.set(-8,14,6);scene.add(sun);
    const fill=new THREE.DirectionalLight(0x91ddd9,.8);fill.position.set(7,5,0);scene.add(fill);
    const brass=mat(C.brass,.7,.3),stone=mat(0xc3c2d9,.12,.6),light=new THREE.MeshBasicMaterial({color:0xfff2cf}),teal=new THREE.MeshBasicMaterial({color:C.teal});
    // Suspended observatory with inset flooring, raised dais, radial inlays, and a ribbed glass canopy.
    const floor=mesh(new THREE.CylinderGeometry(12,12.4,.32,80),stone,scene,0,-.9,-3);
    for(const r of [3.4,6.5,9,11.6]){const o=ring(r,.035,brass,scene,0,-.71,-3);o.rotation.x=Math.PI/2;}
    for(let i=0;i<24;i++){
      const a=i*Math.PI/12;
      // Leave the front interaction window unobstructed; retain the side and rear glass ribs.
      if(Math.sin(a)>.25)continue;
      const inlay=mesh(new THREE.BoxGeometry(.025,.012,11),brass,scene,Math.sin(a)*5.5,-.73,-3+Math.cos(a)*5.5);inlay.rotation.y=a;
      const pts=Array.from({length:41},(_,j)=>{const b=j/40*Math.PI/2;return new THREE.Vector3(Math.cos(a)*12*Math.cos(b),-.7+12*Math.sin(b),-3+Math.sin(a)*12*Math.cos(b));});tube(pts,.04,brass,scene);
      if(i%2===0){mesh(new THREE.CylinderGeometry(.13,.2,4,8),stone,scene,Math.cos(a)*11.7,1.3,-3+Math.sin(a)*11.7);}
    }
    for(const elevation of [3,6,9]){const r=Math.sqrt(144-(elevation+.7)**2);const rail=ring(r,.025,brass,scene,0,elevation,-3);rail.rotation.x=Math.PI/2;}
    const dome=mesh(new THREE.SphereGeometry(11.95,48,24,0,Math.PI*2,0,Math.PI/2),new THREE.MeshPhysicalMaterial({color:0xcbeaf2,transparent:true,opacity:.08,roughness:.25,side:THREE.BackSide,depthWrite:false}),scene,0,-.7,-3);dome.renderOrder=-1;
    mesh(new THREE.CylinderGeometry(2.1,2.5,.22,64),stone,scene,0,-.55,-3);
    mesh(new THREE.CylinderGeometry(1.5,1.8,.24,64),brass,scene,0,-.35,-3);
    const sculpture=new THREE.Group();sculpture.position.set(0,1.6,-3);scene.add(sculpture);
    mesh(new THREE.CylinderGeometry(.08,.2,2.6,12),brass,sculpture,0,-.2);
    const orbital:THREE.Mesh[]=[];
    for(let i=0;i<3;i++){const r=ring(1+i*.25,.025,i===1?teal:brass,sculpture);r.rotation.set(i*.7+.4,i*.8,0);orbital.push(r);}
    const crystal=mesh(new THREE.OctahedronGeometry(.48),new THREE.MeshPhysicalMaterial({color:C.cream,metalness:.1,roughness:.1,transmission:.35,emissive:C.cream,emissiveIntensity:.15}),sculpture,0,.15);
    // Cloud sea and distant miniature floating islands, individually placed for a layered horizon.
    const cloudmat=new THREE.MeshStandardMaterial({color:0xfff8ef,roughness:1,transparent:true,opacity:.72});
    const clouds=new THREE.Group();scene.add(clouds);
    for(let i=0;i<32;i++){const a=i*2.4,r=15+(i%5)*2;const c=mesh(new THREE.SphereGeometry(1.5,12,8),cloudmat,clouds,Math.cos(a)*r,-1.4+(i%4)*.3,-14+Math.sin(a)*8);c.scale.set(2,.45,1);}
    for(const [x,y,z,k] of [[-9,4,-15,0],[9,5,-18,1],[-5,6,-23,2],[5,3,-12,0]]){const island=littleWorld(k);island.position.set(x,y,z);island.scale.setScalar(2.2);scene.add(island);}
    const dustgeo=new THREE.BufferGeometry(),positions=new Float32Array(90*3);
    for(let i=0;i<90;i++){positions[i*3]=Math.sin(i*17.3)*11;positions[i*3+1]=1+(i%23)*.35;positions[i*3+2]=Math.cos(i*7.1)*8-4;}
    dustgeo.setAttribute('position',new THREE.BufferAttribute(positions,3));scene.add(new THREE.Points(dustgeo,new THREE.PointsMaterial({color:0xffedbd,size:.035,transparent:true,opacity:.7})));
    const active=bubble(0,s.config.quality);scene.add(active);
    const containedWorlds=[active.children[2],littleWorld(1),littleWorld(2)];
    for(const w of containedWorlds.slice(1)){w.scale.setScalar(.91);active.add(w);}
    const satellites=[bubble(1,s.config.quality),bubble(2,s.config.quality)];satellites.forEach((b,i)=>{b.scale.setScalar(.62);b.position.set(i?-5.8:5.8,4.4+i,-4);scene.add(b);});
    const target=new THREE.Group();scene.add(target);
    const targetRing=ring(.9,.045,light,target);ring(1.02,.015,brass,target);
    for(let i=0;i<4;i++){const mark=mesh(new THREE.OctahedronGeometry(.1),brass,target,Math.cos(i*Math.PI/2)*1.16,Math.sin(i*Math.PI/2)*1.16);mark.rotation.z=Math.PI/4;}
    const halo=ring(.85,.035,teal,target);halo.rotation.x=.05;
    const hand=new THREE.Group();scene.add(hand);
    const handmat=new THREE.MeshStandardMaterial({color:0xfff3db,emissive:0xeab975,emissiveIntensity:.15,roughness:.28,metalness:.15});
    const palm=mesh(new THREE.SphereGeometry(.13,16,12),handmat,hand);palm.scale.set(1,1.2,.35);
    for(let i=0;i<4;i++){const finger=mesh(new THREE.CapsuleGeometry(.024,.13+(i===1?.04:0),4,8),handmat,hand,-.075+i*.05,.17);finger.rotation.z=(i-1.5)*-.07;}
    const thumb=mesh(new THREE.CapsuleGeometry(.035,.13,4,8),handmat,hand,-.16,.02);thumb.rotation.z=-.8;
    const handRing=ring(.3,.018,teal,hand);handRing.rotation.z=Math.PI/4;
    const reward=new THREE.Group();scene.add(reward);const worlds:THREE.Group[]=[];
    for(let i=0;i<9;i++){const w=littleWorld(i%3);w.scale.setScalar(.7);w.position.set((i%2?-1:1)*(2.4+Math.floor(i/2)*.7),1.2+Math.floor(i/2)*.55,-3.5);w.visible=false;worlds.push(w);reward.add(w);}
    const releaseRing=ring(1,.025,light,scene);releaseRing.visible=false;
    let corridor:THREE.Group|null=null,key='',animation=0,frames=0,windowAt=performance.now(),lastReward=0,releaseAt=-Infinity,disposed=false;
    const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(w&&h){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}};
    const observer=new ResizeObserver(resize);observer.observe(el);resize();
    const render=(now:number)=>{
      if(disposed)return;const st=latest.current,cfg=st.config,motion=!cfg.reducedMotion&&st.status==='running';const t=motion?now/1000:0;
      const cur=world(st.cursor),goal=world(targetOf(st)),kind=kindOf(st);
      const sceneKey=`${st.run}:${st.stage}:${st.objective}:${cfg.range}:${cfg.placement}:${cfg.highContrast}`;
      if(sceneKey!==key){key=sceneKey;if(corridor){scene.remove(corridor);corridor.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});}
        corridor=new THREE.Group();scene.add(corridor);
        if(kind==='guide'){
          const pts=Array.from({length:25},(_,i)=>world(pathPoint(st,i/24)));
          const width=radiusOf(st)*5;
          tube(pts,width,new THREE.MeshBasicMaterial({color:cfg.highContrast?0x233653:0x8ce0d7,transparent:true,opacity:cfg.highContrast?.35:.16,depthWrite:false}),corridor);
          for(const side of [-1,1])tube(pts.map(p=>p.clone().add(new THREE.Vector3(0,side*width,0))),.024,new THREE.MeshBasicMaterial({color:cfg.highContrast?0x263b5c:0x82cac3}),corridor);
          for(let i=1;i<6;i++){const diamond=mesh(new THREE.OctahedronGeometry(.075),brass,corridor);diamond.position.copy(world(pathPoint(st,i/6)));}
        }
      }
      target.position.copy(goal);target.position.z=2.65;target.scale.set(radiusOf(st)*10.8/.9,radiusOf(st)*6/.9,1);
      targetRing.material=cfg.highContrast?brass:light;
      const bubblePosition=kind==='guide'||kind==='hold'?cur:goal;active.position.copy(bubblePosition);active.position.y+=motion?Math.sin(t*1.1)*.045:0;
      const rim=active.children[1] as THREE.Mesh<THREE.SphereGeometry,THREE.ShaderMaterial>;
      rim.material.uniforms.tint.value.setHex(st.accepted?C.teal:distance(st.cursor,targetOf(st))<radiusOf(st)*1.7?C.brass:C.lilac);
      const bubbleScale=cfg.targetSize*8.5;active.scale.setScalar(bubbleScale*(1+(motion?Math.sin(t*1.8)*.006:0)));
      active.visible=kind!=='neutral'&&st.status!=='ended'&&st.status!=='stage-complete';
      containedWorlds.forEach((w,i)=>{w.visible=i===[0,1,2,0,1,2,1,0,2][st.stage];w.rotation.y=motion?Math.sin(t*.3)*.12:0;});
      if(motion)hand.position.lerp(cur,.25);else hand.position.copy(cur);hand.position.z=3.8;hand.rotation.y=st.config.hand==='LEFT_HAND'?Math.PI:0;
      halo.scale.setScalar(1+st.hold/Math.max(350,cfg.holdMs)*.12);halo.visible=st.accepted;
      if(motion){orbital.forEach((o,i)=>o.rotation.y+=.001*(i+1));crystal.rotation.y+=.002;clouds.position.x=Math.sin(t*.05)*.12;}
      const n=summary(st).completed;worlds.forEach((w,i)=>{w.visible=i<st.completed.length;if(motion&&w.visible)w.rotation.y=Math.sin(t*.4+i)*.1;});
      crystal.scale.setScalar(1+Math.min(48,n)*.018);
      if(n>lastReward){releaseAt=now;releaseRing.position.copy(active.position);}lastReward=n;
      const age=(now-releaseAt)/1800;releaseRing.visible=age<1&&age>=0&&!cfg.reducedMotion;if(releaseRing.visible){releaseRing.scale.setScalar(1+age*2);(releaseRing.material as THREE.MeshBasicMaterial).transparent=true;(releaseRing.material as THREE.MeshBasicMaterial).opacity=(1-age)*.7;}
      satellites.forEach((b,i)=>{if(motion)b.position.y=4.4+i+Math.sin(t*.6+i)*.12;});
      renderer.render(scene,camera);frames++;
      if(now-windowAt>2000){el.dataset.fps=(frames*1000/(now-windowAt)).toFixed(1);el.dataset.calls=String(renderer.info.render.calls);el.dataset.triangles=String(renderer.info.render.triangles);el.dataset.geometries=String(renderer.info.memory.geometries);el.dataset.textures=String(renderer.info.memory.textures);frames=0;windowAt=now;}
      animation=requestAnimationFrame(render);
    };animation=requestAnimationFrame(render);
    return()=>{disposed=true;cancelAnimationFrame(animation);observer.disconnect();scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});floor.geometry.dispose();env.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[s.config.quality]);
  return <div ref={host} className={styles.canvas} data-testid="dome-scene">{failed&&<div className={styles.noGL}>تعذّر تشغيل العرض ثلاثي الأبعاد. تحقق من دعم WebGL في جهاز العرض.</div>}</div>;
}
