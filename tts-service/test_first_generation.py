#!/usr/bin/env python3
"""TEST FIRST — generates exactly ONE phrase with demo_female_3, using the
exact same logic as AudarAI's own examples/synthesize_gguf.py (imported
from the vendored, unmodified official module), pointed at the GGUF file
already downloaded by scripts/start-tts.sh rather than re-downloading via
hf_hub_download's own cache."""
import re
import sys
import time
from pathlib import Path

import soundfile as sf
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "vendor" / "Audar-TTS-V1"))
from audar_tts import OUT_SR, build_prompt, encode_reference  # noqa: E402

from llama_cpp import Llama  # noqa: E402
from neucodec import NeuCodec  # noqa: E402

GGUF_PATH = HERE / "models" / "Audar-TTS-V1-Flash-Q4_K_M.gguf"
REF_WAV = HERE / "voices" / "demo_female_3_source.wav"

import json  # noqa: E402

ref_meta = json.loads((HERE / "voices" / "demo_female_3.json").read_text(encoding="utf-8"))
REF_TEXT = ref_meta["transcript"]

TEXT = "يلا، دور على البالونات الزرقاء!"

print(f"Loading GGUF backbone: {GGUF_PATH.name} ...")
t0 = time.time()
llm = Llama(model_path=str(GGUF_PATH), n_ctx=4096, n_gpu_layers=-1, verbose=False)
print(f"  loaded in {time.time() - t0:.1f}s")

print("Loading NeuCodec ...")
t0 = time.time()
codec = NeuCodec.from_pretrained("neuphonic/neucodec").eval()
print(f"  loaded in {time.time() - t0:.1f}s")

print(f"Encoding demo_female_3 reference clip ({REF_WAV.name}) ...")
t0 = time.time()
ref_codes = encode_reference(codec, str(REF_WAV))
print(f"  encoded in {time.time() - t0:.1f}s ({len(ref_codes)} codec tokens)")

print(f"\nGenerating: {TEXT!r}")
t0 = time.time()
prompt = build_prompt(TEXT, REF_TEXT, ref_codes)
tce = llm.tokenize(b"<|TARGET_CODES_END|>", add_bos=False, special=True)[0]
toks = llm.tokenize(prompt.encode("utf-8"), add_bos=False, special=True)
ids = []
for tid in llm.generate(toks, temp=1.0, top_k=40, top_p=0.9, repeat_penalty=1.1):
    if tid == tce or len(ids) >= 2048:
        break
    ids.append(tid)
gen_time = time.time() - t0
text = "".join(llm.detokenize([t], special=True).decode("utf-8", "ignore") for t in ids)
codes = [int(x) for x in re.findall(r"<\|speech_(\d+)\|>", text)]
print(f"  generated {len(codes)} speech tokens in {gen_time:.1f}s")

if not codes:
    sys.exit("FAILED: model emitted no speech tokens")

t0 = time.time()
with torch.no_grad():
    wav = codec.decode_code(torch.tensor(codes)[None, None, :]).cpu().numpy()[0, 0, :]
decode_time = time.time() - t0
out_path = HERE / "test_output.wav"
sf.write(out_path, wav, OUT_SR)

duration_s = len(wav) / OUT_SR
print(f"  decoded in {decode_time:.1f}s")
print(f"\nWrote {out_path} — {duration_s:.2f}s of audio @ {OUT_SR} Hz")
print(f"Total generation+decode time: {gen_time + decode_time:.1f}s")
print("PASS: valid WAV produced with demo_female_3, no paid API request made.")
