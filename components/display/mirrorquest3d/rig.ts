import * as T from 'three';
import { LIMBS, type Character, type Features } from '@/lib/mirrorquest3d/engine';
export interface Rig { root:T.Group; joints:T.Group[]; hinges:T.Group[]; feet:T.Group[]; materials:T.MeshStandardMaterial[]; limbMaterials:T.MeshStandardMaterial[][]; pose:(features:Features,seated:boolean,blend:number)=>void }
export const SEAT_HEIGHT=.7;
const SEATED_DROP=.39;
const SEATED_HIP=-Math.acos((1.25-SEATED_DROP-.53-.18)/.54);
const PALETTE={lion:0xdba344,rabbit:0xa397cf,bear:0x936b53,fox:0xdb7946};
/** All costumes use the same connected skeleton and segment lengths. Features are illustrative, not joint measurements. */
export function makeRig(character:Character,ghost=false):Rig {
 const root=new T.Group(),body=new T.Group();root.add(body);
 const joints:T.Group[]=[],hinges:T.Group[]=[],feet:T.Group[]=[],materials:T.MeshStandardMaterial[]=[],limbMaterials:T.MeshStandardMaterial[][]=[];
 const sphere=new T.SphereGeometry(1,24,16);
 const material=(color:number)=>{const m=new T.MeshStandardMaterial({color,roughness:.58,metalness:.02,transparent:ghost,opacity:ghost?.5:1,depthWrite:!ghost,emissive:ghost?0x2bd5e8:0,emissiveIntensity:ghost?.8:0});materials.push(m);return m;};
 const suit=material(PALETTE[character]),cream=material(0xf4e5cc),skin=material(0xeec3a1),dark=material(0x302a39),white=material(0xfffaf0),pink=material(0xe89d98),trim=material(0x4c6262);
 const ball=(parent:T.Object3D,m:T.Material,p:number[],s:number[])=>{const mesh=new T.Mesh(sphere,m);mesh.position.set(p[0],p[1],p[2]);mesh.scale.set(s[0],s[1],s[2]);mesh.castShadow=!ghost;mesh.receiveShadow=!ghost;parent.add(mesh);return mesh;};
 ball(body,suit,[0,1.65,0],[.32,.43,.23]);ball(body,cream,[0,1.66,.212],[.22,.30,.036]);
 ball(body,suit,[0,1.27,0],[.29,.18,.21]).name='costume-pelvis';
 ball(body,trim,[0,1.35,.01],[.295,.046,.22]);ball(body,cream,[0,1.35,.233],[.048,.047,.012]);
 ball(body,skin,[0,2.04,.01],[.13,.14,.12]);
 ball(body,suit,[0,2.43,0],[.37,.39,.32]);
 if(character==='lion')for(let i=0;i<14;i++){const a=i*Math.PI/7;ball(body,trim,[Math.cos(a)*.35,2.43+Math.sin(a)*.37,-.055],[.115,.13,.115]);}
 for(const sign of [-1,1]){
  const rabbit=character==='rabbit',fox=character==='fox';
  const ear=ball(body,suit,[sign*(rabbit?.21:.29),rabbit?2.96:2.77,-.015],[rabbit?.08:.12,rabbit?.32:fox?.18:.12,.075]);ear.rotation.z=sign*(rabbit?-.08:fox?-.28:0);
  const inside=ball(body,rabbit?pink:cream,[sign*(rabbit?.21:.29),rabbit?2.97:2.78,.055],[rabbit?.042:.07,rabbit?.235:fox?.10:.065,.016]);inside.rotation.z=ear.rotation.z;
 }
 if(!ghost){
 ball(body,skin,[0,2.4,.255],[.285,.28,.119]);
 ball(body,dark,[0,2.64,.292],[.25,.065,.06]).rotation.z=.09;
 for(const sign of [-1,1]){
  ball(body,white,[sign*.105,2.44,.361],[.062,.076,.019]);ball(body,dark,[sign*.105,2.437,.38],[.029,.044,.014]);ball(body,white,[sign*.097,2.451,.393],[.010,.013,.007]);
  ball(body,pink,[sign*.185,2.355,.353],[.046,.024,.008]);ball(body,dark,[sign*.105,2.54,.355],[.052,.012,.01]).rotation.z=-sign*.12;
 }
 ball(body,skin,[0,2.391,.382],[.025,.03,.016]);
 const smile=new T.QuadraticBezierCurve3(new T.Vector3(-.06,2.335,.369),new T.Vector3(0,2.283,.391),new T.Vector3(.06,2.335,.369));body.add(new T.Mesh(new T.TubeGeometry(smile,12,.009,6,false),dark));
 // Small costume fasteners make the common silhouette feel like tailored clothing.
 for(const y of [1.77,1.61])ball(body,trim,[0,y,.253],[.021,.021,.009]);
 if(character==='bear')ball(body,cream,[0,2.79,.12],[.1,.065,.05]);
 }
 for(let i=0;i<4;i++){
  const arm=i<2,sign=i%2===0?-1:1,upper=arm?.45:.54,lower=arm?.42:.53;
  const limbSuit=ghost?material(0x44cde1):suit,limbTip=ghost?limbSuit:arm?skin:cream;
  limbMaterials.push(ghost?[limbSuit]:[]);
  const joint=new T.Group();joint.position.set(sign*(arm?.34:.17),arm?1.96:1.25,0);body.add(joint);joints.push(joint);
  ball(joint,limbSuit,[0,0,0],[arm?.13:.145,.13,.13]);
  ball(joint,limbSuit,[0,-upper/2,0],[arm?.115:.13,upper/2+.07,.115]);
  const hinge=new T.Group();hinge.position.y=-upper;joint.add(hinge);hinges.push(hinge);
  ball(hinge,limbSuit,[0,0,0],[.105,.105,.108]);ball(hinge,limbSuit,[0,-lower/2,0],[arm?.095:.112,lower/2+.035,.1]);
  const end=new T.Group();end.position.y=-lower;hinge.add(end);feet.push(end);
  if(arm){ball(end,limbTip,[0,-.085,.018],[.10,.135,.07]);if(!ghost)ball(end,skin,[sign*.087,-.04,.02],[.035,.065,.04]);}
  else {ball(end,limbSuit,[0,-.04,.045],[.13,.10,.17]);ball(end,limbTip,[0,-.10,.085],[.14,.08,.22]);ball(end,ghost?limbSuit:trim,[0,-.157,.085],[.144,.025,.225]);}
  if(ghost){const marker=new T.Mesh(new T.TorusGeometry(arm?.145:.155,.019,6,24),limbSuit);marker.position.z=.14;marker.userData.activeMarker=true;hinge.add(marker);}
 }
 return{root,joints,hinges,feet,materials,limbMaterials,pose:(f,seated,blend)=>{
  body.position.y=T.MathUtils.lerp(body.position.y,seated?-SEATED_DROP:0,blend);
  LIMBS.forEach((limb,i)=>{
   const sign=i%2===0?-1:1,value=f[limb],arm=i<2;
   const z=arm?sign*(.12+value*2.74):sign*value*.06;
   const x=arm?-.035:seated?SEATED_HIP-Math.sqrt(value)*.45:-Math.sqrt(value)*1.25;
   const bend=arm?sign*(.16*(1-value)+.05):seated?-SEATED_HIP+Math.sqrt(value)*.65:Math.sqrt(value)*1.4;
   joints[i].rotation.z=T.MathUtils.lerp(joints[i].rotation.z,z,blend);joints[i].rotation.x=T.MathUtils.lerp(joints[i].rotation.x,x,blend);
   hinges[i].rotation[arm?'z':'x']=T.MathUtils.lerp(hinges[i].rotation[arm?'z':'x'],bend,blend);
   if(!arm){feet[i].rotation.x=T.MathUtils.lerp(feet[i].rotation.x,-x-bend,blend);feet[i].rotation.z=T.MathUtils.lerp(feet[i].rotation.z,-z,blend);}
  });
 }};
}
