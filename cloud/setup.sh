#!/usr/bin/env bash
# Setup script for a Claude Code cloud environment: gives cloud sessions the same kit.
# Paste the two lines below into the environment's "Setup script" field.
set -euo pipefail
git clone --depth 1 https://github.com/wchf211/claude-kit.git "$HOME/claude-kit" 2>/dev/null || git -C "$HOME/claude-kit" pull --ff-only
"$HOME/claude-kit/install.sh"
