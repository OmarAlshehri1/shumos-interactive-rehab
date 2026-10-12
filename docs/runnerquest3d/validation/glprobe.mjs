import { launch, sleep } from "./cdplib.mjs";
const flags = process.argv.slice(2);
const b = await launch("/tmp/rq-probe-" + Date.now(), 9556, flags);
const t = await b.open("http://127.0.0.1:3210/display/runner-quest-3d-prototype");
await sleep(1500);
console.log(flags.join(" "), await t.eval(`(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); if(!g) return 'NO GL'; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'gl ok'; })()`));
b.close();
