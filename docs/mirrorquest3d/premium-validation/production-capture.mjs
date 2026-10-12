import {createRequire} from 'node:module';import fs from 'node:fs';
const {chromium}=createRequire(import.meta.url)('/Users/omaralshehri/.npm/_npx/5c6d8c4f680fcd0a/node_modules/playwright');
const out='/tmp/mirror-premium-validation/production';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const context=await browser.newContext({viewport:{width:1600,height:900},recordVideo:{dir:out,size:{width:1600,height:900}}}),page=await context.newPage();const captures=new Set();
try{await page.goto('http://127.0.0.1:3130/display');await page.locator('[data-status]').waitFor({timeout:60000});
 for(let i=0;i<190;i++){
  const record=await (await fetch('http://127.0.0.1:19100/liveSession.json?ns=demo-mirror-default-rtdb',{headers:{Authorization:'Bearer owner'}})).json();const s=record?.session?.mirror3?.payload&&JSON.parse(record.session.mirror3.payload);
  if(s&&s.status==='running'&&((s.stage===2&&s.pose===1)||(s.stage===3&&s.pose===1))){const name=`${s.config.presentation}-${s.config.character}-${s.stage===2?'arms':'leg'}`;if(!captures.has(name)){await page.waitForTimeout(300);await page.screenshot({path:`${out}/${name}.png`});captures.add(name);}}
  await page.waitForTimeout(1000);
 }
 fs.writeFileSync(out+'/captures.json',JSON.stringify([...captures],null,2));
}finally{await context.close();await browser.close();}
