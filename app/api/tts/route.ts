import { NextResponse, type NextRequest } from "next/server";

/**
 * PRE-DEMO AUDIO FIX — server-side proxy to Munsit's real TTS API (docs:
 * https://docs.munsit.com/text-to-speech/synthesize), restored after the
 * Task 10 detour through a local Audar service. This route's client-facing
 * contract is UNCHANGED from before: POST `{ text }`, get back raw
 * `audio/wav` bytes on success — so lib/audio/munsitProvider.ts (the
 * client) needs no changes at all.
 *
 * MUNSIT_API_KEY is read ONLY here, a Next.js Route Handler that only ever
 * runs server-side, and is never referenced from any "use client" file —
 * see ARCHITECTURE.md's "Voice provider chain" section. The client never
 * talks to Munsit directly and never sees this key.
 */

const MUNSIT_TTS_URL = "https://api.munsit.com/api/v1/text-to-speech/faseeh-v1-preview";
/** الأصوات — "Lama," the Saudi Hijazi female voice this product has always used (confirmed still present via GET /api/v1/voices). */
const MUNSIT_VOICE_ID = "ar-hijazi-female-1";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_TEXT_LENGTH = 500;

let warnedMissingKey = false;

export async function POST(request: NextRequest) {
  // Explicit opt-out only: leaving the switch unset preserves the existing
  // enabled behavior. This guard intentionally runs before body parsing,
  // key lookup, timeout creation, or fetch so `false` guarantees zero
  // upstream Munsit requests while the client receives its normal clean
  // unavailable response and gameplay/local Web Audio continue unchanged.
  if (process.env.MUNSIT_TTS_ENABLED?.trim().toLowerCase() === "false") {
    // A successful empty response is intentional: an operator-controlled
    // disabled state is not a failed browser resource. The private header
    // lets munsitProvider settle speech callbacks without creating/playing
    // an empty Audio element or logging a warning.
    return new NextResponse(null, {
      status: 200,
      headers: { "X-TTS-Disabled": "true", "Cache-Control": "no-store" },
    });
  }

  const apiKey = process.env.MUNSIT_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.error("[munsit-tts] MUNSIT_API_KEY is not set — speech will stay silent (visible text/animation only) until it is configured.");
    }
    return NextResponse.json({ error: "TTS not configured" }, { status: 503 });
  }

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
    const munsitResponse = await fetch(MUNSIT_TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        voice_id: MUNSIT_VOICE_ID,
        text,
        stability: 0.5,
        speed: 1.0,
        streaming: false,
      }),
      signal: controller.signal,
    });

    if (!munsitResponse.ok) {
      const upstreamMessage = await readMunsitErrorMessage(munsitResponse);
      const errorMessage = upstreamMessage.includes(apiKey) ? "Munsit TTS request failed" : upstreamMessage;
      // 402 (insufficient balance) and 429 (rate/concurrency limit) are
      // expected, not-uncommon operating conditions for this account, not
      // incidents — log at warn, not error, so they don't look like a bug
      // report every time the quota is tight.
      const log = munsitResponse.status === 402 || munsitResponse.status === 429 ? console.warn : console.error;
      log(`[munsit-tts] request failed (${munsitResponse.status})`);
      // Status is passed straight through — munsitProvider.ts's own
      // cooldown policy branches on exactly these codes (429 -> short
      // cooldown, 5xx/network -> longer cooldown, other 4xx incl. 402 ->
      // no cooldown, just this one request fails) — see that file's doc
      // comment for why a single 402 must never blank out a whole session.
      return NextResponse.json({ error: errorMessage }, { status: munsitResponse.status });
    }

    const audioBuffer = Buffer.from(await munsitResponse.arrayBuffer());
    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    console.warn(`[munsit-tts] request to Munsit failed (${isTimeout ? "timeout" : "network error"})`);
    return NextResponse.json({ error: "Munsit TTS unreachable" }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}

function isTextBody(value: unknown): value is { text: string } {
  return typeof value === "object" && value !== null && typeof (value as { text?: unknown }).text === "string";
}

async function readMunsitErrorMessage(response: Response): Promise<string> {
  try {
    const errorBody = (await response.json()) as { errorMessage?: string; error?: string; message?: string };
    return errorBody.errorMessage ?? errorBody.error ?? errorBody.message ?? `Munsit responded ${response.status}`;
  } catch {
    return `Munsit responded ${response.status}`;
  }
}
