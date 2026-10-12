import * as T from 'three';
import {STAGES,type Stage} from '@/lib/castlelegends3d/curriculum';
import {material,part} from './rig';
function rng(seed:number){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function texture(type:'stone'|'ground'){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;const r=rng(31);ctx.fillStyle=type==='stone'?'#8b9391':'#556a55';ctx.fillRect(0,0,256,256);for(let i=0;i<14000;i++){const v=Math.floor(55+r()*140);ctx.fillStyle=`rgba(${v},${v+5},${v},${.05+r()*.15})`;ctx.fillRect(r()*256,r()*256,1+r()*5,1+r()*3);}if(type==='stone'){ctx.strokeStyle='#5c6566';ctx.lineWidth=3;for(let y=0;y<256;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();for(let x=(y%128?32:0);x<256;x+=64){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+64);ctx.stroke();}}}const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;return t;}
export function createWorld(scene:T.Scene,index:number,quality:'low'|'high'){
 const s=STAGES[index],random=rng(103+index),root=new T.Group();scene.add(root);
 const stone=material(0xa0a4a0,.05,.94);stone.map=texture('stone');stone.map.repeat.set(1,2);const ground=material(index>=7?0x666371:0x859583);ground.map=texture('ground');ground.map.repeat.set(32,45);
 const interior=index>=7;
 const terrain=new T.PlaneGeometry(120,150,60,75);terrain.rotateX(-Math.PI/2);const pos=terrain.attributes.position;for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,interior?-.16:Math.sin(x*.18+z*.08)*Math.cos(z*.13)*Math.min(1,Math.max(0,(Math.abs(x)-3)/8))*2-.15);}terrain.computeVertexNormals();part(root,terrain,ground,0,0,-40);
 const matrix=new T.Matrix4(),rotation=new T.Quaternion(),scale=new T.Vector3(),position=new T.Vector3();
 function instances(g:T.BufferGeometry,m:T.Material,n:number,fn:(i:number)=>void){const mesh=new T.InstancedMesh(g,m,n);mesh.castShadow=true;mesh.receiveShadow=true;for(let i=0;i<n;i++){position.set(0,0,0);scale.set(1,1,1);rotation.set(0,0,0,1);fn(i);matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);}root.add(mesh);return mesh;}
 // A continuous stone trail, individually varied rather than an empty plane.
 instances(new T.BoxGeometry(1,.13,1),stone,5*110,i=>{position.set((i%5-2)*.86,.005,-Math.floor(i/5)*.95+8);scale.set(.82+random()*.06,1,.86);rotation.setFromAxisAngle(new T.Vector3(0,1,0),(random()-.5)*.025);});
 const moss=material(0x546951);instances(new T.IcosahedronGeometry(1,1),moss,interior?0:65,i=>{const sign=i%2?1:-1;position.set(sign*(4+random()*24),-.3,-random()*100);scale.set(1+random()*2,.5+random(),1+random());});
 if(!interior){const count=quality==='high'?100:60;const trees:Array<{x:number;z:number;h:number}>=Array.from({length:count},(_,i)=>({x:(i%2?1:-1)*(6+random()*37),z:12-random()*115,h:7+random()*7}));
 const bark=material(0x535044);bark.map=texture('stone');bark.map.repeat.set(.5,4);
 instances(new T.CylinderGeometry(.15,.4,1,7),bark,count,i=>{const p=trees[i];position.set(p.x,p.h/2-.25,p.z);scale.set(1,p.h,1);});
 const leaves=material(index===0||index===1||index===2?0x294e3d:0x4a5c61);
 const canopy=new T.IcosahedronGeometry(1,2);const cv=canopy.attributes.position;for(let i=0;i<cv.count;i++){const variation=.85+random()*.3;cv.setXYZ(i,cv.getX(i)*variation,cv.getY(i)*variation,cv.getZ(i)*variation);}canopy.computeVertexNormals();
 instances(canopy,leaves,count*4,i=>{const p=trees[Math.floor(i/4)];position.set(p.x+Math.sin(i*2)*1.6,p.h-.3+(i%4)*.65,p.z+Math.cos(i*3)*1.6);scale.set(2.8+(i%3)*.3,1.8,2.8);});
 instances(new T.CylinderGeometry(.04,.12,2.8,5),bark,count*2,i=>{const p=trees[Math.floor(i/2)];position.set(p.x+(i%2?1:-1),p.h-2,p.z);rotation.setFromAxisAngle(new T.Vector3(0,0,1),(i%2?1:-1)*.9);});
 const grass=material(0x67865a);grass.side=T.DoubleSide;
 const blades=new T.BufferGeometry();const bp:number[]=[];for(let i=0;i<5;i++){const a=i*2.4,x=Math.sin(a)*.13,z=Math.cos(a)*.13,tip=.4+i*.1;bp.push(x-.025,0,z,x+.025,0,z,x+Math.sin(a)*.08,tip,z+Math.cos(a)*.08);}blades.setAttribute('position',new T.Float32BufferAttribute(bp,3));blades.computeVertexNormals();
 instances(blades,grass,quality==='high'?2400:900,()=>{position.set((random()>.5?1:-1)*(2.5+random()*23),.16,8-random()*107);scale.set(.6+random(),.5+random(),.6+random());rotation.setFromAxisAngle(new T.Vector3(0,1,0),random()*6.28);});
 instances(new T.SphereGeometry(.05,5,4),material(0xe7dfc9),quality==='high'?260:90,()=>{position.set((random()>.5?1:-1)*(3+random()*10),.55,8-random()*80);});
 }
 function column(x:number,z:number,h=7){part(root,new T.BoxGeometry(1.35,.35,1.35),stone,x,.2,z);part(root,new T.CylinderGeometry(.43,.52,h,12),stone,x,h/2+.35,z);part(root,new T.BoxGeometry(1.2,.45,1.2),stone,x,h+.3,z);}
 function tower(x:number,z:number,h:number,w=3){part(root,new T.CylinderGeometry(w,w*1.15,h,12),stone,x,h/2,z);const roof=material(0x354a62,.4,.6);part(root,new T.ConeGeometry(w*1.35,h*.38,12),roof,x,h+h*.19,z);for(let y=2;y<h-1;y+=3){part(root,new T.BoxGeometry(.35,1,.13),material(0xe7cfa0),x,y,z+w+.02);part(root,new T.TorusGeometry(w+.03,.07,4,24),stone,x,y-.7,z).rotation.x=Math.PI/2;}for(let i=0;i<8;i++){const a=i*Math.PI/4;part(root,new T.BoxGeometry(.55,.75,.55),stone,x+Math.sin(a)*w,h+.2,z+Math.cos(a)*w);}}
 // Castle is real geometry, visible along the whole journey.
 const cz=index===6?-67:-88;
 tower(-7,cz,17);tower(7,cz,17);tower(-15,cz-6,23);tower(15,cz-6,23);tower(0,cz-12,29,4);
 for(const x of [-11,11])part(root,new T.BoxGeometry(8,11,3),stone,x,5.5,cz);part(root,new T.BoxGeometry(10,4,4),stone,0,12,cz);
 const arch=part(root,new T.TorusGeometry(4,.48,8,32,Math.PI),stone,0,7,cz+2);arch.rotation.z=0;
 part(root,new T.PlaneGeometry(6,9),material(0x22333c),0,4.5,cz+1.8);
 const banners=material(index>=3?0x474274:0x285373);for(const x of [-7,7])part(root,new T.PlaneGeometry(1.35,4),banners,x,11,cz+3.08);
 if(s.biome==='river'){
 const water=new T.MeshPhysicalMaterial({color:0x397d8c,roughness:.18,metalness:.4,transparent:true,opacity:.9});part(root,new T.PlaneGeometry(100,18),water,0,-.32,-17).rotation.x=-Math.PI/2;
 part(root,new T.BoxGeometry(5,.5,23),stone,0,-.23,-17);for(const x of [-2.6,2.6]){part(root,new T.BoxGeometry(.25,.5,23),stone,x,.35,-17);for(let z=-27;z<-7;z+=3)part(root,new T.BoxGeometry(.6,.9,.6),stone,x,.6,z);}
 }
 if(['gate','fortress'].includes(s.biome)){for(const x of [-6,6])tower(x,-18,10,1.7);part(root,new T.BoxGeometry(15,2,2),stone,0,8,-18);part(root,new T.TorusGeometry(3.8,.35,8,24,Math.PI),stone,0,5,-16.8);}
 if(s.biome==='crystal'||s.biome==='throne'){const crystal=material(0x8dbddd,.45,.2);crystal.emissive.set(0x366c98);crystal.emissiveIntensity=.55;instances(new T.OctahedronGeometry(1,0),crystal,38,i=>{position.set((i%2?1:-1)*(4+random()*17),1.8,5-random()*83);scale.set(.55+random(),2+random()*4,.55+random());rotation.setFromAxisAngle(new T.Vector3(0,0,1),(random()-.5)*.6);});}
 if(['temple','interior','throne'].includes(s.biome)){
 for(let z=5;z>-70;z-=10){for(const x of [-6,6])column(x,z,interior?9:6);if(interior)part(root,new T.TorusGeometry(6,.35,8,24,Math.PI),stone,0,9,z);}
 if(interior){for(const x of [-11,11])part(root,new T.BoxGeometry(1,16,95),stone,x,8,-35);part(root,new T.PlaneGeometry(9,85),material(s.biome==='throne'?0x322b4b:0x343f54),0,.09,-32).rotation.x=-Math.PI/2;for(let z=3;z>-65;z-=12)for(const x of [-7.5,7.5]){part(root,new T.PlaneGeometry(2,5),banners,x,6,z);const lamp=new T.PointLight(0xffc283,12,15,2);lamp.position.set(x,4,z);root.add(lamp);part(root,new T.SphereGeometry(.16,10,8),new T.MeshBasicMaterial({color:0xffd6a0}),x,4,z);}}
 }
 if(s.biome==='throne'){part(root,new T.BoxGeometry(9,.65,6),stone,0,.35,-20);part(root,new T.BoxGeometry(2.5,4,1),material(0xb4a080,.7,.3),0,2,-23);part(root,new T.BoxGeometry(3,.5,2),stone,0,1.2,-22);}
 if(!interior&&quality==='high'){const rays=new T.MeshBasicMaterial({color:0xffebc4,transparent:true,opacity:.032,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending});for(let i=0;i<6;i++){const ray=part(root,new T.PlaneGeometry(.6+i*.12,17),rays,-4+i*3,7,-10-i*9);ray.rotation.z=-.45;ray.rotation.y=.3;}}
 const fireflies=180;const points=new Float32Array(fireflies*3);for(let i=0;i<fireflies;i++){points[i*3]=(random()-.5)*30;points[i*3+1]=.7+random()*6;points[i*3+2]=7-random()*100;}const pg=new T.BufferGeometry();pg.setAttribute('position',new T.BufferAttribute(points,3));const motes=new T.Points(pg,new T.PointsMaterial({color:s.accent,size:.065,transparent:true,opacity:.65,depthWrite:false}));root.add(motes);
 return {root,motes,stage:s};
}
export function disposeObjects(root:T.Object3D){const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value);}}});geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());}
export function lights(scene:T.Scene,s:Stage){scene.background=new T.Color(s.sky);scene.fog=new T.FogExp2(s.fog,.015);scene.add(new T.HemisphereLight(0xc8e1e8,0x3b4541,2));const sun=new T.DirectionalLight(0xffe7b8,3.4);sun.position.set(-14,22,12);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-22;sun.shadow.camera.right=22;sun.shadow.camera.top=25;sun.shadow.camera.bottom=-25;sun.shadow.normalBias=.04;scene.add(sun,sun.target);return sun;}
