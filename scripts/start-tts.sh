#!/usr/bin/env bash
# TASK 10 — one-command setup + start for the local Audar-TTS-V1-Flash
# service that replaces Munsit. Safe to re-run: every step is idempotent
# (skips work that's already done), so this is also the normal "start my
# clinic computer for the day" command going forward.
#
# What this does, in order:
#   1. Checks for a compatible local Python (llama-cpp-python's ecosystem
#      needs a mainstream CPython — Homebrew's bleeding-edge python@3.14 is
#      generally too new for prebuilt ML wheels; this project pins 3.11).
#   2. Creates/reuses a venv in tts-service/.venv and installs requirements.
#   3. Vendors AudarAI's own audar_tts helper module (Apache-2.0) from
#      github.com/AudarAI/Audar-TTS-V1 — never hand-reimplemented, so the
#      exact official prompt format is what actually runs.
#   4. Downloads Audar-TTS-V1-Flash-Q4_K_M.gguf and the demo_female_3
#      reference clip from huggingface.co/audarai/Audar-TTS-V1-Flash —
#      weights are NEVER committed to this repo (see .gitignore).
#   5. Derives demo_female_3's reference transcript once via real ASR, if
#      not already cached (AudarAI does not publish this transcript — see
#      tts-service/derive_reference_transcript.py's doc comment).
#   6. Starts the FastAPI service (loads the model once, stays warm).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$ROOT_DIR/tts-service"
VENV_DIR="$SERVICE_DIR/.venv"
VENDOR_DIR="$SERVICE_DIR/vendor/Audar-TTS-V1"
HF_REPO="https://huggingface.co/audarai/Audar-TTS-V1-Flash/resolve/main"

log() { echo "[start-tts] $*"; }

# --- 1. Python check -------------------------------------------------------
PYTHON_BIN="${AUDAR_PYTHON:-}"
if [ -z "$PYTHON_BIN" ]; then
  for candidate in python3.11 python3.12 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
      ver="$("$candidate" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')"
      major="${ver%%.*}"; minor="${ver##*.}"
      if [ "$major" = "3" ] && [ "$minor" -ge 10 ] && [ "$minor" -le 12 ]; then
        PYTHON_BIN="$candidate"
        break
      fi
    fi
  done
fi
if [ -z "$PYTHON_BIN" ]; then
  echo "No compatible Python found (need 3.10-3.12; llama-cpp-python's ecosystem"
  echo "generally lacks prebuilt wheels for very new Python releases like 3.14)."
  echo "Install one, e.g.: brew install python@3.11"
  echo "Then re-run this script, or set AUDAR_PYTHON=/path/to/python3.11"
  exit 1
fi
log "using $($PYTHON_BIN --version) at $(command -v "$PYTHON_BIN")"

# --- 2. Build tools (cmake/ninja) — needed to build llama-cpp-python's ----
#        Metal-accelerated C++ extension. A prebuilt wheel may satisfy this
#        without them; only fail if pip actually needs to compile.
if ! command -v cmake >/dev/null 2>&1 || ! command -v ninja >/dev/null 2>&1; then
  log "cmake/ninja not found — installing via Homebrew (only needed if no prebuilt wheel matches)..."
  brew install cmake ninja
fi

# --- 3. venv + Python deps ---------------------------------------------------
if [ ! -d "$VENV_DIR" ]; then
  log "creating venv at $VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
pip install --upgrade pip -q

NEED_INSTALL=0
python - <<'PY' || NEED_INSTALL=1
import importlib
for mod in ("llama_cpp", "neucodec", "fastapi", "uvicorn", "whisper", "soundfile", "torch"):
    importlib.import_module(mod)
PY
if [ "$NEED_INSTALL" = "1" ]; then
  log "installing Python dependencies (first run only — this is the slow step, several minutes)..."
  CMAKE_ARGS="-DGGML_METAL=on" pip install -r "$SERVICE_DIR/requirements.txt"
else
  log "Python dependencies already installed"
fi

# --- 4. Vendor AudarAI's official audar_tts module (Apache-2.0) -----------
if [ ! -d "$VENDOR_DIR/audar_tts" ]; then
  log "fetching AudarAI/Audar-TTS-V1 (Apache-2.0) for the official audar_tts module..."
  mkdir -p "$(dirname "$VENDOR_DIR")"
  git clone --depth 1 https://github.com/AudarAI/Audar-TTS-V1.git "$VENDOR_DIR"
else
  log "audar_tts module already vendored at $VENDOR_DIR"
fi

# --- 5. Model + reference voice download -----------------------------------
mkdir -p "$SERVICE_DIR/models" "$SERVICE_DIR/voices"
GGUF_PATH="$SERVICE_DIR/models/Audar-TTS-V1-Flash-Q4_K_M.gguf"
if [ ! -f "$GGUF_PATH" ]; then
  log "downloading Audar-TTS-V1-Flash-Q4_K_M.gguf (~460MB, one time)..."
  curl -L -o "$GGUF_PATH" "$HF_REPO/Audar-TTS-V1-Flash-Q4_K_M.gguf"
else
  log "GGUF model already present"
fi

REF_WAV="$SERVICE_DIR/voices/demo_female_3_source.wav"
if [ ! -f "$REF_WAV" ]; then
  log "downloading demo_female_3 reference clip..."
  curl -L -o "$REF_WAV" "$HF_REPO/samples/demo_female_3_source.wav"
else
  log "demo_female_3 reference clip already present"
fi

# --- 6. Derive the reference transcript once (see script doc comment) -----
REF_META="$SERVICE_DIR/voices/demo_female_3.json"
if [ ! -f "$REF_META" ]; then
  log "deriving demo_female_3's reference transcript via Whisper (one time)..."
  python "$SERVICE_DIR/derive_reference_transcript.py"
else
  log "reference transcript already cached at $REF_META"
fi

# --- 7. Start the service ---------------------------------------------------
PORT="${AUDAR_TTS_PORT:-8890}"
log "starting Audar-TTS-V1-Flash service on 127.0.0.1:$PORT (Ctrl-C to stop)"
exec python "$SERVICE_DIR/server.py" --host 127.0.0.1 --port "$PORT"
