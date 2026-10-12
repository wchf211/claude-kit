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

## The mods

| Mod | What you see | Commands |
| --- | ------------ | -------- |
| `session-hud` | Status line: `ctx 34% (68k/200k) · cache 3:12 · 5h 23% · 7d 41% · $1.24`, with 🟡 from 35% and 🔴 from 50% context. Above the prompt: `[Compact] [Handoff] [Reflect]`, plus a red `ctx` warning once past 50%. | `/handoff`, `/reflect`, `/hud` (hide the buttons) |
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

- The cache timer is an estimate. It counts down from the last model reply, because the API does not report the real expiry.
- `safety-guard` is pattern based. It catches common mistakes, not every way to do damage. Add your own patterns in `/config` (separated by `;;`).
- `auto-format` changes files after Claude edits them, so it tells Claude to read the file again before its next edit.
