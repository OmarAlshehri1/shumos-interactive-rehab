#!/bin/zsh

set -euo pipefail

script_dir="${0:A:h}"
project_root="${script_dir:h}"
diagnostic_url="http://localhost:3000/control/sensor-hand-demo"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if ! curl --silent --fail --max-time 2 "$diagnostic_url" >/dev/null 2>&1; then
  cd "$project_root"
  npm run dev -- --port 3000 &
  server_pid="$!"

  for attempt in {1..60}; do
    if curl --silent --fail --max-time 2 "$diagnostic_url" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$server_pid" 2>/dev/null; then
      echo "تعذر تشغيل خادم الاختبار." >&2
      exit 1
    fi
    sleep 1
  done
fi

if ! curl --silent --fail --max-time 2 "$diagnostic_url" >/dev/null 2>&1; then
  echo "لم تصبح شاشة الاختبار جاهزة خلال 60 ثانية." >&2
  exit 1
fi

if [[ -d "/Applications/Google Chrome.app" ]]; then
  open -a "Google Chrome" "$diagnostic_url"
elif [[ -d "/Applications/Microsoft Edge.app" ]]; then
  open -a "Microsoft Edge" "$diagnostic_url"
else
  open "$diagnostic_url"
fi
echo "تم فتح اختبار WT901BLECL العربي. اترك هذه النافذة الطرفية مفتوحة أثناء الاختبار."

if [[ -n "$server_pid" ]]; then
  wait "$server_pid"
fi
