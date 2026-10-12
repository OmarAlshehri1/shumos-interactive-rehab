/** Calm sky for the platform's letterbox margins (replaces the legacy garden Environment for the redesigned Balloon Quest: no leaves, no birds). */
export function Bq3SkyBackground() {
  return <div aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(180deg, #7cc6f7 0%, #b5e1fb 52%, #e6f6ff 100%)" }} />;
}
