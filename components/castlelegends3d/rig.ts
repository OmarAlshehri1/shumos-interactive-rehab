import * as T from 'three';
import type {Limb,EnemyKind} from '@/lib/castlelegends3d/curriculum';
import {ENEMIES} from '@/lib/castlelegends3d/curriculum';
export function material(color:number,metalness=0,roughness=.7){return new T.MeshStandardMaterial({color,metalness,roughness});}
export function part(parent:T.Object3D,g:T.BufferGeometry,m:T.Material,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
export function humanoid(instructor=false){
 const root=new T.Group(),body=new T.Group();root.add(body);
 const armor=material(instructor?0xe7e3d6:0x344d65,.45,.35),cloth=material(instructor?0x247f82:0x244465),gold=material(0xd6bd83,.65,.28),skin=material(0xc89878),dark=material(0x28313b),hair=material(0x3d2c25);
 const joints={} as Record<Limb,T.Group>,highlights={} as Record<Limb,T.MeshStandardMaterial>;
 part(body,new T.CapsuleGeometry(.29,.42,6,12),armor,0,1.35,0);
 part(body,new T.SphereGeometry(.195,16,12),skin,0,2.02,0);
 part(body,new T.SphereGeometry(.215,16,12,0,Math.PI*2,0,Math.PI*.6),hair,0,2.055,0);
 // Face points along -Z, the direction of travel; instructor is turned toward the viewer.
 part(body,new T.SphereGeometry(.065,8,6),skin,0,1.99,-.175);
 for(const x of [-.083,.083])part(body,new T.SphereGeometry(.023,8,6),dark,x,2.045,-.185);
 part(body,new T.TorusGeometry(.27,.035,6,24),gold,0,1.12,0).rotation.x=Math.PI/2;
 for(const [name,sign] of [['rightArm',-1],['leftArm',1]] as const){const joint=new T.Group();joint.position.set(sign*.36,1.66,0);body.add(joint);joints[name]=joint;const m=armor.clone();highlights[name]=m;
  part(joint,new T.SphereGeometry(.16,12,8),m,0,0,0);part(joint,new T.CapsuleGeometry(.085,.29,5,10),cloth,0,-.25,0);
  const elbow=new T.Group();elbow.position.y=-.45;joint.add(elbow);part(elbow,new T.CapsuleGeometry(.075,.27,5,10),m,0,-.17,0);part(elbow,new T.SphereGeometry(.085,10,8),skin,0,-.39,0);joint.userData.elbow=elbow;
 }
 for(const [name,sign] of [['rightLeg',-1],['leftLeg',1]] as const){const joint=new T.Group();joint.position.set(sign*.17,1.05,0);body.add(joint);joints[name]=joint;const m=armor.clone();highlights[name]=m;part(joint,new T.CapsuleGeometry(.105,.29,5,10),cloth,0,-.24,0);const knee=new T.Group();knee.position.y=-.46;joint.add(knee);part(knee,new T.CapsuleGeometry(.09,.3,5,10),m,0,-.22,0);part(knee,new T.BoxGeometry(.21,.14,.38),dark,0,-.46,-.08);joint.userData.knee=knee;}
 let cape:T.Mesh<T.PlaneGeometry,T.MeshStandardMaterial>|null=null;
 if(!instructor){
 // Layered armor, leather harness, swept hair and an original tapered cloth cape.
 for(const x of [-.24,.24]){const pauldron=part(body,new T.SphereGeometry(.18,12,8),gold,x*1.5,1.68,0);pauldron.scale.set(1.2,.55,1);part(body,new T.BoxGeometry(.13,.24,.34),armor,x*.7,.54,-.035);}
 for(let i=0;i<8;i++){const strand=part(body,new T.CapsuleGeometry(.035,.2,3,6),hair,Math.sin(i*1.9)*.14,2.19,Math.cos(i*1.9)*.1);strand.rotation.z=(i-4)*.07;strand.rotation.x=.7;}
 const harness=part(body,new T.BoxGeometry(.055,.53,.025),dark,.08,1.36,-.285);harness.rotation.z=.45;
 part(body,new T.BoxGeometry(.33,.08,.25),gold,0,1.66,-.1);
 const shield=part(body,new T.SphereGeometry(.32,12,8),armor,.4,1.26,.23);shield.scale.set(1,1.25,.22);part(body,new T.TorusGeometry(.28,.024,5,24),gold,.4,1.26,.305);
 const geo=new T.PlaneGeometry(.82,1.2,8,12);geo.translate(0,-.6,0);const cp=geo.attributes.position;for(let i=0;i<cp.count;i++)cp.setX(i,cp.getX(i)*(.65+.4*(-cp.getY(i))));cape=new T.Mesh(geo,material(0x1d4766));cape.material.side=T.DoubleSide;cape.position.set(0,1.7,.22);cape.rotation.x=-.12;body.add(cape);
 const sword=new T.Group();sword.position.set(0,-.8,0);joints.rightArm.add(sword);const blade=part(sword,new T.BoxGeometry(.09,.83,.035),material(0xb7e2ee,.8,.15),0,-.4,0);(blade.material as T.MeshStandardMaterial).emissive=new T.Color(0x366b82);part(sword,new T.BoxGeometry(.32,.055,.06),gold);part(sword,new T.CylinderGeometry(.038,.038,.17,10),dark,0,.11,0);
 part(body,new T.TorusGeometry(.17,.02,5,16),gold,0,1.49,-.29);for(let i=0;i<3;i++)part(body,new T.BoxGeometry(.31,.04,.035),gold,0,1.2+i*.12,-.27);
 }
 return {root,body,joints,highlights,cape};
}
export function enemy(kind:EnemyKind){const def=ENEMIES[kind],rig=humanoid();rig.root.scale.setScalar(def.scale);const stone=material(def.color,kind==='knight'?.8:.25,.45),glow=material(0x94eafb,.45,.22);glow.emissive.set(0x51a6c8);glow.emissiveIntensity=1.4;
 const discarded=new Set<T.Material>();rig.root.traverse(o=>{if(o instanceof T.Mesh&&o!==rig.cape){for(const m of Array.isArray(o.material)?o.material:[o.material])discarded.add(m);o.material=stone;if(o.parent===rig.body&&o.position.y>1.9)o.visible=false;}});discarded.forEach(m=>m.dispose());
 // Faceted helmets and layered breastplates give guardians a nonhuman silhouette.
 const mask=part(rig.body,new T.IcosahedronGeometry(.31,1),stone,0,2.06,0);mask.scale.set(1,1.25,.78);
 for(const x of [-.105,.105]){const eye=part(rig.body,new T.BoxGeometry(.11,.035,.04),glow,x,2.12,-.25);eye.rotation.z=x>0?-.2:.2;}
 const plate=part(rig.body,new T.IcosahedronGeometry(.34,1),stone,0,1.42,-.13);plate.scale.set(1.1,1.4,.68);
 const trim=material(kind==='forest'?0x405b4a:0x3a4350,.5,.55);for(const x of [-.32,.32]){const shoulder=part(rig.body,new T.IcosahedronGeometry(.2,1),trim,x,1.68,0);shoulder.scale.set(1.25,.75,1.2);}
 for(let i=0;i<3;i++)part(rig.body,new T.BoxGeometry(.37,.035,.06),trim,0,1.25+i*.13,-.33);
if(rig.cape)rig.cape.visible=kind==='knight'||kind==='boss';
 const broad=kind==='golem'||kind==='guardian'||kind==='boss';if(broad){rig.body.scale.x=1.6;for(const x of [-.47,.47])part(rig.body,new T.IcosahedronGeometry(.31,1),stone,x,1.65,0);}
 if(kind==='forest'){for(const x of [-.19,.19]){const branch=part(rig.body,new T.CylinderGeometry(.024,.07,.65,6),material(0x665748),x,2.42,0);branch.rotation.z=x*1.8;for(let i=0;i<3;i++)part(rig.body,new T.SphereGeometry(.1,8,6),material(0x639477),x*(1+i*.2),2.6+i*.08,0);}}
 if(kind==='crystal'||kind==='boss'){for(let i=0;i<7;i++){const crystal=part(rig.body,new T.OctahedronGeometry(.22,0),glow,Math.sin(i*2)*.43,1.3+i*.2,.12);crystal.scale.y=2.2;}}
 if(kind==='knight'||kind==='guardian'){part(rig.body,new T.CylinderGeometry(.19,.24,.37,8),stone,0,2.12,0);part(rig.body,new T.BoxGeometry(.27,.055,.045),glow,0,2.07,-.26);const crown=part(rig.body,new T.ConeGeometry(.13,.39,4),material(0xcbb782,.65,.3),0,2.42,0);crown.rotation.z=.1;}
 if(kind==='boss'){part(rig.body,new T.TorusGeometry(.48,.05,8,32),glow,0,2.15,.04);for(let i=0;i<5;i++)part(rig.body,new T.ConeGeometry(.075,.32,5),material(0xe0ca93,.75,.3),(i-2)*.13,2.45,0);}
 part(rig.body,new T.OctahedronGeometry(.12),glow,0,1.53,-.34);
 rig.root.rotation.y=Math.PI;return rig;
}
