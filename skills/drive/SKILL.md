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
- **Defaults I picked**: choices where the request was open.
- **Need from you**: only questions whose answer changes the goal, or steps that can't be undone. Usually none.

If nothing needs him, don't wait. Start right after the brief.

## 2. Execute

- Do reversible work without asking: edits, branches, draft PRs, scratch runs.
- Use a task list for more than 3 steps, and keep it current.
- Stop and ask only for prod changes, deletes, force pushes, money, or messages to other people.

## 3. Verify (never skip)

- Run every "Done when" check. Copy the real output.
- Review your own diff as a strict reviewer: bugs, edge cases, leftover debug code, things not asked for.
- If a check fails: find the root cause, fix, run again. Up to 3 different attempts. Never weaken or skip a test to get green.

## 4. Report (short)

- **Done**: what now works, in one or two lines.
- **Evidence**: the commands you ran and their results.
- **Decided for you**: defaults you picked. He can override.
- **Open**: blockers or one question. Else "nothing needed".

Keep it under 15 lines. Put long detail in a file and link it.

## 5. Learn

If he corrected you during the task, say in one line what rule it suggests, and suggest /reflect so it gets saved.
