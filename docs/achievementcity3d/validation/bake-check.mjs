import { launch, sleep } from "./cdplib.mjs";
const chrome = await launch("/tmp/ac-bake", 9682, ["--use-angle=metal"]);
const t = await chrome.open("http://127.0.0.1:3742/dev/achievement-city-preview?level=0&target=6&script=start", 1920, 1080);
await sleep(6000);
const m = async () => JSON.parse(await t.eval(`document.querySelector('canvas').dataset.metrics`));
for (let l = 0; l < 3; l++) {
  for (let i = 0; i < 6; i++) { await t.eval(`window.__ac.send({type:'confirm'})`); await sleep(1500); }
  await sleep(6000);
  console.log('level', l, JSON.stringify(await m()), await t.eval(`document.querySelector('canvas').dataset.progress`));
  if (l < 2) { await t.eval(`window.__ac.send({type:'continue'})`); await sleep(1500); }
}
await sleep(15000);
console.log('final', JSON.stringify(await m()), await t.eval(`document.querySelector('canvas').dataset.progress`));
console.log(t.events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")).map((e) => JSON.stringify(e.params).slice(0, 400)));
chrome.close();
