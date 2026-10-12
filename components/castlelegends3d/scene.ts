import * as T from 'three';
import {STAGES,ENEMIES} from '@/lib/castlelegends3d/curriculum';
import {exercise,encounterDistance,type State} from '@/lib/castlelegends3d/engine';
import {humanoid,enemy,material,part} from './rig';
import {createWorld,disposeObjects,lights} from './world';
export function createCastleScene(canvas:HTMLCanvasElement,initial:State){
 const renderer=new T.WebGLRenderer({canvas,antialias:initial.config.quality==='high',powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,initial.config.quality==='high'?1.65:1));renderer.shadowMap.enabled=initial.config.quality==='high';renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.info.autoReset=false;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(49,1,.1,200),world=createWorld(scene,initial.stage,initial.config.quality),sun=lights(scene,STAGES[initial.stage]);
 const hero=humanoid();scene.add(hero.root);hero.root.position.set(-.25,0,0);
 const enemies=STAGES[initial.stage].enemies.map((kind,i)=>{const rig=enemy(kind);rig.root.position.z=-encounterDistance(i)-4.7;scene.add(rig.root);return rig;});
 const instructorScene=new T.Scene();instructorScene.add(new T.HemisphereLight(0xffffff,0x6c8390,2.4));const key=new T.DirectionalLight(0xffeed5,3);key.position.set(-3,5,4);instructorScene.add(key);
 const instructor=humanoid(true);instructor.root.rotation.y=Math.PI;instructorScene.add(instructor.root);const instructorCamera=new T.PerspectiveCamera(35,1,.1,30);instructorCamera.position.set(0,1.45,5.3);instructorCamera.lookAt(0,1.1,0);
 part(instructorScene,new T.CylinderGeometry(1.25,1.25,.06,48),material(0x1d3440,.3),0,-.06,0);
 const chair=new T.Group();instructorScene.add(chair);const seat=material(0x294957,.3,.4);part(chair,new T.BoxGeometry(.68,.1,.7),seat,0,.67,0);part(chair,new T.BoxGeometry(.68,.65,.08),seat,0,1,-.36);for(const x of [-.28,.28])for(const z of [-.25,.25])part(chair,new T.CylinderGeometry(.025,.025,.67,6),seat,x,.3,z);
 const matColors={blue:0x62b8ee,orange:0xe9b06b,green:0x7bc7a5};const mat=new T.Group();instructorScene.add(mat);for(const [name,color] of Object.entries(matColors)){const i=Object.keys(matColors).indexOf(name);const circle=part(mat,new T.CylinderGeometry(.2,.2,.025,24),material(color), (i-1)*.6,-.015,.6);circle.userData.target=name;}
 const haloMat=new T.MeshBasicMaterial({color:STAGES[initial.stage].accent,transparent:true,opacity:.7,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending});
 const slash=part(scene,new T.TorusGeometry(1.2,.035,8,64,Math.PI*1.5),haloMat);slash.visible=false;
 const projectile=part(scene,new T.IcosahedronGeometry(.2,2),new T.MeshBasicMaterial({color:0xb0eaff}));projectile.visible=false;
 const pulse=part(scene,new T.TorusGeometry(1,.055,6,64),haloMat);pulse.rotation.x=Math.PI/2;pulse.visible=false;
 const glow=new T.PointLight(0x8cceff,0,12);scene.add(glow);
 const shardData=new Float32Array(120*3);for(let i=0;i<120;i++){shardData[i*3]=Math.sin(i*3)*2;shardData[i*3+1]=.2+(i%17)/6;shardData[i*3+2]=Math.cos(i*7)*2;}const shardsGeo=new T.BufferGeometry();shardsGeo.setAttribute('position',new T.BufferAttribute(shardData,3));const shards=new T.Points(shardsGeo,new T.PointsMaterial({color:STAGES[initial.stage].accent,size:.085,transparent:true,opacity:.85,depthWrite:false,blending:T.AdditiveBlending}));scene.add(shards);shards.visible=false;
 let w=0,h=0,time=0,disposed=false;const target=new T.Vector3(),look=new T.Vector3(),camGoal=new T.Vector3();
 function resize(){const rect=canvas.getBoundingClientRect();const width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));if(width===w&&height===h)return;w=width;h=height;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 const observer=new ResizeObserver(resize);observer.observe(canvas);resize();camera.position.set(1.65,3.1,5.8);
 function draw(s:State,dt:number){if(disposed)return;resize();renderer.info.reset();const active=s.status==='running';if(active)time+=Math.min(dt,.05);const reduced=s.config.reducedMotion;const walk=active&&s.phase==='travel';const phase=Math.min(1,s.phaseMs/1100);hero.root.position.z=T.MathUtils.damp(hero.root.position.z,-s.distance,8,dt);hero.body.position.y=walk&&!reduced?Math.sin(time*9)*.03:0;
 for(const [limb,joint] of Object.entries(hero.joints)){joint.rotation.set(0,0,0);if(walk)joint.rotation.x=Math.sin(time*7+(limb.startsWith('right')?0:Math.PI))*(limb.endsWith('Leg')?.36:.23);if(limb.endsWith('Leg'))(joint.userData.knee as T.Group).rotation.x=walk?Math.max(0,Math.sin(time*7+(limb.startsWith('right')?0:Math.PI)))*.45:0;}
 if(s.phase==='attack'){hero.joints.rightArm.rotation.z=-Math.sin(phase*Math.PI)*1.3;hero.joints.rightArm.rotation.x=-Math.sin(phase*Math.PI)*1.7;hero.body.rotation.y=Math.sin(phase*Math.PI)*.4;}else hero.body.rotation.y=0;
 if(hero.cape){const a=hero.cape.geometry.attributes.position;for(let i=0;i<a.count;i++){const y=a.getY(i);a.setZ(i,Math.sin(time*3+a.getX(i)*5-y*4)*.045*(-y)+Math.max(0,-y)*.15);}a.needsUpdate=true;hero.cape.geometry.computeVertexNormals();}
 enemies.forEach((e,i)=>{const current=i===s.encounter;const resolved=i<s.encounter||s.phase==='victory'||s.status==='stage-complete'||s.status==='ended';e.root.visible=!resolved;const b=ENEMIES[STAGES[s.stage].enemies[i]].scale;e.root.scale.setScalar(b);e.body.rotation.z=0;e.root.position.y=0;
 if(current&&s.phase==='attack'){e.body.rotation.z=Math.sin(phase*Math.PI*3)*.08;e.root.position.z=-encounterDistance(i)-4.7-Math.sin(phase*Math.PI)*.22;}else e.root.position.z=-encounterDistance(i)-4.7;
 if(current&&s.phase==='defeat'){const p=Math.min(1,s.phaseMs/1800);e.root.scale.setScalar(b*(1-p));e.root.position.y=p*1.5;e.body.rotation.y=p*2;}else if(!reduced)e.body.position.y=Math.sin(time*1.3+i)*.025;
 });
 const enemyZ=-encounterDistance(s.encounter)-4.7;
 slash.visible=projectile.visible=pulse.visible=s.phase==='attack';glow.intensity=s.phase==='attack'?4:0;
 if(s.phase==='attack'){slash.position.set(0,1.4,hero.root.position.z-1);slash.rotation.set(0,phase*4,phase*4);slash.scale.setScalar(.7+phase*.8);haloMat.opacity=Math.sin(phase*Math.PI)*.7;projectile.position.set(0,1.4,-s.distance+(enemyZ+s.distance)*phase);projectile.scale.setScalar(.7+Math.sin(phase*Math.PI));pulse.position.set(0,.12,enemyZ);pulse.scale.setScalar(.4+phase*2.5);glow.position.copy(projectile.position);}
 shards.visible=s.phase==='defeat'||s.phase==='victory';if(shards.visible){const p=Math.min(1,s.phaseMs/(s.phase==='victory'?2600:1800));shards.position.set(0,p*2,s.phase==='victory'?hero.root.position.z-3:enemyZ);shards.scale.setScalar(.3+p*3);shards.rotation.y=reduced?0:p*1.5;(shards.material as T.PointsMaterial).opacity=(1-p)*.9;}
 world.motes.rotation.y=reduced?0:Math.sin(time*.1)*.015;
 camGoal.set(1.45,3.1,hero.root.position.z+6.1);if(s.phase==='intro'&&!reduced){camGoal.x=3.6;camGoal.y=3.5;}if(s.phase==='victory'&&!reduced){camGoal.x=3;camGoal.y=3.7;}camera.position.lerp(camGoal,1-Math.exp(-dt*3));look.set(0,1.45,hero.root.position.z-5.5);camera.lookAt(look);sun.position.z=hero.root.position.z+12;sun.target.position.z=hero.root.position.z-8;sun.target.updateMatrixWorld();
 const prompt=exercise(s);const cycle=reduced?.8:(1-Math.cos(((time+s.demonstration*.9)%4.8)/4.8*Math.PI*2))/2;const amount=cycle*s.config.movementScale;const success=s.phase==='attack'&&s.lastOutcome!=='skipped';
 instructor.root.position.y=s.config.presentation==='seated'?-.36:0;chair.visible=s.config.presentation==='seated';mat.visible=s.config.mat;
 for(const circle of mat.children){const m=(circle as T.Mesh).material as T.MeshStandardMaterial;m.emissive.set(circle.userData.target===s.config.matTarget?matColors[s.config.matTarget]:0);m.emissiveIntensity=.4;}
 for(const [limb,joint] of Object.entries(instructor.joints)){const key=limb as keyof typeof instructor.joints;const moving=prompt.limbs.includes(key);const sign=limb.startsWith('right')?-1:1;const leg=limb.endsWith('Leg');const m=instructor.highlights[key];m.color.set(moving?(success?0x75d99b:0xf0af63):0xd8e0da);m.emissive.set(moving?(success?0x307e53:0x7f491d):0);m.emissiveIntensity=.28;
 joint.rotation.set(0,0,0);if(leg){joint.rotation.x=s.config.presentation==='seated'?-Math.PI/2:0;(joint.userData.knee as T.Group).rotation.x=s.config.presentation==='seated'?Math.PI/2:0;if(moving){joint.rotation.z=sign*amount*.3;if(s.config.presentation==='seated')joint.rotation.x-=amount*.2;}}
 else {const elbow=joint.userData.elbow as T.Group;elbow.rotation.x=0;if(moving){if(prompt.pose==='reach'||prompt.pose==='center'){joint.rotation.x=-amount*1.3;elbow.rotation.x=-.3*amount;}else joint.rotation.z=sign*amount*(prompt.pose==='raise'?2.25:1.3);}}
 }
 renderer.setScissorTest(false);renderer.setViewport(0,0,w,h);renderer.setClearColor(STAGES[s.stage].sky,1);renderer.clear();renderer.render(scene,camera);
 const iw=Math.max(125,Math.min(240,w*.23)),ih=Math.max(165,Math.min(315,h*.48));instructorCamera.aspect=iw/ih;instructorCamera.updateProjectionMatrix();renderer.setScissorTest(true);renderer.setScissor(18,20,iw,ih);renderer.setViewport(18,20,iw,ih);renderer.setClearColor(0x10232e,1);renderer.clear();renderer.render(instructorScene,instructorCamera);renderer.setScissorTest(false);
 target.copy(hero.root.position);
 }
 return {draw,stats:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,quality:initial.config.quality}),dispose(){disposed=true;observer.disconnect();disposeObjects(scene);disposeObjects(instructorScene);sun.shadow.map?.dispose();renderer.dispose();}};
}
