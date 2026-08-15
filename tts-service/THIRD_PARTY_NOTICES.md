# Third-Party Notices — Local Audar-TTS-V1-Flash Service

This directory (`tts-service/`) runs entirely locally and depends on the
following third-party components. None of their weights or source are
committed to this repository — `scripts/start-tts.sh` downloads/vendors them
fresh on each machine (see `.gitignore`).

## Audar-TTS-V1-Flash (model weights)

- Source: https://huggingface.co/audarai/Audar-TTS-V1-Flash
- Copyright 2026 AUDARAI PTE. LTD.
- License: **AudarAI Open License v1.0**
  https://www.audarai.com/license/audarai-open-license-v1.0/
  — permits commercial use, redistribution, and modification with no
  revenue cap, user cap, field-of-use restriction, or royalty. Requires
  including the license with redistributions, retaining notices, and
  identifying modifications. Provided "AS IS", no warranty.
- Voice used: the officially shipped, ready-to-use synthetic reference
  voice **`demo_female_3`** ("female, airy, dreamy") — per AudarAI's model
  card, the six ready-to-use voices are "synthetic voices created by
  interpolating multiple speakers — they do not replicate or resemble any
  real individual." No real person's voice was cloned for this project.

## Audar-TTS-V1 example/inference code (`tts-service/vendor/Audar-TTS-V1/`)

- Source: https://github.com/AudarAI/Audar-TTS-V1
- Copyright 2026 AUDARAI PTE. LTD.
- License: **Apache License, Version 2.0** (see the vendored `LICENSE`/`NOTICE`
  files at that path once `scripts/start-tts.sh` has run)
- This project uses AudarAI's own official `audar_tts` reference-inference
  helpers (`build_prompt`, `encode_reference`) unmodified, rather than
  reimplementing the zero-shot prompt format independently.

## NeuCodec

- Source: https://huggingface.co/neuphonic/neucodec
- Publisher: Neuphonic
- License: Apache License, Version 2.0
- Used to encode the `demo_female_3` reference clip and decode generated
  speech tokens to audio, exactly as AudarAI's own examples do.

## Reference transcript (demo_female_3)

AudarAI's official repositories ship the `demo_female_3` reference audio
clip but do not publish a transcript for it (confirmed by inspecting both
`huggingface.co/audarai/Audar-TTS-V1-Flash` and
`github.com/AudarAI/Audar-TTS-V1` directly — no `.txt`/`.json` transcript
file exists for it, and the `voices/registry.json` manifest explicitly
notes transcripts are not included). Audar's zero-shot prompt format
requires a transcript alongside the reference audio, so
`derive_reference_transcript.py` derives one via a real ASR pass
(OpenAI Whisper) rather than a hand-typed guess — the resulting
`voices/demo_female_3.json` is tagged with
`"transcript_source": "auto-transcribed via openai-whisper — not published by AudarAI"`
so this is never mistaken for an official AudarAI asset.

## OpenAI Whisper (bootstrap only, not on the request path)

- Source: https://github.com/openai/whisper
- License: MIT
- Used exactly once per machine, by `derive_reference_transcript.py`, to
  produce the reference transcript above. Not imported by `server.py` and
  not involved in normal request-time speech generation.

---

No model weights, vendored source, Python virtual environments, or
generated audio from any of the above are committed to this Git
repository — see `.gitignore`. Everything here is fetched or generated
locally by `scripts/start-tts.sh`.
