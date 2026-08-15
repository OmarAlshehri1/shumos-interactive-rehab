#!/usr/bin/env python3
"""One-time bootstrap: derive the transcript of Audar's demo_female_3 reference
clip via real ASR (Whisper), since AudarAI's official repos (huggingface.co/
audarai/Audar-TTS-V1-Flash and github.com/AudarAI/Audar-TTS-V1) ship the
reference audio itself (samples/demo_female_3_source.wav, and the same file
referenced from voices/registry.json) but do NOT publish a transcript string
for it anywhere — confirmed by inspecting both repos directly. Audar's own
zero-shot prompt format (audar_tts.build_prompt) requires a `ref_text`
alongside the reference audio, so a transcript is genuinely needed; this
script produces one honestly (via a real, well-known ASR model) rather than
guessing/typing Arabic prose and presenting it as "the official transcript."

Run once. Writes the result to voices/demo_female_3.json, which server.py
then loads at startup — this script is not on the request path.
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--wav", default=str(HERE / "voices" / "demo_female_3_source.wav"))
    ap.add_argument("--out", default=str(HERE / "voices" / "demo_female_3.json"))
    ap.add_argument("--model", default="small", help="Whisper model size (tiny/base/small/medium).")
    args = ap.parse_args()

    wav_path = Path(args.wav)
    if not wav_path.exists():
        sys.exit(f"Reference clip not found at {wav_path} — download it first (see scripts/start-tts.sh).")

    import whisper

    print(f"Loading Whisper '{args.model}' (one-time, CPU) ...")
    model = whisper.load_model(args.model)
    print(f"Transcribing {wav_path.name} ...")
    result = model.transcribe(str(wav_path))
    transcript = result["text"].strip()
    language = result.get("language", "unknown")

    if not transcript:
        sys.exit("Whisper produced an empty transcript — cannot proceed without a reference transcript.")

    out = {
        "voice_id": "demo_female_3",
        "reference_wav": "demo_female_3_source.wav",
        "transcript": transcript,
        "transcript_source": f"auto-transcribed via openai-whisper ({args.model}) — not published by AudarAI",
        "detected_language": language,
    }
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDetected language: {language}")
    print(f"Transcript: {transcript}")
    print(f"\nWrote {args.out}")


if __name__ == "__main__":
    main()
