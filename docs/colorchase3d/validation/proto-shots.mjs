// Screenshots of the development prototype harness (no Firebase): node proto-shots.mjs <outDir> <baseUrl> <name=query> ...
import { launch, sleep } from "../../footsteps3d/validation/cdplib.mjs";
const [out, BASE, ...jobs] = process.argv.slice(2);
const b = await launch(`${out}/profile-shots`, 9931);
try {
  const t = await b.open("about:blank", 1920, 1080);
  for (const job of jobs) {
    const i0 = job.indexOf("="); const name = job.slice(0, i0), query = job.slice(i0 + 1);
    await t.send("Page.navigate", { url: `${BASE}/display/color-chase-3d-prototype?${query}` });
    let ok = false;
    for (let i = 0; i < 120 && !ok; i++) { await sleep(500); ok = await t.eval(`!!document.querySelector('canvas')?.dataset.metrics`).catch(() => false); }
    await sleep(Number(process.env.SETTLE ?? 3500));
    await t.shot(`${out}/${name}.png`);
    const m = await t.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`);
    console.log(name, ok ? "ok" : "NO-WEBGL", m);
  }
} finally { b.close(); }
