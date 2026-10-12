---
name: kit-capture
description: Save something worth keeping into Daniel's claude-kit repo (a rule, a knowledge note, a skill, or an idea). Use when he says "remember this", "save this", "make this a skill", "add to my rules", or "keep this for later".
---

# Save to the kit

The kit is a git repo at `~/claude-kit` (the same repo on every machine and cloud session). Pick the right place:

| What it is | Where it goes |
| ---------- | ------------- |
| A rule for how Claude should always work | Append a dated bullet under "Learned rules" in `~/claude-kit/rules/global.md` |
| A rule for one repo only | That repo's `CLAUDE.md`, not the kit |
| A fact or how-to worth keeping | `~/claude-kit/knowledge/<topic>.md` (one topic per file, one-line summary first) |
| A repeatable multi-step workflow | `~/claude-kit/skills/<name>/SKILL.md` with `name` and `description` frontmatter, then run `~/claude-kit/install.sh` so it is linked |
| An idea to look at later | `/idea <text>`, or the park_idea tool (it writes `~/claude-kit/ideas/BACKLOG.md`) |

Steps:

1. Say in one line what you will save and where. Show the text.
2. Before adding, search the target (`rg -i <keyword> ~/claude-kit`) and update an existing entry instead of duplicating it.
3. Write it, then commit in `~/claude-kit` with a one-line message. Do not push unless asked.
4. If `~/claude-kit` does not exist, say so and save to `~/.claude/CLAUDE.md` or `~/.claude/skills/` instead.
