---
name: drive
description: Take a task from goal to verified result with little back-and-forth. Use when Daniel says "drive this", "just get it done", "handle it", "own this", or hands over any multi-step task (a fix, a feature, a script, research with a deliverable).
---

# Drive a task to done

Goal: Daniel spends his time on decisions, not on reading and checking your work.

## 1. Define done (before any work)

Write a short brief, 3 to 5 lines:

- **Goal**: the outcome in one sentence.
- **Done when**: checks you can run yourself (tests pass, command output, file exists, numbers match).
- **Budget**: the one he gave ("budget: 1h"), else the default: about 50 tool calls (subagents' work included), or 3 failed attempts at the same problem.
- **Need from you**: only questions whose answer changes the goal, or steps that can't be undone. Usually none.

If nothing needs him, don't wait. Start right after the brief.

## 2. Execute

- Do reversible work without asking: edits, branches, draft PRs, scratch runs.
- Small choices (names, file layout, formats, library picks): decide, write each one down, keep going. They go in the report as "Decisions to review". If he said "use your best judgment", skip the list.
- Use a task list for more than 3 steps, and keep it current.
- Stop and ask only for prod changes, deletes, force pushes, money, or messages to other people.
- If you hit the budget, stop and report what is done and what is left. When he replies "continue", the budget starts over.

## 3. Verify (never skip)

Use the strongest check that fits, in this order:

1. **Tests and real runs**: run every "Done when" check. Copy the real output. Add a test when a quick one is possible.
2. **Second-model review**: for work tests can't check (docs, designs, research, prompts), start a fresh subagent on a different model: Sonnet when you run on Opus, Opus when you run on Sonnet or Haiku. Give it only the goal, the "Done when" list and the result, not your reasoning. Ask it for concrete problems. Fix the real ones.
3. **Self-review**: re-read your diff as a strict reviewer: bugs, edge cases, leftover debug code, things not asked for.

If a check fails: find the root cause, fix, run again. Up to 3 different attempts. Never weaken or skip a test to get green.

## 4. Report (conclusions only)

- **Done**: what now works, in one or two lines.
- **Verified by**: each method you used (tests, second model, self-review), its result, and which one caught real problems. Over time this shows which checks work best.
- **Decisions to review**: the small choices from step 2, one line each, so he can approve them in one pass.
- **Rules to save**: lessons from this task (step 5).
- **Open**: blockers or one question. Else "nothing needed".

No story of how you got there. Keep it under 15 lines. Put long detail in a file and link it.

## 5. Learn (automatic, no reminder needed)

At the end of every drive, look back over the task: his corrections, failed attempts and their root cause, and anything you had to look up twice. Propose each lasting lesson as a one-line rule with where it goes (`rules/global.md`, the repo's `CLAUDE.md`, or a skill). List them under "Rules to save". Apply only the ones he approves, the same way /reflect does, and remove the matching open items from `~/.claude/corrections.md`.
