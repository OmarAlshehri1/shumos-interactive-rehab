# Native YouTube tab sharing

Local implementation for Control and the existing Display on the **same computer,
desktop Chrome profile and Shumos origin**. Requires HTTPS (localhost for testing).
Safari/iPad and separate computers are outside this implementation's scope.

## Media and authorization

Control opens the original YouTube site separately. A direct therapist click calls
`getDisplayMedia`; Chrome owns the permission picker. Only a browser-tab surface
is accepted. Tab audio is requested where available; the therapist must authorize
it in Chrome. Local audio suppression is requested to reduce duplicate playback.
Display offers an explicit playback button if browser autoplay is blocked.

Media uses direct WebRTC with host ICE candidates only, no STUN/TURN or media
backend. BroadcastChannel discovers local Display instances and carries routing
hints. Firebase verifies the addressed Display's existing scoped approval and
current active staff/controller ownership. It carries bounded SDP (20 KB each)
and session-bound playback acknowledgements, never captured audio/video.

The new `youtubeTabShare` rule subtree is a **local, unpublished candidate**.
Existing rule subtrees, including favorites, are unchanged. This candidate must
receive separate publication approval before releasing the application feature;
existing production rules do not authorize the new signaling path.

## Lifecycle and clinical guards

- Sharing requires an idle, connected Control and no canonical unfinished game.
  Existing save/end guards and history remain in use.
- Hide retains capture and the peer, pauses/mutes Display, and shows normal Shumos
  content. Restore reuses capture while its tracks remain alive.
- Full stop ends all tracks and peers and removes only the matching signal session;
  the original YouTube tab stays open.
- Control reload requires another explicit capture. Display reload can reconnect
  to surviving capture within a ten-second recovery window.
- Network loss, capture ending, approval revocation/expiry, lease handoff or a new
  live game stops sharing. Signals expire after 30 seconds and refresh every ten.
- Another Control window cannot replace a live sharing session. Native capture
  refreshes the existing controller lease without registering global disconnect
  deletion, so a rejected second window cannot remove the first window's lease.

## Focused validation

All data and accounts used for verification were synthetic, with local Firebase
Auth and Database emulators. No production data, rules or environment were changed.

- 37 unit tests: sharing schemas, existing YouTube lifecycle, Display authorization
  and auth client.
- 22 emulator cases: seven native sharing, seven scoped Display security, eight
  legacy YouTube/favorites rules. The legacy telemetry fixture now explicitly
  approves its synthetic anonymous Display; an unapproved identity is denied.
- TypeScript and scoped ESLint passed; one production build passed.
- 18 focused browser checks against that production build using real Chrome,
  Firebase clients and WebRTC, with **synthetic capture tracks and a mocked picker**:
  separate original-site link, cancellation, wrong surface, autoplay recovery,
  decoded video/audio, stale commands, competing Control, hide/restore, Display
  reload, full stop, capture end, Control reload, revocation, offline teardown,
  lease handoff, simulated unsupported device, active unsaved game, runtime errors.
- One synthetic Balance Bridge session verified the active-game guard; the 22-game
  suite was not run and game mechanics were not changed.

The native Chrome picker, real YouTube capture, the Share tab audio checkbox and
physical-device audio output still require manual verification. Autoplay denial
and iPad identity were simulated, not physical-device tests. No promise is made
about protected content or unsupported browser capture. No push or deployment is
included in this task.
