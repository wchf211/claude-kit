#!/usr/bin/env bash
# Installs the kit into Claude Code on this machine. Safe to run again after a git pull.
set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_HOME="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
MARKETPLACE="daniel-kit"

echo "Kit: $KIT"
mkdir -p "$CLAUDE_HOME/skills"

# 1. Skills: link each kit skill into ~/.claude/skills so every project sees it.
for dir in "$KIT"/skills/*/; do
  [ -f "$dir/SKILL.md" ] || continue
  name="$(basename "$dir")"
  ln -sfn "${dir%/}" "$CLAUDE_HOME/skills/$name"
  echo "skill   $name"
done

# 2. Global rules: import rules/global.md from ~/.claude/CLAUDE.md (added once).
import_line="@$KIT/rules/global.md"
touch "$CLAUDE_HOME/CLAUDE.md"
if ! grep -qxF "$import_line" "$CLAUDE_HOME/CLAUDE.md"; then
  printf '\n%s\n' "$import_line" >> "$CLAUDE_HOME/CLAUDE.md"
  echo "rules   imported into $CLAUDE_HOME/CLAUDE.md"
else
  echo "rules   already imported"
fi

# 3. Status line: point settings.json at the kit's script, unless another status line is already set.
SETTINGS="$CLAUDE_HOME/settings.json" STATUSLINE="python3 $KIT/statusline/statusline.py" FORCE="${KIT_FORCE_STATUSLINE:-}" python3 - <<'PY'
import json, os
path, command, force = os.environ["SETTINGS"], os.environ["STATUSLINE"], os.environ["FORCE"]
try:
    with open(path) as f:
        settings = json.load(f)
except (OSError, ValueError):
    settings = {}
current = (settings.get("statusLine") or {}).get("command", "")
if current and "claude-kit" not in current and not force:
    print("status  kept your own status line (KIT_FORCE_STATUSLINE=1 ./install.sh replaces it)")
else:
    settings["statusLine"] = {"type": "command", "command": command, "padding": 0}
    with open(path, "w") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")
    print("status  status line set")
PY

# 4. Mods: the kit folder is a local marketplace, read in place, so a git pull + /reload-plugins updates them.
if claude plugin marketplace list 2>/dev/null | grep -q "$MARKETPLACE"; then
  claude plugin marketplace update "$MARKETPLACE" >/dev/null
else
  claude plugin marketplace add "$KIT" >/dev/null
fi
for dir in "$KIT"/plugins/*/; do
  name="$(basename "$dir")"
  if claude plugin install "$name@$MARKETPLACE" >/dev/null 2>&1; then
    echo "mod     $name"
  else
    echo "mod     $name (already installed or failed; see: claude plugin list)"
  fi
done

echo "Done. Start a new Claude Code session (or run /reload-plugins) to load the mods."
