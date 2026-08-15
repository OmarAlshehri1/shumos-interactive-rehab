#!/usr/bin/env python3
"""TASK 10 — local Audar-TTS-V1-Flash HTTP service.

Loads the GGUF backbone + NeuCodec ONCE at startup and keeps them warm in
memory (per "do not reload the model for every phrase" — see the report).
Exposes exactly the shape Balloon Quest's Next.js side expects:

    POST /tts   { "text": "..." }  ->  200 audio/wav
    GET  /health                    ->  200 { "status": "ready", ... }

Bound to 127.0.0.1 only by default (see main() / --host) — this is meant to
run on the clinic computer physically connected to the projector, never
exposed to the internet.

Uses AudarAI's own official inference helpers (audar_tts.build_prompt,
audar_tts.encode_reference — vendored from github.com/AudarAI/Audar-TTS-V1,
Apache-2.0, see scripts/start-tts.sh) rather than reimplementing the prompt
format, so this stays correct if AudarAI refines it upstream.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
VENDOR_DIR = HERE / "vendor" / "Audar-TTS-V1"
sys.path.insert(0, str(VENDOR_DIR))

try:
    from audar_tts import build_prompt, encode_reference  # type: ignore
except ImportError as e:  # pragma: no cover
    sys.exit(
        f"Could not import AudarAI's audar_tts module from {VENDOR_DIR} ({e}).\n"
        "Run ./scripts/start-tts.sh first — it fetches this from "
        "github.com/AudarAI/Audar-TTS-V1 (Apache-2.0)."
    )

MODELS_DIR = HERE / "models"
VOICES_DIR = HERE / "voices"
CACHE_DIR = HERE / "cache"
CACHE_DIR.mkdir(exist_ok=True)

GGUF_PATH = MODELS_DIR / "Audar-TTS-V1-Flash-Q4_K_M.gguf"
REFERENCE_WAV = VOICES_DIR / "demo_female_3_source.wav"
REFERENCE_META = VOICES_DIR / "demo_female_3.json"
OUT_SR = 24_000
MAX_TEXT_LENGTH = 500
MAX_NEW_TOKENS = 2048

logging.basicConfig(level=logging.INFO, format="[audar-tts] %(message)s")
log = logging.getLogger("audar-tts")

app = FastAPI(title="Audar-TTS-V1-Flash local service")
app.add_middleware(
    CORSMiddleware,
    # Next.js dev/prod both run on this same machine — localhost origins only.
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class State:
    llm = None
    codec = None
    ref_codes: list[int] | None = None
    ref_text: str = ""
    gen_lock = asyncio.Lock()  # serializes real generation — "do not overwhelm the local model"
    ready = False


state = State()


class TtsRequest(BaseModel):
    text: str


def cache_path(text: str) -> Path:
    # Exact-text cache key (same principle as the Next.js /api/tts cache) —
    # hashed only because raw Arabic text isn't a safe filename, not for any
    # privacy reason (a child's first name in cache/*.wav is expected).
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]
    return CACHE_DIR / f"{digest}.wav"


@app.on_event("startup")
def load_model() -> None:
    if not GGUF_PATH.exists():
        sys.exit(f"Missing {GGUF_PATH} — run ./scripts/start-tts.sh to download it first.")
    if not REFERENCE_WAV.exists():
        sys.exit(f"Missing {REFERENCE_WAV} — run ./scripts/start-tts.sh to download it first.")
    if not REFERENCE_META.exists():
        sys.exit(
            f"Missing {REFERENCE_META} — run derive_reference_transcript.py first "
            "(AudarAI does not publish a transcript for demo_female_3; see that script's doc comment)."
        )

    from llama_cpp import Llama
    from neucodec import NeuCodec

    t0 = time.time()
    log.info("loading GGUF backbone (%s) ...", GGUF_PATH.name)
    state.llm = Llama(model_path=str(GGUF_PATH), n_ctx=4096, n_gpu_layers=-1, verbose=False)
    log.info("loading NeuCodec ...")
    state.codec = NeuCodec.from_pretrained("neuphonic/neucodec").eval()

    meta = json.loads(REFERENCE_META.read_text(encoding="utf-8"))
    state.ref_text = meta["transcript"]
    log.info("encoding demo_female_3 reference clip (once, kept warm) ...")
    state.ref_codes = encode_reference(state.codec, str(REFERENCE_WAV))

    state.ready = True
    log.info("ready in %.1fs — voice=demo_female_3, ref_text=%r", time.time() - t0, state.ref_text)


_SPEECH_RE = re.compile(r"<\|speech_(\d+)\|>")


def generate_wav(text: str) -> np.ndarray:
    """Mirrors AudarAI's own examples/synthesize_gguf.py generation loop exactly."""
    prompt = build_prompt(text, state.ref_text, state.ref_codes)
    llm = state.llm
    tce = llm.tokenize(b"<|TARGET_CODES_END|>", add_bos=False, special=True)[0]
    toks = llm.tokenize(prompt.encode("utf-8"), add_bos=False, special=True)

    ids: list[int] = []
    for tid in llm.generate(toks, temp=1.0, top_k=40, top_p=0.9, repeat_penalty=1.1):
        if tid == tce or len(ids) >= MAX_NEW_TOKENS:
            break
        ids.append(tid)

    decoded = "".join(llm.detokenize([t], special=True).decode("utf-8", "ignore") for t in ids)
    codes = [int(x) for x in _SPEECH_RE.findall(decoded)]
    if not codes:
        raise RuntimeError("model emitted no speech tokens")

    with torch.no_grad():
        wav = state.codec.decode_code(torch.tensor(codes)[None, None, :]).cpu().numpy()[0, 0, :]
    return wav


@app.get("/health")
def health():
    return {
        "status": "ready" if state.ready else "loading",
        "voice": "demo_female_3",
        "model": GGUF_PATH.name,
    }


@app.post("/tts")
async def tts(req: TtsRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Missing 'text'")
    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(400, "Text too long")
    if not state.ready:
        raise HTTPException(503, "Model still loading")

    cached = cache_path(text)
    if cached.exists():
        return Response(content=cached.read_bytes(), media_type="audio/wav")

    async with state.gen_lock:
        # Re-check after acquiring the lock — another request for the exact
        # same text may have just finished and populated the cache.
        if cached.exists():
            return Response(content=cached.read_bytes(), media_type="audio/wav")
        try:
            t0 = time.time()
            wav = await asyncio.to_thread(generate_wav, text)
            log.info("generated %d chars in %.2fs", len(text), time.time() - t0)
        except Exception as e:  # noqa: BLE001 — surface as a clean 500, never crash the service
            log.warning("generation failed for a %d-char line: %s", len(text), e)
            raise HTTPException(500, "Speech generation failed") from e

    buf_path = cached.with_suffix(".tmp.wav")
    sf.write(buf_path, wav, OUT_SR)
    buf_path.replace(cached)  # atomic — a concurrent reader never sees a half-written file
    return Response(content=cached.read_bytes(), media_type="audio/wav")


if __name__ == "__main__":
    import argparse

    import uvicorn

    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8890)
    args = ap.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
