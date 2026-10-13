import sharp from 'sharp';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
mkdirSync('public/control-stage-previews/achievement-forest',{recursive:true});
const sources=['04-garden-complete','07-forest-complete','10-kingdom-complete'];
for(let i=0;i<3;i++)await sharp(`docs/achievementforest3d/screenshots/${sources[i]}.png`).resize(640,360).webp({quality:86}).toFile(`public/control-stage-previews/achievement-forest/${i+1}.webp`);
await sharp('docs/achievementforest3d/screenshots/10-kingdom-complete.png').resize(800,450).webp({quality:86}).toFile('public/library-thumbnails/achievement-forest-3d.webp');
const p='docs/release/library-evidence/thumbnail-provenance.json',rows=JSON.parse(readFileSync(p,'utf8')).filter(r=>r.gameId!=='achievement-forest-3d');
rows.push({gameId:'achievement-forest-3d',width:1600,height:900,source:'docs/achievementforest3d/screenshots/10-kingdom-complete.png',asset:'public/library-thumbnails/achievement-forest-3d.webp',renderer:'Original procedural Three.js live gameplay; local Chrome Metal'});writeFileSync(p,JSON.stringify(rows,null,2)+'\n');
