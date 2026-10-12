# claude-kit

One repo for everything that makes Claude Code better for me: mods, skills, rules, knowledge notes and parked ideas. Clone it on every machine and every cloud environment, run `install.sh`, and they all get the same setup.

## Layout

| Folder | What lives there | How Claude Code picks it up |
| ------ | ---------------- | --------------------------- |
| `plugins/` | Mods (plugins of function hooks) | The repo is a local marketplace (`daniel-kit`), installed by `install.sh` |
| `skills/` | Personal skills, one folder each | Linked into `~/.claude/skills/` |
| `rules/global.md` | My global rules and preferences | Imported from `~/.claude/CLAUDE.md` |
| `knowledge/` | Notes worth keeping (KEs) | Claude reads and writes them on request (`kit-capture` skill) |
| `ideas/BACKLOG.md` | Parked ideas; `ideas/notes/` holds research on them | `/idea`, `/ideas`, and the `park_idea` tool |
| `statusline/statusline.py` | Two-line colored status line | Set as `statusLine` in `~/.claude/settings.json` by `install.sh` |
| `cloud/setup.sh` | Setup script for cloud environments | Paste into the environment's setup script |

## Install on a machine

Needs Claude Code 2.1.296 or newer (`claude --version`).

```bash
git clone git@github.com:wchf211/claude-kit.git ~/claude-kit
~/claude-kit/install.sh
```

Update later:

```bash
git -C ~/claude-kit pull && ~/claude-kit/install.sh
```

Then run `/reload-plugins` in an open session, or start a new one. Because the marketplace is a local folder, Claude reads mods straight from `~/claude-kit/plugins/`, so a pull is enough to update them.

## Install in cloud sessions

In claude.ai, open the project's environment settings, add a cloud environment, and paste this into **Setup script**:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/wchf211/claude-kit/main/cloud/setup.sh)"
```

That only works if the repo is public. For a private repo, paste the body of `cloud/setup.sh` instead and make sure the environment can clone it (add the repo to the project, so its sessions have GitHub access).

## The status line

```text
Opus 5.5 high │ ctx 34% 340k/1M │ cache 42m │ 5h 31% ↻2h11m 7d 18% │ $1.23
~/code/pipeline ⎇ main* │ # Fix consumer lag
```

Model and effort, context (green, yellow from 35%, red from 50%), the real prompt-cache expiry, the 5-hour quota with its reset time, the 7-day quota, cost, folder, git branch (`*` when dirty), worktree and session name. Green is fine, yellow means look soon, red means act. It needs `python3`. Change thresholds with env vars such as `CLAUDE_SL_CTX_RED=60`. If you already have a status line, `install.sh` keeps it; run `KIT_FORCE_STATUSLINE=1 ~/claude-kit/install.sh` to switch.

## The mods

| Mod | What you see | Commands |
| --- | ------------ | -------- |
| `session-hud` | Stays hidden until it helps. Then it shows a line above the prompt with the reason and one button: **Compact** once context passes 40%, **Handoff** before your break times (default 17:30 and 22:30), past 70% context or after a 3h session, **Reflect** right after you correct Claude or a failing test/build starts passing. It also puts the matching command (`/compact`, `/handoff`, `/reflect`) in the prompt box as a Tab suggestion. | `/handoff`, `/reflect`, `/hud` (suggestions on/off) |
| `safety-guard` | Blocks force push, `rm -rf /`, `git reset --hard`, `terraform apply/destroy`, prod `kubectl`/`helm` changes, `DROP TABLE`, `curl \| sh`, and reads or edits of `.env`, keys and credentials. Claude gets the reason and asks you instead. | none |
| `auto-format` | After each Edit or Write, runs the formatter for that file type (ruff/black, gofmt, prettier, rustfmt, shfmt, terraform fmt) and shows lint errors (ruff, eslint, shellcheck) to Claude. Missing tools are skipped. | none |
| `correction-catcher` | When you correct Claude ("no, use pnpm", "I said…"), it logs the correction to `~/.claude/corrections.md` and shows a toast. `/reflect` turns these into rules. | none |
| `daily-journal` | After 10 idle minutes, and when a session ends, writes a 3-bullet summary to `~/.claude/journal/<date>.md`. | `/journal`, `/standup` |
| `idea-inbox` | Parks ideas in `ideas/BACKLOG.md` without leaving your task. Claude also parks one when you say "park this" or "for later". | `/idea <text>`, `/ideas` |

### The improve loop

1. You work as normal. `correction-catcher` logs your corrections, and `daily-journal` logs what got done.
2. Press **Reflect** (or `/reflect`) at the end of a task. Claude reads the corrections plus the session, and proposes diffs to `rules/global.md`, skills, knowledge notes, or the project's `CLAUDE.md`.
3. You approve by number. Claude applies the changes and commits them in `~/claude-kit`.
4. Push the kit. Every machine and cloud session gets the new rules on its next pull.

## Settings

Each mod has rows in `/config` (for example, cache TTL `5m`/`1h`, the red threshold, the lint toggle, file paths). They are stored in `~/.claude/settings.json` under `pluginConfigs`.

## Check the mods

```bash
for p in ~/claude-kit/plugins/*/; do claude plugin validate "$p" && claude plugin test "$p"; done
```

## Notes

- The cache time comes from Claude Code's own `prompt_cache.expires_at`, so it matches the real TTL (5m or 1h).
- `safety-guard` is pattern based. It catches common mistakes, not every way to do damage. Add your own patterns in `/config` (separated by `;;`).
- `auto-format` changes files after Claude edits them, so it tells Claude to read the file again before its next edit.
