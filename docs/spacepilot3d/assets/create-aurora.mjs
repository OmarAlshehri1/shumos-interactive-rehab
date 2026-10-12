// Original R2 spacecraft geometry, authored for this project. No third-party mesh.
// Reproducible asset generator; runtime loads the resulting optimized GLB.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {writeFileSync} from 'node:fs';
const group=new T.Group();group.name='Aurora survey craft';
const materials={
 ceramic:new T.MeshStandardMaterial({name:'Pearl ceramic alloy',color:0xc6d5df,metalness:.68,roughness:.29}),
 blue:new T.MeshStandardMaterial({name:'Anodized blue titanium',color:0x315875,metalness:.85,roughness:.25}),
 dark:new T.MeshStandardMaterial({name:'Panel recess graphite',color:0x101c29,metalness:.65,roughness:.43}),
 steel:new T.MeshStandardMaterial({name:'Brushed engine steel',color:0x7897a8,metalness:.9,roughness:.25}),
 glass:new T.MeshPhysicalMaterial({name:'Smoked canopy',color:0x102d42,metalness:.65,roughness:.13,clearcoat:1,clearcoatRoughness:.07}),
 glow:new T.MeshStandardMaterial({name:'Navigation inlays',color:0x61d7f0,emissive:0x289fb7,emissiveIntensity:1.2,metalness:.4,roughness:.25}),
};
const parts=Object.fromEntries(Object.keys(materials).map(k=>[k,[]]));
function add(g,m,pos=[0,0,0],rot=[0,0,0]){const o=new T.Object3D();o.position.fromArray(pos);o.rotation.set(...rot);o.updateMatrix();g=g.index?g.toNonIndexed():g;g.applyMatrix4(o.matrix);g.deleteAttribute('uv');parts[m].push(g);}
function panel(points,height,thickness,m){const shape=new T.Shape(points.map(([x,z])=>new T.Vector2(x,-z)));const g=new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelSegments:2,bevelThickness:.015,bevelSize:.022,steps:1,curveSegments:1});add(g,m,[0,height,0],[-Math.PI/2,0,0]);}
// Lofted chamfered fuselage; each station is z,width,upper/lower height.
function loft(stations,m){const vertices=[],indices=[];const ring=8;for(const [z,w,h,l] of stations){for(const [x,y] of [[-.7*w,h],[.7*w,h],[w,.65*h],[w,l*.5],[.65*w,l],[-.65*w,l],[-w,l*.5],[-w,.65*h]])vertices.push(x,y,z);}
 for(let i=0;i<stations.length-1;i++)for(let j=0;j<ring;j++){const a=i*ring+j,b=i*ring+(j+1)%ring,c=a+ring,d=b+ring;indices.push(a,c,b,b,c,d);}
 for(let j=1;j<7;j++){indices.push(0,j,j+1);const n=(stations.length-1)*8;indices.push(n,n+j+1,n+j);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();add(g,m);}
loft([[-2.12,.055,.04,-.04],[-1.6,.25,.16,-.13],[-.85,.43,.24,-.24],[.35,.48,.23,-.28],[1.08,.38,.18,-.18]],'ceramic');
loft([[-1.57,.08,.18,.12],[-1.02,.26,.48,.18],[-.44,.29,.46,.21],[-.16,.21,.24,.19]],'blue');
loft([[-1.43,.075,.205,.19],[-1.00,.23,.46,.25],[-.51,.255,.445,.26],[-.29,.19,.285,.25]],'glass');
// Canopy frames, spine plates, inset vents and service panel seams.
for(const z of [-1.03,-.53])add(new T.BoxGeometry(.49,.018,.026),'steel',[0,z===-1.03?.466:.449,z]);
panel([[-.17,-.19],[.17,-.19],[.23,.65],[-.23,.65]],.25,.022,'blue');
for(let i=0;i<9;i++)add(new T.BoxGeometry(.27,.016,.025),'dark',[0,.313,.05+i*.048]);
add(new T.BoxGeometry(.58,.18,.025),'dark',[0,.015,1.095]);
for(let i=0;i<5;i++)add(new T.BoxGeometry(.55,.012,.03),'steel',[0,-.06+i*.035,1.113]);
for(const side of [-1,1]){
 const mirror=pts=>pts.map(([x,z])=>[x*side,z]);
 panel(mirror([[.36,-.56],[.7,-.34],[2.15,.68],[2.16,.88],[.46,.86]]),-.09,.065,'ceramic');
 panel(mirror([[.69,-.25],[1.84,.61],[1.43,.64],[.68,.08]]),-.008,.008,'blue');
 panel(mirror([[1.39,.32],[1.97,.70],[1.54,.72],[1.04,.34]]),.007,.012,'ceramic');
 panel(mirror([[.56,.25],[1.08,.53],[1.12,.76],[.54,.70]]),.015,.012,'steel');
 for(let i=0;i<4;i++)add(new T.BoxGeometry(.17,.015,.025),'dark',[side*1.77,.02,.69+i*.043]);
 add(new T.BoxGeometry(.8,.014,.024),'glow',[side*1.56,.01,.835]);
 // Carefully profiled engine pods; Lathe has a longitudinal axis, rotated to Z.
 const profile=[[0,-.58],[.13,-.58],[.23,-.47],[.29,-.17],[.30,.60],[.32,.75],[.32,.92],[.27,1.04],[.20,1.04],[.20,.93],[0,.93]].map(p=>new T.Vector2(...p));
 add(new T.LatheGeometry(profile,40),'blue',[side*.95,0,.25],[Math.PI/2,0,0]);
 for(const z of [-.2,.06,.67,.92,1.05,1.19])add(new T.TorusGeometry(.30,.018,8,40),'steel',[side*.95,0,z]);
 for(let i=0;i<16;i++){const a=i*Math.PI/8;add(new T.BoxGeometry(.02,.018,.54),'dark',[side*.95+Math.cos(a)*.3,Math.sin(a)*.3,.39],[0,0,a]);}
 add(new T.CylinderGeometry(.20,.23,.1,40),'dark',[side*.95,0,1.29],[Math.PI/2,0,0]);
 add(new T.TorusGeometry(.245,.022,8,40),'steel',[side*.95,0,1.34]);
 // Small stabilizer, mounting brace and recessed fasteners.
 panel(mirror([[1.93,.57],[2.14,.72],[2.1,.91],[1.9,.81]]),.08,.025,'blue');
 for(const [x,z] of [[.48,.5],[1.5,.52],[1.92,.75],[.6,-.18]])add(new T.CylinderGeometry(.018,.018,.014,8),'dark',[side*x,.045,z]);
}
for(const [name,geometries] of Object.entries(parts)){if(!geometries.length)continue;const g=mergeGeometries(geometries,false);g.computeBoundingBox();const mesh=new T.Mesh(g,materials[name]);mesh.name=name;group.add(mesh);}
// GLTFExporter in Node only needs FileReader for binary Blob conversion.
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.()})}};
const bytes=await new GLTFExporter().parseAsync(group,{binary:true});
writeFileSync('public/spacepilot3d/models/aurora.glb',Buffer.from(bytes));
console.log(JSON.stringify({file:'aurora.glb',bytes:bytes.byteLength,meshes:group.children.length,triangles:group.children.reduce((n,m)=>n+m.geometry.attributes.position.count/3,0),bounds:new T.Box3().setFromObject(group)},null,2));
