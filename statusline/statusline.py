#!/usr/bin/env python3
"""Claude Code status line: reads the session JSON on stdin, prints two colored lines.

Line 1: model · effort │ context │ prompt cache │ 5h / 7d quota │ cost
Line 2: folder  git branch (+dirty) │ session name

Green means fine, yellow means look soon, red means act now. Standard library only.
"""

import json
import os
import subprocess
import sys
import time

RESET = "\033[0m"
DIM = "\033[2m"
BOLD = "\033[1m"
RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
MAGENTA = "\033[35m"
CYAN = "\033[36m"

SEP = f" {DIM}│{RESET} "

# Thresholds (percent). Override with env vars, e.g. CLAUDE_SL_CTX_RED=60.
CTX_YELLOW = int(os.environ.get("CLAUDE_SL_CTX_YELLOW", "35"))
CTX_RED = int(os.environ.get("CLAUDE_SL_CTX_RED", "50"))
QUOTA_YELLOW = int(os.environ.get("CLAUDE_SL_QUOTA_YELLOW", "60"))
QUOTA_RED = int(os.environ.get("CLAUDE_SL_QUOTA_RED", "80"))


def paint(color, text):
    return f"{color}{text}{RESET}"


def level(value, yellow, red):
    return RED if value >= red else YELLOW if value >= yellow else GREEN


def tokens(n):
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M".replace(".0M", "M")
    return f"{round(n / 1000)}k"


def duration(seconds):
    seconds = max(0, int(seconds))
    if seconds >= 3600:
        return f"{seconds // 3600}h{(seconds % 3600) // 60:02d}m"
    if seconds >= 60:
        return f"{seconds // 60}m"
    return f"{seconds}s"


def model_part(data):
    name = (data.get("model") or {}).get("display_name") or (data.get("model") or {}).get("id") or "?"
    part = paint(BOLD + CYAN, name)
    effort = (data.get("effort") or {}).get("level")
    if effort:
        color = MAGENTA if effort in ("high", "xhigh", "max") else DIM
        part += f" {paint(color, effort)}"
    if data.get("fast_mode"):
        part += f" {paint(YELLOW, 'fast')}"
    return part


def context_part(data):
    ctx = data.get("context_window") or {}
    used = ctx.get("used_percentage")
    if used is None:
        return None
    size = ctx.get("context_window_size")
    total = ctx.get("total_input_tokens")
    detail = f" {DIM}{tokens(total)}/{tokens(size)}{RESET}" if total and size else ""
    return f"ctx {paint(level(used, CTX_YELLOW, CTX_RED), f'{used}%')}{detail}"


def cache_part(data, now):
    cache = data.get("prompt_cache") or {}
    if not cache.get("caching_observed"):
        return None
    expires = cache.get("expires_at")
    if not cache.get("warm") or not expires or expires <= now:
        return f"cache {paint(RED, 'cold')}"
    left = expires - now
    ttl = 3600 if cache.get("ttl") == "1h" else 300
    color = GREEN if left > ttl * 0.25 else YELLOW if left > 60 else RED
    return f"cache {paint(color, duration(left))}"


def quota_part(data, now):
    limits = data.get("rate_limits") or {}
    parts = []
    for key, label in (("five_hour", "5h"), ("seven_day", "7d")):
        window = limits.get(key)
        if not window or window.get("used_percentage") is None:
            continue
        used = window["used_percentage"]
        text = f"{label} {paint(level(used, QUOTA_YELLOW, QUOTA_RED), f'{used:g}%')}"
        resets = window.get("resets_at")
        if key == "five_hour" and resets and resets > now:
            text += f" {DIM}↻{duration(resets - now)}{RESET}"
        parts.append(text)
    return " ".join(parts) if parts else None


def cost_part(data):
    usd = (data.get("cost") or {}).get("total_cost_usd")
    if not usd:
        return None
    return paint(DIM, f"${usd:.2f}")


def git_part(cwd):
    try:
        branch = subprocess.run(
            ["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=1,
        ).stdout.strip()
        if not branch:
            return None
        dirty = subprocess.run(
            ["git", "-C", cwd, "status", "--porcelain", "--untracked-files=no"],
            capture_output=True, text=True, timeout=1,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    return paint(GREEN, f"⎇ {branch}") + (paint(YELLOW, "*") if dirty else "")


def folder_part(data):
    workspace = data.get("workspace") or {}
    cwd = workspace.get("current_dir") or data.get("cwd") or os.getcwd()
    home = os.path.expanduser("~")
    shown = "~" + cwd[len(home):] if cwd.startswith(home) else cwd
    return cwd, paint(BLUE, shown)


def main():
    try:
        data = json.load(sys.stdin)
    except ValueError:
        print("status line: no data")
        return
    now = time.time()

    first = [model_part(data), context_part(data), cache_part(data, now), quota_part(data, now), cost_part(data)]
    print(SEP.join(part for part in first if part))

    cwd, folder = folder_part(data)
    second = [folder]
    branch = git_part(cwd)
    if branch:
        second[0] += f" {branch}"
    worktree = (data.get("worktree") or {}).get("name") if isinstance(data.get("worktree"), dict) else None
    if worktree:
        second.append(paint(MAGENTA, f"worktree {worktree}"))
    name = data.get("session_name")
    if name:
        second.append(paint(DIM, f"# {name}"))
    print(SEP.join(second))


if __name__ == "__main__":
    main()
