import { launch, sleep } from './cdplib.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const dir='docs/achievementforest3d/screenshots';mkdirSync(dir,{recursive:true});
const browser=await launch('/private/tmp/af-browser-metal',9456,['--use-angle=metal']);
try {
 const results=[];
 for(const [level,count,name] of [[0,0,'01-garden-start'],[0,1,'02-first-growth'],[0,5,'03-garden-mid'],[0,10,'04-garden-complete'],[1,0,'05-forest-baseline'],[1,5,'06-forest-mid'],[1,10,'07-forest-complete'],[2,0,'08-kingdom-baseline'],[2,5,'09-kingdom-mid'],[2,10,'10-kingdom-complete']]) {
  const tab=await browser.open(`http://127.0.0.1:3754/dev/achievement-forest-preview?level=${level}&script=start${',c'.repeat(count)}&cfg=${encodeURIComponent(JSON.stringify({sound:false,cinematic:false}))}`);
  for(let i=0;i<80;i++){if(await tab.eval('!!document.querySelector("canvas[data-metrics]")'))break;await sleep(500);}
  await sleep(1500);await tab.eval("document.querySelector('nextjs-portal')?.remove()");await tab.shot(`${dir}/${name}.png`);
  results.push({level,count,metrics:await tab.eval('JSON.parse(document.querySelector("canvas").dataset.metrics)'),errors:tab.events.filter(e=>e.method==='Runtime.exceptionThrown')});
  await tab.send('Page.close');
 }
 writeFileSync('docs/achievementforest3d/validation/render-results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(r=>({level:r.level,count:r.count,metrics:r.metrics,errors:r.errors.length})),null,2));
}finally{browser.close();}
