import {
  authorizeTherapist,
  consumeRate,
  searchVideos,
  SearchError,
} from "@/lib/youtube/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(authorization))
      throw new SearchError("unauthenticated", 401);
    const uid = await authorizeTherapist(authorization.slice(7));
    consumeRate(uid);
    const reader = request.body?.getReader();
    let raw = "",
      size = 0;
    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const part = await reader.read();
        if (part.done) {
          raw += decoder.decode();
          break;
        }
        size += part.value.byteLength;
        if (size > 2048) {
          await reader.cancel();
          throw new SearchError("invalid-query", 400);
        }
        raw += decoder.decode(part.value, { stream: true });
      }
    }
    if (raw.length > 2048) throw new SearchError("invalid-query", 400);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new SearchError("invalid-query", 400);
    }
    return Response.json(await searchVideos(body?.query, body?.pageToken), {
      headers,
    });
  } catch (error) {
    const failure =
      error instanceof SearchError
        ? error
        : new SearchError("search-unavailable", 503);
    return Response.json(
      { error: failure.code },
      {
        status: failure.status,
        headers: {
          ...headers,
          ...(failure.status === 429 ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }
}
