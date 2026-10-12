# Build Quest 3D — عالم البناء

The completed nine-stage Three.js game is registered in the normal Shumos library. Therapist touch Control can operate a child Display on another device through the existing Firebase architecture, without sensors. Optional RIGHT_HAND and handheld hardware remain pending physical validation.

Open `http://127.0.0.1:3000/control/activities` and select **عالم البناء**, or visit `/control/build-quest-3d`. Sign in through the normal staff gate, select a patient if history is wanted, and open **فتح شاشة الطفل** on the child device using the same reachable website origin. Normal `/display` also follows the active game. Select a piece, move with the touch arrows if desired, and tap its eligible matching target. Manual assistance remains available in every input mode.

Configured Firebase environments use authoritative accepted state and immutable versioned patient history. Without Firebase configuration, the prior local demonstration remains browser-local. Configured connection failures disable edits rather than switching to local transport. Walk-in sessions do not save history.

Production requires `NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED=true` at build time and the reviewed additive rules published **before** the enabled application. False disables the card and dedicated screens after restart/rebuild. No rules or application deployment was performed.

- [Current cross-device report, exact files and deployment/rollback instructions](CROSS_DEVICE_INTEGRATION_REPORT.md)
- [COMPLETE Firebase Console rules document](DATABASE_RULES_FOR_FIREBASE_CONSOLE.json)
- [Validation setup and evidence](validation/README.md)
- Historical completed phases: [Q1](PHASE_Q1_REPORT.md), [Q2](PHASE_Q2_REPORT.md), [Q3](PHASE_Q3_REPORT.md), [Q4](PHASE_Q4_REPORT.md), [local integration](LOCAL_INTEGRATION_REPORT.md).

Historical reports' local-only/production-disabled statements describe earlier milestones and are superseded by the current cross-device report. Real iPad/Safari, projector, WT901 and handheld tests remain pending.
