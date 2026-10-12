# Physical WT901 and projector validation — not yet executed

Record browser/version, machine, projector model/resolution, selected graphics quality, difficulty, date, tester and observations. This checklist is for supervised validation; software simulations do not establish clinical suitability or physical sensor latency.

1. Use the normal configured development server. Sign in through the existing staff flow. Connect the actual RIGHT_HAND WT901 using the existing setup screen, then navigate in the same Control tab to `/control/space-pilot-3d-prototype`.
2. Open Display from Control in a separate visible window on the projector, within the same browser profile and origin. Keep therapist Control visible on the other screen. Confirm active Display and sensor tracking. Do not use a second device for this local-channel prototype.
3. Begin on LOW difficulty. Align the hand pointer to the held ship. Confirm left/right/up/down and every diagonal map correctly. Test small comfortable movements, slow reversals and held positions. Check the whole movement envelope without changing calibration or adding smoothing.
4. Measure hand-to-screen response with a high-frame-rate camera if available; browser transport timing does not include BLE, sensor processing or projector latency. Record overshoot, jitter, drift, missed small movements and any discomfort.
5. Pause while moving and hold. Confirm ship, encounter time and score freeze. Resume with alignment. Use Re-engage before the existing recenter control; verify recenter cannot teleport through a collectible or asteroid.
6. Disconnect RIGHT_HAND during flight. Confirm safe suspension and unchanged score/time. Reconnect, align to the held position and resume explicitly. Repeat with a short dropout and sensor battery/power loss. LEFT_HAND activity must not steer.
7. Run all three missions. Collect stars and intentionally miss a few; avoid rocks and deliberately test one supervised collision. Compare Control and Display scores, accuracy, collision counts, tier upgrades and final summary.
8. Check readability on the actual projection: recognizable star silhouettes, distant rock warning, visible flame variants, open avoidance space, legible sparse HUD, no virtual directional controls needed. Ask whether the child understands the task and finds the pacing comfortable. This feedback is not yet collected.
9. Try medium/high graphics quality at the projector's actual resolution. Keep both windows open; switch focus to Control for at least a minute during gameplay. Record FPS/frame times using Display canvas `data-graphics-metrics` in developer tools if practical. Reduce quality if response degrades. Record any pause caused by browser throttling.
10. Pause then minimize and restore each window. Confirm no hidden scoring and explicit Resume. Reload Display and confirm accepted totals persist. Reload Control and confirm a new ready session plus the interrupted summary, not automatic continuation.
11. Test therapist workflow: difficulty before Start, input-mode changes, Pause/Resume, Re-engage, Restart, next mission and End. Restart must clear only the experimental run; End must freeze the final summary.
12. Run several supervised sessions for at least 30 minutes, with rest as appropriate. Record sensor stability, responsiveness, browser/GPU memory trends, projector heat or frame drops, accidental pauses and recovery success.
13. Confirm the original production Space Pilot and other games still work through their existing routes. Verify sensor behavior after leaving the experimental route using existing workflows. Do not alter production history or rules to conduct this test.

Sign-off remains pending. Any failed movement mapping, hidden scoring, unsafe resume, repeated dropout or unacceptable responsiveness must be resolved before an approved production integration.

## Phase 08 presentation checks — all still pending on physical equipment

- Read the Arabic labels on the projector at the intended viewing distance. Confirm the child can distinguish golden stars, gray rocks, and orange cracked rocks without a directional overlay.
- In Control choose **الصعوبة → سهل · رحلة هادئة**, **طريقة التحكم → مستشعر اليد اليمنى**, then **فتح شاشة الطفل**. Test **بدء الجلسة**, its three-second therapist countdown and **إلغاء العد التنازلي** before involving the child. The child screen waits for the therapist; it does not run an independent countdown.
- Before a session, expand **إعدادات العرض والراحة** and open **فتح العرض مع إعدادات المعالج**. Select **جودة الرسوم** and test **تقليل المؤثرات والحركة**. Close unused Display windows, select the intended primary if multiple remain, and hide settings before projection. Settings are per Display instance; the device's reduced-motion preference is applied automatically.
- Repeat small movements and diagonals with the larger oblique ship view. Check both wing tips and exhaust near the full movement limits, and whether the camera feels comfortable. Test reduced effects as well as the normal mode.
- Verify that **أحسنت! نجمة جديدة**, **مركبتك تطوّرت!**, and the gentle collision message are understandable. Observe both engine and wing upgrades. Check that banners never obstruct an important approach on the projector.
- Follow the complete hardware, disconnect/reconnect, recenter, pause/resume, focus-switching and 30-minute stability procedure above. Record observations separately from the automated software results. No physical check has been marked passed by this phase.

## R1 flight checks — pending on physical equipment

- Close older prototype windows and reopen the v2 Control/Display pair. Align to the held **steering** coordinate, which is independent of world position.
- At neutral verify continuous forward travel and a straight course. Hold a small left/right tilt: heading should settle at a bounded angle, without endless rotation. Return to neutral: lateral position remains offset, with no continued lateral drift after the physical turn finishes.
- Repeat climb/descent and reversals near the safe bounds. Confirm the camera reveals the corresponding side of the environment while keeping the ship visible and the horizon stable.
- Before Start, adjust **حساسية التوجيه**, **سرعة الانعطاف القصوى**, **الفاصل بين المواجهات**, **نصف عرض المجال**, and **حد الارتفاع** for a comfortable range. Do not change WT901 calibration to compensate for game difficulty. Record the settings.
- Compare **تقليل حركة الكاميرا** with normal chase follow, independently of **تقليل المؤثرات والحركة**. Ask about comfort, depth perception and visibility of approaching stars; stop if uncomfortable.
- Intentionally steer to off-center stars and try routes above and below asteroids. Verify the larger travel area remains understandable without directional buttons. Repeat sensor loss/recenter recovery while the ship is displaced and turning.


## R2 guided-flight checks — pending on physical equipment

- Start a fresh v3 pair. Begin with LOW and comfortable heading/width/vertical presets. Distinguish turning range from corridor size when adjusting the therapist settings.
- Hold left/right and climb/descent toward every edge; verify gradual outward slowing, uninterrupted forward motion, immediate response to inward steering, no bounce and stable camera framing.
- Try the straight and gently curved course. Confirm neutral follows that selected course while guidance never moves the ship toward a star automatically.
- Compare no guidance, star-only guidance and stars plus safe-passage cues. Ask the user to recover an offscreen objective and explain what the small marker means. Verify it remains readable on the actual projector without obscuring stars or hazards.
- Complete a mission near the edge and launch the next one. Confirm the first target is reachable at the selected hand range and turn speed.
- Compare the new Aurora hull/panel/engine detail, rock silhouettes, fiery cracks and planet depth at the target projector resolution. Check upgrade tiers and gentle avoidance/collection messages.
- Repeat all existing physical sensor dropout/recenter, pause/resume, focus, restart and longer-session checks. Measure actual end-to-end hand-to-projection latency; browser message latency is not a substitute.

## R3 / local release candidate — all physical checks pending

- Use the canonical library entry and open its dedicated child window. Confirm staff authorization, same-origin/profile pairing and the explicit local-only summary limitation. Use the legacy route for existing star/history sessions.
- Start EASY/LOW with the existing RIGHT_HAND calibration. Verify ignored vertical hand movement does not affect altitude, while pickup dots still represent the accepted raw hand position. Check comfortable recovery after movement while paused.
- Complete all selected mode/difficulty combinations. Observe actual ring-center passage, wing clearance, reasonable tolerance, misses and exactly-once rewards. Check ring contrast and growth at projector distance.
- In MEDIUM compare the three assistance strengths. Confirm smooth bounded altitude change, no horizontal autopilot and comfortable behavior around hazards. In ADVANCED verify direct two-axis response and R2 boundary reversals.
- Confirm both Arabic cards are understood without touching the child screen; Control alone continues or starts. Check every tier, ring count, score and final summary.
- Test disconnect/reconnect, recenter, pause/resume, restart, Control/Display reload, focus switching and 30-minute target-machine performance. Measure physical hand-to-projection delay separately from browser message timing.
- End the run, close its Display and verify the legacy rollback link. Record any issues before release approval; no physical/clinical result is inferred from software automation.
