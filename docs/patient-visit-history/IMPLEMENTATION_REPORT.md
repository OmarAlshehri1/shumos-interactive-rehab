# Patient therapy visit history refinement

Implemented locally on `main`, based on `fb869e3`. No commits, pushes, deployments, production rule publication, or production patient-data requests were made for this task.

## Patient experience

- The patient profile has compact, newest-first **الجلسات العلاجية** cards for actual parent visits. Each includes the stable number, entered title, Gregorian date, therapist, recorded actual duration, optional rating, status and detail link. There is no mandatory visit count or twelve-visit program.
- **بدء جلسة علاجية** opens the existing visit setup with the patient selected. **بدء نشاط مستقل** uses the existing independent activity flow. Neither navigating the library nor playing independently creates a completed parent visit.
- `/control/patients/[patientId]/visits/[visitId]` shows the visit header, therapist evaluation first, associated games/exercises and an overall summary. Ratings and notes remain optional; zero is a valid rating. Editing uses the existing owner-only policy and revision check. A rejected concurrent edit retains the draft.
- Activity rows expand to recorded clinical counts, stage, difficulty, duration, assistance and notes. Missing values show **غير مسجل**. Legacy replay fallback levels are withheld from clinical display and comparisons. Exercise hold targets are identified as targets; repetitions multiplied by hold time are never presented as measured duration.
- Comparisons describe recorded therapist ratings and repeated exercise objectives or game counts at matching levels. They do not claim clinical improvement or average unrelated scores into a medical rating. The previous-rating timeline expands only when requested.
- Linked visit games are excluded from the independent game history and its existing analytics/resume cards. Saved results with an interrupted linking claim appear separately. The owning therapist can recover their reference using the existing immutable claim and visit commit mechanisms, without saving the result again.
- Guest/demo activities remain outside persisted patient visit numbering. Ended visits without associated activities are explicitly labelled as ended without recorded activities.

## Data and rules

The existing version-1 visit schema, `visitId`, patient identities, activity evaluation fields, active-visit pointer, and immutable `sessions` records remain in use. No treatment program, subscription, second visit lifecycle, or clinical score schema was added.

A small persistent numbering index is added **inside the existing patient visit collection**:

```json
{
  "therapyVisits": {
    "patientId": {
      "_numbering": {
        "lastNumber": 2,
        "lastVisitId": "existingVisitB",
        "byVisit": { "existingVisitA": "1", "existingVisitB": "2" },
        "byNumber": { "1": "existingVisitA", "2": "existingVisitB" }
      }
    }
  }
}
```

On first authorized use, existing valid visits receive numbers in ascending `startedAt` order, with deterministic visit-ID ordering for ties. The original visit objects are not rewritten. Once assigned, numbers are immutable and survive edits, interruption, ending and reload. New visits, their number and the existing active pointer are written atomically; competing writers retry an acknowledged counter change. Failed writes cannot leave detached number reservations. A reserved-key collision or invalid index stops allocation rather than overwriting an existing record. Firebase numeric-key array serialization is handled explicitly.

Only the `_numbering` child was added to the pre-task rules candidate. The index requires existing active-staff/patient authorization, reciprocal immutable mappings, an actual visit, and a sequential counter update. Anonymous/inactive staff writes, deletion, renumbering, replacement, duplicate assignments and phantom reservations are denied. Clinical owner restrictions and immutable game history are unchanged.

`database.rules.json` and `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` are byte-identical combined local candidates. The preceding YouTube/security rule additions are preserved. **These rules have not been published.**

## Validation

All patient records and accounts used in testing were synthetic, on loopback Firebase Database/Auth emulators. Browser tests exercised the production build with fake emulator settings and all nineteen canonical game flags enabled; external TTS and YouTube services were disabled. No game graphics or mechanics were redesigned or exercised.

| Check | Result |
| --- | --- |
| Focused visit/history unit suites | 121 passed; 17 emulator cases skipped in this unit-only invocation |
| Combined platform, visit, numbering and YouTube rules emulator suites | 37 passed across 4 files; includes the visit/numbering cases skipped above |
| Browser integration | 15 checks passed, zero uncaught browser errors |
| TypeScript `npx tsc --noEmit` | Passed |
| Full repository lint | Passed with 0 errors and 6 pre-existing warnings in older QA scripts |
| Production build using isolated emulator configuration | Passed |
| Diff whitespace check | Passed |

Browser coverage: patients with 1/6/8/12/20 legacy visits; newest-first stable numbering and reload; independent history separation; missing replay levels; clinical drilldowns and exercises; factual comparison; optional/zero ratings and notes; concurrent edit rejection and retained draft; save-once reference recovery; creation and reload of visit 21; nineteen unique canonical library games; non-owner evaluation restrictions. Rules tests cover anonymous/inactive access and immutable result overwrite/deletion denials.

Screenshots retained locally:

- [Profile on iPad landscape](evidence/profile-ipad-landscape.png)
- [All twenty compact visit cards](evidence/profile-20-visits.png)
- [Visit detail on iPad landscape](evidence/detail-ipad-landscape.png)
- [Visit detail on iPad portrait](evidence/detail-ipad-portrait.png)
- [Machine-readable browser results](evidence/browser.json)

Generated evidence is ignored by Git. Test logs are under `/private/tmp/shumos-history-*.log`.

## Preservation and integration

The existing uncommitted YouTube/security source was backed up before this task in `/private/tmp/shumos-before-history-local-work.tar`, with hashes in `/private/tmp/shumos-history-prior-manifest.json`. All 29 protected prior-task files retain their contents except the deliberate numbering-rule additions in the two matching rules files and the evidence-directory addition to `.gitignore`. Game implementations/registry and patient/game-history type schemas were not changed. Achievement City remains in its separate worktree; it was not merged or edited.

Before a future release, review the combined local diff and publish the approved combined rules through the owner's separate release process **before enabling the new numbered-visit creation flow**. Older deployed rules do not permit numbering-index writes; failures are visible and new visits are not reported as created. No manual patient-data migration is required: legacy numbering is allocated on authorized use after the rules support it. Preserve the YouTube/security changes and `_numbering` rule child when integrating any other branch, and rerun shared checks if those files change.

This task stops at the local implementation and verified candidate. No push, deployment, Vercel variable change, or Firebase publication is authorized here.
