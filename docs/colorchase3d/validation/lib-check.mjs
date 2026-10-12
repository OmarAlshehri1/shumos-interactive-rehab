// Library + routing check. mode "on": exactly one Color Chase card, the 3D game on the canonical route, the original reachable at
// /control/color-chase-legacy. mode "off" (rollback): the original game is served. Emulators only.
import { launch, login, openIpad, selectPatient, sleep, note, results } from "../../footsteps3d/validation/crosslib.mjs";
import { seed } from "../../footsteps3d/validation/seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE, mode = "on"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad-${mode}`, 9961);
try {
  const ctl = await openIpad(A, `${BASE}/control/activities`);
  await login(ctl); await selectPatient(ctl); await sleep(9000);
  const cards = await ctl.eval(`JSON.stringify({ titles: [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'مطاردة الألوان').length, links: [...document.querySelectorAll('a[href]')].filter((a) => a.getAttribute('href') === '/control/color-chase').length, en3d: document.body.innerText.includes('Color Chase 3D'), en: document.body.innerText.includes('Color Chase'), floor: document.body.innerText.includes('أرضية') })`).then(JSON.parse);
  const six = await ctl.eval(`document.body.innerText.length`);
  if (mode === "on") note("flag on: exactly one Color Chase card, with the 3D name", cards.titles === 1 && cards.links === 1 && cards.en3d, JSON.stringify(cards));
  else note("flag off: exactly one Color Chase card and it is the original (no 3D name)", cards.titles === 1 && cards.links === 1 && cards.en && !cards.en3d, JSON.stringify(cards));
  note("library still renders its other games", six > 500, String(six));
  await ctl.shot(`${out}/shots/library-flag-${mode}.png`);
  await ctl.eval(`document.querySelector('a[href="/control/color-chase"]').click()`);
  await sleep(12000);
  const page = await ctl.eval(`({ threeD: !!document.querySelector('[data-testid=cc-control]'), text: document.body.innerText.slice(0, 160) })`);
  if (mode === "on") note("canonical route /control/color-chase serves the 3D game", page.threeD === true);
  else note("flag off: the canonical route serves the original game's Control", page.threeD === false && page.text.includes("مطاردة الألوان"), page.text.replace(/\s+/g, " ").slice(0, 100));
  await ctl.shot(`${out}/shots/control-flag-${mode}.png`);
  await ctl.send("Page.navigate", { url: `${BASE}/control/color-chase-legacy` });
  await sleep(12000);
  const leg = await ctl.eval(`({ threeD: !!document.querySelector('[data-testid=cc-control]'), text: document.body.innerText.slice(0, 160) })`);
  note("the original game stays reachable at /control/color-chase-legacy (rollback path)", leg.threeD === false && leg.text.includes("مطاردة الألوان"), leg.text.replace(/\s+/g, " ").slice(0, 100));
  const other = ["/control/follow-the-footsteps", "/control/balloon-quest", "/control/space-pilot", "/control/bubble-pop-wall"];
  for (const r of other) { await ctl.send("Page.navigate", { url: `${BASE}${r}` }); await sleep(7000); note(`other game route still renders: ${r}`, (await ctl.eval(`document.body.innerText.length`)) > 60); }
} finally {
  writeFileSync(`${out}/lib-${mode}-results.json`, JSON.stringify(results, null, 1));
  A.close();
}
console.log(`${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(0);
