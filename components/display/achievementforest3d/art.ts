import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/** Original procedural artwork. Per-vertex palettes and merged geometry keep the woodland inexpensive. */
export function random(seed: number) { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; }; }
export const groundY = (x: number, z: number) => 0.35 + Math.sin(x * .1) * .5 + Math.cos(z * .12) * .5 + Math.sin((x + z) * .06) * .35;
export const riverX = (z: number) => -2 + Math.sin(z * .09) * 5;
export class Sculpture {
 private pieces: T.BufferGeometry[] = [];
 add(g: T.BufferGeometry, color: T.ColorRepresentation, p: number[] = [0,0,0], scale: number[] = [1,1,1], rotation: number[] = [0,0,0]) {
  const m = new T.Matrix4().compose(new T.Vector3(...p), new T.Quaternion().setFromEuler(new T.Euler(...rotation)), new T.Vector3(...scale));
  g.applyMatrix4(m); if (g.index) g = g.toNonIndexed();
  const c = new T.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
  for(let i=0;i<colors.length;i+=3) { colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b; }
  g.setAttribute('color',new T.BufferAttribute(colors,3)); this.pieces.push(g); return this;
 }
 ellipsoid(color: T.ColorRepresentation, p: number[], s: number[], detail = 1) { return this.add(new T.IcosahedronGeometry(1,detail),color,p,s); }
 tube(points: T.Vector3[], radius: number, color: T.ColorRepresentation) { return this.add(new T.TubeGeometry(new T.CatmullRomCurve3(points),16,radius,7,false),color); }
 finish(mat: T.Material) {
  const geo=mergeGeometries(this.pieces,false);this.pieces.forEach(g=>g.dispose());this.pieces=[];
  const mesh=new T.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
 }
}
export function tree(seed: number, h: number, palette: readonly string[], material: T.Material, ancient = false, foliage: T.Material = material): T.Group {
 const rng=random(seed), group=new T.Group(), trunk=new Sculpture(), leaves=new Sculpture();
 const lean=(rng()-.5)*1.8;
 const bark=['#665140','#786044','#95714c'];
 const main=[new T.Vector3(0,0,0),new T.Vector3(lean*.4,h*.3,.3),new T.Vector3(lean,h*.65,0),new T.Vector3(lean*.5,h*.94,.1)];
 trunk.tube(main,h*(ancient?.065:.035),bark[seed%3]);
 // Flared roots, twisting boughs and branching silhouettes rather than cylinder trees.
 for(let i=0;i<(ancient?9:5);i++) {
  const a=i*6.283/(ancient?9:5);trunk.tube([new T.Vector3(Math.cos(a)*h*.18,.02,Math.sin(a)*h*.18),new T.Vector3(Math.cos(a)*h*.08,h*.09,Math.sin(a)*h*.08),new T.Vector3(0,h*.28,0)],h*.019,bark[(i+seed)%3]);
 }
 const branches=ancient?12:8;
 for(let i=0;i<branches;i++) {
  const a=i*2.4+rng()*.3, reach=h*(.22+rng()*.13), y=h*(.5+rng()*.28);
  const tip=new T.Vector3(lean+Math.cos(a)*reach,y+h*.14,Math.sin(a)*reach);
  trunk.tube([new T.Vector3(lean*.6,y*.72,0),new T.Vector3(tip.x*.65,y,tip.z*.65),tip],h*.014,bark[i%3]);
  for(let j=0;j<5;j++) {
   const pos=tip.clone().add(new T.Vector3((rng()-.5)*h*.19,(rng()-.3)*h*.13,(rng()-.5)*h*.19));
   const radius=h*(.09+rng()*.04);
   leaves.ellipsoid(palette[Math.floor(rng()*palette.length)],pos.toArray(),[radius*1.1,radius*.85,radius],1);
   for(let leaf=0;leaf<9;leaf++) {
    const a=rng()*Math.PI*2, b=rng()*Math.PI;
    const lp=pos.clone().add(new T.Vector3(Math.cos(a)*Math.sin(b)*radius*1.25,Math.cos(b)*radius,Math.sin(a)*Math.sin(b)*radius));
    const lr=h*(.016+rng()*.009);
    leaves.ellipsoid(palette[Math.floor(rng()*palette.length)],lp.toArray(),[lr*1.8,lr*.65,lr],0);
   }
  }
 }
 leaves.ellipsoid(palette[0],[lean*.5,h*.94,0],[h*.22,h*.17,h*.2],1);
 group.add(trunk.finish(material));const crown=leaves.finish(foliage);crown.name='crown';group.add(crown);
 return group;
}
export function flowers(seed: number, count: number, radius: number, material: T.Material, glow = false) {
 const rng=random(seed), s=new Sculpture();const colors=glow?['#c8fff4','#99edff','#f6dafa']:['#f7b4d2','#eeeacb','#ba8ee0','#f38cab','#f4d784'];
 for(let i=0;i<count;i++) {
  const a=rng()*6.283,d=Math.sqrt(rng())*radius,x=Math.cos(a)*d,z=Math.sin(a)*d,y=.2+rng()*.45;
  s.add(new T.CylinderGeometry(.018,.026,y,4),'#527d40',[x,y/2,z]);
  for(let p=0;p<5;p++) {const b=p*6.283/5;s.ellipsoid(colors[i%colors.length],[x+Math.cos(b)*.13,y,z+Math.sin(b)*.13],[.13,.055,.105],0);}
  s.ellipsoid('#eac56c',[x,y+.03,z],[.075,.06,.075],0);
  s.ellipsoid('#689448',[x+.09,y*.5,z],[.2,.035,.08],0);
 }
 return s.finish(material);
}
export function fern(seed: number, material: T.Material) {
 const s=new Sculpture(),rng=random(seed);
 for(let k=0;k<9;k++) {const a=k*6.283/9;const height=.9+rng()*.7;
  for(let j=0;j<7;j++) {const d=(j+1)*.17,y=Math.sin((j+1)/8*Math.PI*.7)*height;
   for(const side of [-1,1]) {const x=Math.cos(a)*d+Math.cos(a+1.57)*side*.12,z=Math.sin(a)*d+Math.sin(a+1.57)*side*.12;s.ellipsoid(j%2?'#3a7952':'#7dac58',[x,y,z],[.24,.035,.09],1);}
  }
 }
 return s.finish(material);
}
export function mushroom(seed: number, material: T.Material) {
 const s=new Sculpture();for(let i=0;i<7;i++){const x=Math.sin(i*2.4)*(i*.22),z=Math.cos(i*2.4)*(i*.22),h=.3+(i%3)*.2;
  s.add(new T.CylinderGeometry(.065,.1,h,7),'#efdcb7',[x,h/2,z]);
  s.add(new T.SphereGeometry(h*.58,12,7,0,Math.PI*2,0,Math.PI/2),seed%2?'#ca7978':'#8fb5c5',[x,h,z],[1,.7,1]);
  for(let j=0;j<5;j++){const a=j*2.4;s.ellipsoid('#fff0d0',[x+Math.cos(a)*h*.3,h+h*.26,z+Math.sin(a)*h*.3],[.055,.023,.055]);}
 }return s.finish(material);
}
export function bridge(material: T.Material, span=8) {
 const s=new Sculpture();for(let i=0;i<24;i++){const x=(i/23-.5)*span,y=.5+Math.cos(x/span*Math.PI)*1.1;
  s.add(new T.BoxGeometry(span/23*.92,.15,2.6),'#ad8355',[x,y,0]);
  if(i%4===0) for(const z of [-1.3,1.3]) s.add(new T.BoxGeometry(.13,1.35,.13),'#74543c',[x,y+.65,z]);
 }
 for(const z of [-1.3,1.3]) s.tube(Array.from({length:9},(_,i)=>{const x=(i/8-.5)*span;return new T.Vector3(x,1.85+Math.cos(x/span*Math.PI)*1.1,z);}),.07,'#845f40');
 return s.finish(material);
}
export function animal(kind: 'rabbit'|'deer'|'bird'|'butterfly', material: T.Material, seed: number): T.Group {
 const g=new T.Group(),s=new Sculpture();
 if(kind==='rabbit') {
  s.ellipsoid('#bfa485',[0,.4,0],[.28,.38,.42],2);s.ellipsoid('#eee0c6',[0,.61,.32],[.2,.22,.22],2);
  for(const x of [-.1,.1]){s.ellipsoid('#d6bea0',[x,.96,.3],[.065,.28,.07],2);s.ellipsoid('#e9b5af',[x,.99,.35],[.032,.2,.025]);s.ellipsoid('#38322b',[x,.65,.48],[.03,.04,.026]);s.ellipsoid('#e1ccb0',[x,.12,.27],[.12,.12,.21]);}
  s.ellipsoid('#f4e9d8',[0,.44,-.4],[.14,.14,.14]);s.ellipsoid('#a56770',[0,.57,.54],[.04,.026,.025]);
 } else if(kind==='deer') {
  s.ellipsoid('#b78c63',[0,1.15,0],[.42,.52,.8],2);s.ellipsoid('#cda879',[0,1.8,.55],[.24,.6,.28],2);s.ellipsoid('#d7b389',[0,2.19,.73],[.26,.28,.39],2);
  for(const x of [-.29,.29]){s.ellipsoid('#c69c72',[x,2.48,.61],[.22,.09,.13]);s.ellipsoid('#292d29',[x*.66,2.24,.95],[.03,.044,.035]);}
  for(const x of [-.23,.23])for(const z of [-.48,.48]){s.add(new T.CylinderGeometry(.06,.045,1,6),'#b48c67',[x,.53,z]);s.ellipsoid('#524335',[x,.08,z+.02],[.09,.08,.14]);}
  for(let i=0;i<12;i++){s.ellipsoid('#eeddba',[(i%2?1:-1)*.38,1.1+(i%3)*.13,(i/12-.5)*1.2],[.032,.034,.044]);}
 } else {
  const color=kind==='bird'?'#69b6c9':seed%2?'#e8a7c6':'#e2c879';
  s.ellipsoid(kind==='bird'?color:'#655857',[0,0,0],[.12,.13,.27],2);
  if(kind==='bird'){s.ellipsoid('#e3d3b0',[0,-.025,.08],[.08,.09,.15]);s.add(new T.ConeGeometry(.055,.17,5),'#e6b66a',[0,0,.32],[1,1,1],[Math.PI/2,0,0]);}
  for(const side of [-1,1]){const w=new Sculpture();w.ellipsoid(color,[side*.24,0,0],[.3,.028,kind==='bird'?.18:.28],2);if(kind==='butterfly')w.ellipsoid('#a787b8',[side*.22,0,-.2],[.19,.02,.16]);const wing=w.finish(material);wing.name=side<0?'wingL':'wingR';g.add(wing);}
 }
 g.add(s.finish(material));g.userData.kind=kind;return g;
}
