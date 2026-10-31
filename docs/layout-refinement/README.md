# Shumos premium layout refinement

Continues local commit `32afecb` in the existing main checkout. The approved teal identity, Arabic typography, official logo, and shared tokens remain. No push or deployment was performed.

## Pages improved

- **Sidebar and account:** removed the workspace label, decorative message and calibration shortcut. Four navigation destinations remain, with slightly larger vertical gaps and a quiet separator below the brand. Active states, icons, tablet labels, guarded navigation and sign-out remain. The account label is now `حساب شموس كير`. The calibration route itself is unchanged and still available directly.
- **Homepage:** removed the eyebrow, introductory sentence, redundant library/count shortcut, calibration shortcut and recent-patients section. Therapy and quick-session choices lead into the existing Display/audio and device readiness cards. Native recovery behavior and actual device states remain.
- **Activities:** five category tabs replace the combined All view. Hand sensors are the default for missing, invalid or obsolete All queries. Exactly one category is shown at a time. All 22 canonical games are discoverable across the existing categories; original game routes and input launch parameters remain. The old internal `filteredGames(..., "ALL")` registry-audit helper remains for compatibility, but no All tab or combined UI view is exposed.
- **Patient registry:** 10 active patients per page, two desktop columns and five rows on a full page. Narrow screens use one column. Sorting uses registration date, newest or oldest first, with patient ID as a deterministic tie-breaker. Existing name/clinic-number search remains. Search and sort changes return to page 1. Live deactivation/filter changes clamp an invalid page; added patients enter the existing sort order. Totals and current-page controls update from the same subscription. Pagination is a client view over the existing live subscription, with no database/schema changes.
- **Patient profile:** a shared compact header integrates Back, patient identity, existing metadata and actions without repeating the full name. Small visit histories share a balanced row with the clinical overview. Larger visit histories use a full-width grid with the overview above them. Independent activities now occupy the entire content width, immediately after the clinical panels. Existing aggregate analytics and per-game resume actions remain below the history rather than creating a long, narrow lead-in column. Stored ratings and notes remain unchanged; rating fractions render in LTR order.
- **Activity history:** responsive cards show game, stored date, native result summary, duration and `عرض التفاصيل`. There is no cap or hidden subset of activities. Cards use three columns on laptops/desktops where space permits, two on the tested tablets, four on wide desktops and one on narrow phones. Existing detail routes open the full native session analytics. Unavailable measurements remain unavailable.
- **Therapy visit details:** the same compact header contains Back, patient context, recorded visit number/title/date/therapist/status, and the existing duration fields. All original evaluation, notes, activity and result actions remain.
- **YouTube:** a centered workspace balances an opening card with a real sharing/status panel. Start, Hide and Stop remain connected to their original handlers with unchanged permission and safety conditions. Favorites remain available. No video preview or media transport was added or altered.

## Verification

**48 focused unit/component tests passed across 14 files.** Coverage includes deterministic pagination and ties, complete category discoverability, navigation/back links, existing clinical formatting and analytics, complete 24-card history rendering, unchanged records and unavailable measurements. TypeScript, scoped ESLint, and the final production build passed. One fixture enum typing error was corrected during verification; it did not require an application behavior change.

Browser QA used synthetic records in isolated local Firebase Auth/RTDB emulators: 23 initial patients, a 24th temporary test patient, 24 saved activities, and profiles containing one and fourteen visits. The added test patient was deactivated after the pagination check; no clinical record was deleted. The existing localhost:3000 server was not restarted or used for QA; previews used separate ports 3411/3412 with demo Firebase configuration.

Checks passed for:

- Removed sidebar/home content and retained real readiness/session actions.
- Five category-only tabs, default selection, original launch parameters and all 22 games discoverable.
- Pagination as 10/10/3, both chronological sorts, name/number search, no-result state, live additions and page clamping after deactivation.
- All 24 activity cards, original native detail links, fourteen accessible visits, patient identity shown once, and existing visit context/actions.
- Centered YouTube controls, original opening link, a synthetic favorite and no fabricated preview.
- All six pages at **1440×900, 1366×768, 1180×820, and 820×1180**, without horizontal overflow. Wide 1920px and narrow 390px history checks confirm four/one columns respectively.
- Exact equality of the historical visits and saved activities read from Firebase before and after the UI checks. Comparisons use Firebase's stored representation, including its normal removal of empty arrays.

[Browser results](browser-results.json) · [Production smoke results](production-results.json)

## Before/after screenshots

Screenshots contain synthetic data and remain local under the repository's existing screenshot ignore policy.

| Page | Before | After |
| --- | --- | --- |
| Dashboard/sidebar | [Before](screenshots/before-home.png) | [After](screenshots/final-home.png) |
| Activities | [Before](screenshots/before-activities.png) | [After](screenshots/final-activities.png) |
| Patient registry | [Before](screenshots/before-registry.png) | [After](screenshots/final-registry.png) |
| Patient profile | [Before](screenshots/before-profile.png) | [After](screenshots/final-profile.png) |
| Visit details | [Before](screenshots/before-visit.png) | [After](screenshots/final-visit.png) |
| YouTube | [Before](screenshots/before-youtube.png) | [After](screenshots/final-youtube.png) |

[Full-width history grid](screenshots/final-history.png) · [Wide desktop: four columns](screenshots/history-wide-1920.png) · [Tablet: two columns](screenshots/history-820x1180.png) · [Phone: one column](screenshots/history-mobile.png) · [Fourteen visits](screenshots/final-many-visits.png)

Each required viewport also has individual `after-<page>-<width>x<height>.png` captures.

## Preservation and limits

Game engines/scoring, 22-game registry, Firebase rules, patient schemas, clinical calculations, historical records, Control/Display synchronization, sensors and YouTube WebRTC/capture transport were not modified. No production data was read or changed. Existing release feature switches remain unchanged; local QA enables them only in its child processes.

Chrome viewport checks do not verify real iPad/Safari or physical equipment. Real YouTube tab capture/audio, Bluetooth sensors and real projectors were outside this layout-only pass. No gameplay or endurance suites were run. The existing four untracked files (`.auth-incident.firebase.json`, `docs/display-authentication-no-lease.md`, `tsconfig.auth-incident.json`, `tsconfig.integration.json`) remain untouched and excluded from this commit.

QA helpers live in `qa/`; logs are local `unit-tests.log`, `typescript.log`, `eslint.log`, and `build.log`. `seed.cjs` targets only the fixed loopback demo namespace; `browser.cjs` tests the demo preview on 3411. `local.cjs build/start` prepares/serves an isolated demo production build on 3412, and `production-smoke.cjs` checks that build. Set `PLAYWRIGHT_MODULE` to an existing Playwright installation if needed. Use isolated Auth/RTDB emulators on 19949/19940 with a temporary copy of the existing rules. Do not publish emulator settings.
