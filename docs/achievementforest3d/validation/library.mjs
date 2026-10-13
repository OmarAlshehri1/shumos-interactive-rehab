import {launch,openIpad,login,until,sleep} from './crosslib.mjs';
import {writeFileSync} from 'node:fs';
const browser=await launch('/private/tmp/af-library-final',9898,['--use-angle=metal']),results=[];
const check=(name,ok)=>{results.push({name,ok:!!ok});console.log(ok?'PASS':'FAIL',name);};
try{
 const ctl=await openIpad(browser,'http://127.0.0.1:3754/control/activities');await login(ctl);
 await until(()=>ctl.eval("!!document.querySelector('[data-library-filter=INTERACTIVE_REWARDS]')"),60000);await sleep(1000);
 await ctl.eval("document.querySelector('[data-library-filter=INTERACTIVE_REWARDS]').click()");
 check('Rewards filter updates to exactly City and Forest',await until(()=>ctl.eval("document.querySelectorAll('[data-game-card]').length===2 && !!document.querySelector('[data-game-card=achievement-city-3d]') && !!document.querySelector('[data-game-card=achievement-forest-3d]')"),20000));
 check('Rewards form one dedicated section',await ctl.eval("document.querySelectorAll('[data-library-section]').length===1 && !!document.querySelector('[data-library-section=INTERACTIVE_REWARDS]')"));
 await ctl.shot('docs/achievementforest3d/evidence/shots/library-rewards.png');
 await ctl.eval("document.querySelector('[data-library-filter=FOOT]').click()");
 check('Foot membership is preserved and excludes Forest',await until(()=>ctl.eval("document.querySelectorAll('[data-game-card]').length===13 && !document.querySelector('[data-game-card=achievement-forest-3d]')"),20000));
}catch(e){check(String(e),false);}finally{browser.close();writeFileSync('docs/achievementforest3d/evidence/library-results.json',JSON.stringify(results,null,2));}
process.exit(results.every(r=>r.ok)?0:1);
