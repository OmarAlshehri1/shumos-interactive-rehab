/** Server-only Firebase verification and durable paid-TTS budget reservation. */
export class TtsAccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const TTS_QUOTAS = { staffMinute: 60, staffDailyCharacters: 40000, globalMinute: 240, globalDailyCharacters: 240000 } as const;
const call = (url: URL | string, init?: RequestInit) => fetch(url, {
  ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
});
function databaseURL(path: string, token: string): URL {
  const database = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!database) throw new TtsAccessError(503, "Authentication not configured");
  const url = new URL(database);
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST;
  if (host) {
    if (!['localhost', '127.0.0.1'].includes(host)) throw new TtsAccessError(503, "Authentication not configured");
    const namespace = url.searchParams.get('ns') || url.hostname.split('.')[0];
    url.protocol = 'http:'; url.hostname = host;
    url.port = String(Number(process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_PORT));
    url.searchParams.set('ns', namespace);
  } else if (url.protocol !== 'https:' || !/\.(firebaseio\.com|firebasedatabase\.app)$/.test(url.hostname)) {
    throw new TtsAccessError(503, "Authentication not configured");
  }
  url.pathname = `/${path}.json`; url.searchParams.set('auth', token);
  return url;
}
export type TtsActor = { uid: string; ownerUid: string; token: string };
export async function authorizeTts(header: string | null): Promise<TtsActor> {
  const token = header?.match(/^Bearer ([A-Za-z0-9._-]{20,4096})$/)?.[1];
  if (!token) throw new TtsAccessError(401, "Authentication required");
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new TtsAccessError(503, "Authentication not configured");
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST;
  if (host && !['localhost', '127.0.0.1'].includes(host)) throw new TtsAccessError(503, "Authentication not configured");
  const endpoint = host
    ? `http://${host}:${Number(process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT)}/identitytoolkit.googleapis.com/v1/accounts:lookup`
    : 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
  const lookup = await call(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }),
  });
  if (!lookup.ok) throw new TtsAccessError(401, "Invalid authentication");
  const account = (await lookup.json()).users?.[0];
  const uid = account?.localId;
  if (!account || account.disabled || typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new TtsAccessError(401, "Invalid authentication");
  const staff = await call(databaseURL(`staff/${uid}/active`, token));
  if (staff.ok && await staff.json() === true) return { uid, ownerUid: uid, token };
  // Rules check active approving staff, expiry, current published owner, and current lease.
  const approved = await call(databaseURL(`presence/displayAccess/${uid}`, token));
  if (!approved.ok) throw new TtsAccessError(403, "Display authorization required");
  const grant = await approved.json();
  if (!grant || typeof grant.approvedBy !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(grant.approvedBy) || typeof grant.expiresAt !== 'number' || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= Date.now()) {
    throw new TtsAccessError(403, "Display authorization required");
  }
  return { uid, ownerUid: grant.approvedBy, token };
}

type Usage = { minuteStart: number; requests: number; dayStart: number; characters: number };
export async function reserveTtsQuota(actor: TtsActor, characters: number): Promise<void> {
  if (!Number.isInteger(characters) || characters < 1 || characters > 500) throw new TtsAccessError(400, "Invalid text length");
  // Consume before paid work, never refund: retries/failures cannot double-spend a budget.
  for (const budget of [actor.ownerUid, '_global']) {
    const url = databaseURL(`ttsUsage/${budget}`, actor.token);
    let reserved = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await call(url, { headers: { 'X-Firebase-ETag': 'true' } });
      if (!response.ok) throw new TtsAccessError(response.status === 401 || response.status === 403 ? 403 : 503, "Quota unavailable");
      const etag = response.headers.get('etag');
      if (!etag) throw new TtsAccessError(503, "Quota unavailable");
      const old = await response.json() as Usage | null;
      const now = Date.now(), minuteStart = now - now % 60000, dayStart = now - now % 86400000;
      const next: Usage = {
        minuteStart, requests: (old?.minuteStart === minuteStart ? old.requests : 0) + 1,
        dayStart, characters: (old?.dayStart === dayStart ? old.characters : 0) + characters,
      };
      const global = budget === '_global';
      if (next.requests > (global ? TTS_QUOTAS.globalMinute : TTS_QUOTAS.staffMinute) || next.characters > (global ? TTS_QUOTAS.globalDailyCharacters : TTS_QUOTAS.staffDailyCharacters)) {
        throw new TtsAccessError(429, "TTS quota exceeded");
      }
      const write = await call(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': etag }, body: JSON.stringify(next) });
      if (write.ok) { reserved = true; break; }
      if (write.status !== 412) throw new TtsAccessError(write.status === 401 || write.status === 403 ? 403 : 503, "Quota unavailable");
    }
    if (!reserved) throw new TtsAccessError(429, "TTS quota busy");
  }
}

// Warm-instance admission guard bounds expensive token checks and upstream concurrency.
let windowStart = 0, admissions = 0, inFlight = 0;
export function enterTtsRequest(): () => void {
  const now = Date.now();
  if (now - windowStart >= 60000) { windowStart = now; admissions = 0; }
  if (++admissions > 300 || inFlight >= 8) throw new TtsAccessError(429, "TTS busy");
  inFlight++;
  return () => { inFlight--; };
}
