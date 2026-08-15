import { NextResponse, type NextRequest } from "next/server";

/**
 * TASK 10 — server-side proxy to the LOCAL Audar-TTS-V1-Flash service
 * (see tts-service/server.py, started via `npm run tts` /
 * scripts/start-tts.sh). Munsit is retired — see the Task 10 report for
 * the full migration. This route's client-facing contract is unchanged
 * from the Munsit era on purpose: POST `{ text }`, get back raw `audio/wav`
 * bytes on success — so lib/audio/audarLocalProvider.ts (the client) needed
 * almost no changes versus the old munsitProvider.ts, and no scene
 * component anywhere needed to change at all.
 *
 * Why proxy through Next.js instead of the browser calling
 * http://127.0.0.1:8890 directly: keeps the "client never talks to the TTS
 * backend directly" boundary this app already had (now for consistency and
 * to avoid CORS, not to hide a secret — the local service has none), and
 * means the exact same client bundle works whether Next.js and the TTS
 * service are on the same machine (the normal clinic setup) or reachable
 * via a different local hostname (AUDAR_TTS_URL below).
 */

const AUDAR_TTS_URL = process.env.AUDAR_TTS_URL?.trim() || "http://127.0.0.1:8890/tts";
const REQUEST_TIMEOUT_MS = 25000; // local CPU/GPU generation can take several seconds for a longer line — see audarLocalProvider.ts
const MAX_TEXT_LENGTH = 500;

let warnedUnreachable = false;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = isTextBody(body) ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "Text too long" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const audarResponse = await fetch(AUDAR_TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!audarResponse.ok) {
      const errorMessage = await readAudarErrorMessage(audarResponse);
      console.error(`[audar-tts] request failed (${audarResponse.status}): ${errorMessage}`);
      return NextResponse.json({ error: errorMessage }, { status: audarResponse.status });
    }

    const audioBuffer = Buffer.from(await audarResponse.arrayBuffer());
    return new NextResponse(new Uint8Array(audioBuffer), { status: 200, headers: { "Content-Type": "audio/wav" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (!warnedUnreachable) {
      warnedUnreachable = true;
      console.warn(
        `[audar-tts] local service unreachable at ${AUDAR_TTS_URL} (${message}). ` +
          "Run `npm run tts` (or ./scripts/start-tts.sh) on this machine to start it. " +
          "Gameplay continues with visible text only until it's reachable — see lib/audio/AudioManager.ts.",
      );
    }
    return NextResponse.json({ error: "Local Audar TTS service unreachable" }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}

function isTextBody(value: unknown): value is { text: string } {
  return typeof value === "object" && value !== null && typeof (value as { text?: unknown }).text === "string";
}

async function readAudarErrorMessage(response: Response): Promise<string> {
  try {
    const errorBody = (await response.json()) as { detail?: string; error?: string };
    if (errorBody.detail) return errorBody.detail;
    if (errorBody.error) return errorBody.error;
  } catch {
    // Non-JSON error body — fall through to the generic message.
  }
  return `Local Audar service responded ${response.status}`;
}
