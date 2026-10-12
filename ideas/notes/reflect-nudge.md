# Reflect nudge

**Verdict: mostly done already, so only a small add-on is left.** session-hud already shows **Reflect** right after you correct Claude or a failing test or build starts passing. A turn-count nudge is a weaker signal. Add it only as a backstop.

## What already exists
- session-hud `computeHints` (in `plugins/session-hud/hooks/register.tsx`) adds a Reflect hint on a correction (`isCorrection`) and on a fixed check (`checkKey`). It also puts `/reflect` in the prompt box as a Tab suggestion.
- correction-catcher logs every correction to `~/.claude/corrections.md`, and `/reflect` reads that file first.
- Claude Code has no built-in "reflect" step. The closest is `/memory` for editing memory files by hand.

## Smallest useful version
1. In `computeHints`, add: if `turns >= 20`, there is no reflect reason yet, and Reflect has not run this session, show "20 turns in: anything worth keeping?".
2. Add a "pending corrections" signal: when `~/.claude/corrections.md` has 5 or more open items, show "5 corrections waiting".
3. Remember when Reflect last ran (in `$.store`), so the nudge does not repeat for an hour.

Size: about 1 hour, plus 2 unit tests.

## Risks and open questions
- Nudge fatigue: a hint you learn to ignore is worse than none. Keep it to at most once per session.
- Is 20 turns the right threshold? Check your journal for how long a typical session runs.

## Next step
Use the current triggers for a week. If you find you reflect less than you want, add step 2 (pending corrections). It is the stronger signal.
