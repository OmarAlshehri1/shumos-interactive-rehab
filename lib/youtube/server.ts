/** Server-only imports: no browser key or anonymous quota proxy. */
import { validVideo, type Video } from "./model";
export class SearchError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
const request = (url: string, init?: RequestInit) =>
  fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
export async function authorizeTherapist(token: string): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const database = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!apiKey || !database) throw new SearchError("auth-configuration", 503);
  const emulator = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST;
  if (emulator && !["127.0.0.1", "localhost"].includes(emulator))
    throw new SearchError("auth-configuration", 503);
  const endpoint = emulator
    ? `http://${emulator}:${Number(process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT)}/identitytoolkit.googleapis.com/v1/accounts:lookup`
    : "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
  const response = await request(
    `${endpoint}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    },
  );
  if (!response.ok) throw new SearchError("unauthenticated", 401);
  const account = (await response.json()).users?.[0];
  if (
    !account ||
    account.disabled ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(account.localId)
  )
    throw new SearchError("unauthenticated", 401);
  const dbURL = new URL(database);
  if (
    !emulator &&
    (dbURL.protocol !== "https:" ||
      !/\.(firebaseio\.com|firebasedatabase\.app)$/.test(dbURL.hostname))
  )
    throw new SearchError("auth-configuration", 503);
  dbURL.pathname = `/staff/${account.localId}/active.json`;
  dbURL.searchParams.set("auth", token);
  const staff = await request(dbURL.toString());
  if (!staff.ok || (await staff.json()) !== true)
    throw new SearchError("forbidden", 403);
  return account.localId;
}
// Bounded, warm-instance protection. Google project quotas provide the cross-instance hard cap.
const limits = new Map<string, { since: number; count: number }>();
export function consumeRate(uid: string, now = Date.now()) {
  for (const [id, v] of limits) if (now - v.since >= 60000) limits.delete(id);
  const old = limits.get(uid);
  if ((!old && limits.size >= 500) || (old && old.count >= 6))
    throw new SearchError("rate-limit", 429);
  limits.set(uid, { since: old?.since ?? now, count: (old?.count ?? 0) + 1 });
}
const cache = new Map<
  string,
  { expires: number; data: { videos: Video[]; nextPageToken: string | null } }
>();
export async function searchVideos(query: unknown, page: unknown) {
  if (
    typeof query !== "string" ||
    query.trim().length < 2 ||
    query.length > 120 ||
    /[\x00-\x1f<>]/.test(query)
  )
    throw new SearchError("invalid-query", 400);
  if (
    page !== undefined &&
    (typeof page !== "string" || !/^[A-Za-z0-9_=-]{1,256}$/.test(page))
  )
    throw new SearchError("invalid-page", 400);
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new SearchError("setup-required", 503);
  const cacheKey = JSON.stringify([query.trim(), page]);
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  for (const [k, v] of Object.entries({
    key,
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    safeSearch: "strict",
    maxResults: "12",
    q: query.trim(),
    ...(page ? { pageToken: page as string } : {}),
  }))
    url.searchParams.set(k, v);
  const response = await request(url.toString());
  const body = await response.json();
  if (!response.ok) {
    const reason = body.error?.errors?.[0]?.reason;
    throw new SearchError(
      ["quotaExceeded", "dailyLimitExceeded"].includes(reason)
        ? "quota-exceeded"
        : "search-unavailable",
      response.status === 403 ? 503 : 502,
    );
  }
  const text = (v: unknown, max: number) =>
    typeof v === "string" ? v.replace(/[<>]/g, "").slice(0, max) : "";
  const videos = (body.items ?? [])
    .map(
      (row: {
        id?: { videoId?: string };
        snippet?: { title?: string; channelTitle?: string };
      }) => ({
        videoId: row.id?.videoId,
        title: text(row.snippet?.title, 200),
        channel: text(row.snippet?.channelTitle, 120),
      }),
    )
    .filter(validVideo);
  const data = {
    videos,
    nextPageToken:
      typeof body.nextPageToken === "string" &&
      /^[A-Za-z0-9_=-]{1,256}$/.test(body.nextPageToken)
        ? body.nextPageToken
        : null,
  };
  for (const [k, v] of cache) if (v.expires < Date.now()) cache.delete(k);
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, { expires: Date.now() + 120000, data });
  return data;
}
