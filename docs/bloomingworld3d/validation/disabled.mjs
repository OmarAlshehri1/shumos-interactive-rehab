import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(path.join(process.env.BLOOM_PLAYWRIGHT_PATH||'/Users/omaralshehri/.npm/_npx/db89d7302a373f10/node_modules/playwright','index.mjs')).href);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../evidence');
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const results=[];
try{for(const route of ['/control/blooming-world-3d','/display/blooming-world-3d']){const response=await page.goto('http://127.0.0.1:3294'+route);assert.equal(response.status(),404);results.push({route,status:response.status()});}await page.goto('http://127.0.0.1:3294/control/activities');await page.waitForTimeout(500);assert.equal(await page.locator('[data-game-card="blooming-world-3d"]').count(),0);results.push({libraryCardCount:0});fs.writeFileSync(root+'/disabled-results.json',JSON.stringify(results,null,2));console.log('DISABLED ROUTES AND LIBRARY PASSED');}finally{await browser.close();}
