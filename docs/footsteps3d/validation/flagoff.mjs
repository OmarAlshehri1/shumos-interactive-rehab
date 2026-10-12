// Rollback check: with NEXT_PUBLIC_FOOTSTEPS_3D unset the original game is served (library card, Control). Emulators only.
import { launch, login, openIpad, selectPatient, sleep, note, results } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3417"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9981);
try {
  const ctl = await openIpad(A, `${BASE}/control/activities`);
  await login(ctl); await selectPatient(ctl); await sleep(9000);
  const cards = await ctl.eval(`JSON.stringify({ titles: [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'اتبع الخطوات').length, links: [...document.querySelectorAll('a[href]')].filter((a) => a.getAttribute('href') === '/control/follow-the-footsteps').length, en3d: document.body.innerText.includes('Follow the Footsteps 3D'), en: document.body.innerText.includes('Follow the Footsteps') })`).then(JSON.parse);
  note("flag off: exactly one Follow the Footsteps card and it is the original (no 3D name)", cards.titles === 1 && cards.links === 1 && cards.en && !cards.en3d, JSON.stringify(cards));
  await ctl.shot(`${out}/shots/library-flag-off.png`);
  await ctl.eval(`document.querySelector('a[href="/control/follow-the-footsteps"]').click()`);
  await sleep(12000);
  const page = await ctl.eval(`({ threeD: !!document.querySelector('[data-testid=foot-control]'), text: document.body.innerText.slice(0, 200) })`);
  note("flag off: the canonical route serves the original game's Control, not the 3D one", page.threeD === false && page.text.includes("اتبع الخطوات"), page.text.replace(/\s+/g, " ").slice(0, 120));
  await ctl.shot(`${out}/shots/control-flag-off.png`);
} finally {
  writeFileSync(`${out}/flagoff-results.json`, JSON.stringify(results, null, 1));
  A.close();
}
console.log(`${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(0);
