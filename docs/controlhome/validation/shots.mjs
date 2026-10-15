// node shots.mjs <outDir> <baseUrl> <prefix> — screenshots + overflow metrics for the Control home & library.
import { launch, sleep } from "./cdplib.mjs";
const [out, BASE, prefix] = process.argv.slice(2);
const b = await launch(process.env.PROFILE_DIR ?? "/private/tmp/claude-501/chrome-profile-controlhome", 9944);
const sizes = { desktop: [1440, 900], tablet: [1024, 768], tabletPortrait: [820, 1180] };
const pages = { home: "/control", library: "/control/activities", libHand: "/control/activities?filter=HAND", libRewards: "/control/activities?filter=INTERACTIVE_REWARDS" };
try {
  for (const [sn, [w, h]] of Object.entries(sizes)) {
    const t = await b.open("about:blank", w, h);
    await t.send("Page.navigate", { url: BASE + "/control" }); await sleep(4000);
    if (await t.eval("!!document.querySelector('input[type=email]')")) {
      await t.eval(`(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); }; set(document.querySelector('input[type=email]'), 'therapist@example.test'); set(document.querySelector('input[type=password]'), 'password123'); [...document.querySelectorAll('button')].find((x) => x.type === 'submit' || /دخول|تسجيل/.test(x.textContent))?.click(); })()`);
      await sleep(5000);
    }
    for (const [pn, path] of Object.entries(pages)) {
      await t.send("Page.navigate", { url: BASE + path });
      await sleep(4500);
      const m = await t.eval(`(() => { const sc = document.querySelector('main'); return { hOverflow: document.documentElement.scrollWidth > innerWidth || (sc ? sc.scrollWidth > sc.clientWidth : false), cards: new Set([...document.querySelectorAll('[data-game-card]')].map(e => e.dataset.gameCard)).size, sections: document.querySelectorAll('[data-library-section]').length, logos: document.querySelectorAll('img[src*="shumos-care-logo"], img[src*="shumos-care-logo" i]').length } })()`);
      await t.shot(`${out}/${prefix}-${pn}-${sn}.png`);
      console.log(prefix, sn, pn, JSON.stringify(m));
    }
  }
} finally { b.close(); }
