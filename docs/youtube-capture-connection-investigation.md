# YouTube capture connection investigation — 22 October 2026

Baseline: production/local commit `9ffa6ba`.

## Evidence and limits

The owner's screenshot shows the broad `start()` catch message. All synchronous
preflight refusals have different messages. The native API call is the first
await: Firebase share reads, lease preparation and SDP publication happen only
after it returns a selected stream. The screenshot alone cannot identify the
exception or prove which asynchronous stage failed.

The exact original capture options were tested with unmocked desktop Chrome:

- A user-activated request on localhost remained pending, without immediate rejection.
- The same request on the public production origin, in an isolated unsigned-in
  browser, also remained pending. No account/patient data was requested by the
  probe. Public production headers contain no blocking Permissions-Policy.
- The complete authenticated Control → authorized idle Display flow reached the
  real native request with active user activation in both local development and
  the retained synthetic production build. No signaling existed before selection.

Pending native requests establish that Chrome accepted invocation; they do not
establish that the owner's machine displays the chooser or can capture YouTube.
No real YouTube capture/audio or physical-device acceptance is claimed. The owner
has not supplied an underlying browser exception, Chrome version or OS. The
specific production root cause remains unconfirmed; no capture-option, security,
ownership or Firebase-policy workaround is justified by current evidence.

## Scoped local change

Previously, native TypeError, InvalidStateError, NotReadableError and other
non-cancellation failures were mislabeled as Display connection failures. These
now have distinct Arabic messages for native capture. Cancellation still returns
to idle. No permission is bypassed and no native call is retried automatically.

Development-only `[youtube-sharing]` diagnostics identify the failed stage,
allowlisted error code and capture focus/gesture state. They exclude identities,
raw exception messages, SDP, credentials and media. Production logs are disabled.
Capture invocation remains synchronous with the therapist's click, before awaits.

## Focused verification

- 26 unit cases across capture/preflight diagnostics, signaling schema and existing
  transition tests.
- Seven emulator signaling security cases: approved target/current lease, foreign
  and revoked/expired authorization, bounded session-bound signaling.
- 18 synthetic-media Chrome integration checks: authorized WebRTC audio/video,
  idle Display, hide/restore, ownership rejection, reload, revocation, offline,
  stop/cleanup and an unsaved-game guard. Capture/picker and autoplay responses
  in these 18 checks are simulated; the separate native probes above are unmocked.
- TypeScript and scoped ESLint passed. No full game suites or new production build.

Firebase rules, Display authentication, game mechanics, history and production
configuration are unchanged. The four pre-existing untracked files are preserved.
Nothing is pushed, deployed or published. This is a diagnostic/error-reporting
commit, not a confirmed repair of the owner's production capture failure.
