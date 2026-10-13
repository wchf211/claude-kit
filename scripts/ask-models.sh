#!/usr/bin/env bash
# Usage: ask-models.sh <prompt-file> <out-dir> [codex] [agy]
# Runs each named model (default: both) on the same prompt, each in its own
# empty directory, in parallel. Writes <out-dir>/codex.md and <out-dir>/agy.md,
# plus a .log per model. Exit code is the number of models that failed.
# Env: AGY_TIMEOUT (default 9m).
set -uo pipefail

if [ $# -lt 2 ]; then
  sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'
  exit 64
fi

prompt="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
[ -f "$prompt" ] || { echo "prompt file not found: $1" >&2; exit 66; }
mkdir -p "$2"
out="$(cd "$2" && pwd)"
shift 2
[ $# -eq 0 ] && set -- codex agy

agy_bin="$(command -v agy || echo "$HOME/.local/bin/agy")"

run_codex() {
  local iso="$out/.iso-codex"; mkdir -p "$iso"
  (cd "$iso" && codex exec --ephemeral --skip-git-repo-check -s read-only \
     -o "$out/codex.md" - < "$prompt" > "$out/codex.log" 2>&1)
}

run_agy() {
  local iso="$out/.iso-agy"; mkdir -p "$iso"
  (cd "$iso" && "$agy_bin" -p "$(cat "$prompt")" \
     --print-timeout "${AGY_TIMEOUT:-9m}" > "$out/agy.md" 2> "$out/agy.log")
}

pids=(); names=()
for m in "$@"; do
  case "$m" in
    codex) run_codex & ;;
    agy)   run_agy & ;;
    *) echo "unknown model: $m (use codex or agy)" >&2; exit 64 ;;
  esac
  pids+=($!); names+=("$m")
done

failed=0
for i in "${!pids[@]}"; do
  m="${names[$i]}"
  if wait "${pids[$i]}" && [ -s "$out/$m.md" ]; then
    echo "ok    $m  $(wc -c < "$out/$m.md" | tr -d ' ') bytes  $out/$m.md"
  else
    echo "FAIL  $m  see $out/$m.log" >&2
    failed=$((failed + 1))
  fi
done

# agy sometimes saves its answer as a file instead of printing it.
if [ -d "$out/.iso-agy" ]; then
  extra="$(find "$out/.iso-agy" -type f 2>/dev/null)"
  [ -n "$extra" ] && printf 'note  agy also wrote files:\n%s\n' "$extra"
fi
exit "$failed"
