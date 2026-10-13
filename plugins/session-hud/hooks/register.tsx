import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hint, HintKind } from '../types'
import { breaksOn, dayAt } from './schedule'
import type { BreakTime } from './schedule'

const hints = atom({ plugin: 'session-hud', key: 'hints' } as const, [])
const reflectReason = atom({ plugin: 'session-hud', key: 'reflectReason' } as const, null)
const snoozedUntil = atom({ plugin: 'session-hud', key: 'snoozedUntil' } as const, 0)
const busy = atom({ plugin: 'session-hud', key: 'busy' } as const, null)
const isHidden = atom({ plugin: 'session-hud', key: 'isHidden' } as const, false)

const PENDING_HANDOFF = 'pendingHandoff'
const HANDOFF_DIR = '.claude/handoffs'
const TICK_MS = 30_000
const SNOOZE_MS = 30 * 60_000
const DAY_MINUTES = 24 * 60

const ICONS: Record<HintKind, string> = { compact: '◐', handoff: '⇢', reflect: '✎' }
const LABELS: Record<HintKind, string> = { compact: 'Compact', handoff: 'Handoff', reflect: 'Reflect' }

const STARTS_LIKE_CORRECTION = /^\s*(no\b|nope\b|wrong\b|stop\b|don'?t\b|do not\b|not that\b|that'?s not\b|that is not\b|undo\b|revert\b)/i
const SOUNDS_LIKE_CORRECTION =
  /\b(i (said|told you|asked( you)?)|you (forgot|missed|broke|ignored|should(n'?t| not)?)|not what i (asked|wanted|meant)|never (do|use)|always (do|use)|stop (doing|using)|why did you|that'?s wrong|is wrong)/i
const CHECK_COMMAND = /\b(test|tests|pytest|jest|vitest|build|lint|tsc|cargo|go|make|mvn|gradle|ruff|mypy|eslint|bazel)\b/

const HANDOFF_PROMPT = `Write a handoff note so a NEW session with no memory of this one can continue the work.
Use this exact markdown layout, short bullets, no filler:

# Handoff
## Goal
## Current state (what is done, what works)
## Next steps (ordered, concrete)
## Key files and commands
## Decisions made and why
## Open questions / risks
## Gotchas learned

Only output the markdown.`

const REFLECT_PROMPT = `Reflect on this session so you get better next time. Do it in three steps.

1. Gather what we learned:
   - Read ~/.claude/corrections.md if it exists: corrections I gave you, logged automatically.
   - Add what this session taught: facts about this project (build/test commands, layout,
     conventions), mistakes you made, problems we fixed and their root cause, workflows we
     repeated, and steps a hook could automate.
2. For each item, propose ONE concrete change and where it goes:
   - This project only: CLAUDE.md in the repo, or .claude/skills/ and .claude/settings.json.
   - Every project: ~/claude-kit/rules/global.md (my global rules), a skill under
     ~/claude-kit/skills/<name>/SKILL.md, or a note under ~/claude-kit/knowledge/.
     Fall back to ~/.claude/CLAUDE.md and ~/.claude/skills/ when ~/claude-kit does not exist.
   Show each change as a short diff. Skip anything already recorded.
3. Ask me which ones to apply (by number). Apply only what I approve. Then:
   - Remove the handled entries from ~/.claude/corrections.md.
   - If ~/claude-kit changed, commit there with a one-line message (do not push).`

export type { BreakTime }

export type HintInput = {
  percent: number | null
  localMinute: number
  breaks: readonly BreakTime[]
  leadMinutes: number
  sessionMinutes: number
  turns: number
  reflect: string | null
  compactAt: number
  handoffAt: number
  longSessionMinutes: number
}

const two = (n: number) => String(n).padStart(2, '0')

const hhmm = (minute: number) => `${two(Math.floor(minute / 60) % 24)}:${two(minute % 60)}`

const breaksPrompt = (file: string, words: string) => `Update my schedule file ${file} (create it if missing) from what I just said:

"${words}"

Keep its format: one line per entry under "## Regular" or "## Dates", like
- weekdays 17:30 end of work
- Tue,Thu 15:15 kids pickup
- daily 22:30 bedtime
- 2026-10-14 16:00 end of work (dentist)
- 2026-11-26 off Thanksgiving
- 2026-12-21..2027-01-02 off winter break
"today" and "tomorrow" mean real dates; use the local date from \`date\`. A dated time replaces the regular entry with the same label that day. "off" drops that day's regular entries except "daily" ones.
Remove dated entries older than 14 days. Show me the diff, then commit the file if it is in a git repo (do not push).`

// "17:30 end of work, 22:30 bedtime" -> [{ minute: 1050, label: "end of work" }, ...]
export function parseBreaks(text: unknown): BreakTime[] {
  if (typeof text !== 'string') return []

  return text.split(',').flatMap(part => {
    const match = /^\s*(\d{1,2}):(\d{2})\s*(.*)$/.exec(part)
    if (match === null) return []
    const minute = Number(match[1]) * 60 + Number(match[2])

    return minute < DAY_MINUTES ? [{ minute, label: (match[3] ?? '').trim() || 'break' }] : []
  })
}

// Which buttons are worth showing now, and why. Empty means the band stays out of the way.
export function computeHints(input: HintInput): Hint[] {
  const found: Hint[] = []
  const { percent } = input

  if (input.reflect !== null) found.push({ kind: 'reflect', reason: input.reflect })

  if (percent !== null && percent >= input.compactAt) {
    found.push({ kind: 'compact', reason: `Context is ${percent}% full` })
  }

  const soon = input.breaks
    .map(one => ({ ...one, inMinutes: (one.minute - input.localMinute + DAY_MINUTES) % DAY_MINUTES }))
    .filter(one => one.inMinutes <= input.leadMinutes)
    .sort((a, b) => a.inMinutes - b.inMinutes)[0]
  if (soon !== undefined && input.turns > 0) {
    const when = soon.inMinutes === 0 ? 'now' : `in ${soon.inMinutes} min`
    found.push({ kind: 'handoff', reason: `${soon.label} at ${hhmm(soon.minute)} (${when})` })
  } else if (percent !== null && percent >= input.handoffAt) {
    found.push({ kind: 'handoff', reason: `Context is ${percent}%, a fresh session will work better` })
  } else if (input.sessionMinutes >= input.longSessionMinutes && input.turns >= 10) {
    found.push({ kind: 'handoff', reason: `This session has run ${Math.floor(input.sessionMinutes / 60)}h` })
  }

  return found
}

export function isCorrection(text: string): boolean {
  const head = text.slice(0, 400)

  return STARTS_LIKE_CORRECTION.test(head) || SOUNDS_LIKE_CORRECTION.test(head)
}

// The part of a command that names the check: "pytest tests/x.py -k y" -> "pytest tests/x.py".
export function checkKey(command: string): string | undefined {
  const first = command.split(/&&|\|\||;|\|/)[0]?.trim() ?? ''
  if (!CHECK_COMMAND.test(first)) return undefined

  return first.split(/\s+/).slice(0, 2).join(' ')
}

// Minutes east of UTC, from the host's own clock (the hooks environment may run in UTC).
async function localOffsetMinutes($: EngineInterface) {
  try {
    const { stdout } = await $.process.run(['date', '+%z'], { timeoutMs: 2000 })
    const match = /^([+-])(\d{2})(\d{2})/.exec(stdout.trim())
    if (match !== null) return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
  } catch {
    // fall through to the environment's own idea of the zone
  }

  return -new Date().getTimezoneOffset()
}

const stamp = (ms: number, offsetMinutes: number) => {
  const d = new Date(ms + offsetMinutes * 60_000)

  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}-${two(d.getUTCHours())}${two(d.getUTCMinutes())}`
}

type Config = {
  compactAt: number
  handoffAt: number
  breaks: BreakTime[]
  scheduleFile: string
  leadMinutes: number
  longSessionMinutes: number
  offsetMinutes: number
  startedAt: number
  lastSuggested: string | null
}

async function expandHome($: EngineInterface, path: string) {
  if (!path.startsWith('~')) return path
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''

  return home + path.slice(1)
}

// Today's breaks from the schedule file; the breakTimes setting when there is no file.
async function todaysBreaks($: EngineInterface, cfg: Config, at: number): Promise<BreakTime[]> {
  try {
    return breaksOn(await $.fs.read(cfg.scheduleFile), dayAt(at, cfg.offsetMinutes))
  } catch {
    return cfg.breaks
  }
}

async function refresh($: EngineInterface, cfg: Config) {
  const at = await $.clock.now()
  const { context } = await $.session.usage()
  const found = computeHints({
    percent: context.percent ?? null,
    localMinute: Math.floor((((at / 60_000 + cfg.offsetMinutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES),
    breaks: await todaysBreaks($, cfg, at),
    leadMinutes: cfg.leadMinutes,
    sessionMinutes: cfg.startedAt === 0 ? 0 : (at - cfg.startedAt) / 60_000,
    turns: await $.session.turns(),
    reflect: await read($, reflectReason),
    compactAt: cfg.compactAt,
    handoffAt: cfg.handoffAt,
    longSessionMinutes: cfg.longSessionMinutes,
  })
  await update($, hints, () => found)

  return found
}

// Puts the top hint's command in the prompt box as a dim Tab suggestion, once per new hint.
async function suggest($: EngineInterface, cfg: Config, found: readonly Hint[]) {
  const top = found[0]
  const key = top === undefined ? null : `${top.kind}:${top.reason}`
  if (top === undefined || key === cfg.lastSuggested || (await read($, snoozedUntil)) > (await $.clock.now())) return
  cfg.lastSuggested = key
  await $.prompt.suggest({ text: `/${top.kind}` })
}

async function compact($: EngineInterface, cfg: Config) {
  await update($, busy, () => 'Compacting…')
  try {
    const { skip } = await $.session.compact()
    $.ui.toast(skip === undefined ? 'Compacted.' : `Compact skipped: ${skip}`)
  } catch {
    $.ui.toast('Cannot compact while Claude is working. Try again when the turn ends.')
  } finally {
    await update($, busy, () => null)
    await refresh($, cfg).catch(() => undefined)
  }
}

async function handoff($: EngineInterface, cfg: Config): Promise<string> {
  await update($, busy, () => 'Writing handoff…')
  try {
    const answer = await $.model.fork({ prompt: HANDOFF_PROMPT })
    if (!answer.isAnswered) return `Handoff failed: ${answer.reason}.`

    const path = `${HANDOFF_DIR}/${stamp(await $.clock.now(), cfg.offsetMinutes)}.md`
    await $.fs.write(path, answer.text.trim() + '\n')
    await $.store.set(PENDING_HANDOFF, { path, at: await $.clock.now() })
    await $.ui.copy({ text: `Read @${path} and continue the work from there.` })
    void $.command.run({ command: 'clear', args: '' }).catch(() => {
      $.ui.toast('Handoff saved. Run /clear, then send the prompt in the box.')
    })

    return `Handoff saved to ${path}. Starting a fresh session with it.`
  } finally {
    await update($, busy, () => null)
  }
}

// Shows the Reflect hint at once, without waiting for the next refresh.
async function setReflect($: EngineInterface, reason: string) {
  await update($, reflectReason, () => reason)
  await update($, hints, list => [{ kind: 'reflect' as const, reason }, ...list.filter(hint => hint.kind !== 'reflect')])
}

async function reflect($: EngineInterface) {
  await update($, reflectReason, () => null)
  await update($, hints, list => list.filter(hint => hint.kind !== 'reflect'))
  await $.prompt.submit({ text: REFLECT_PROMPT })

  return 'Reflection started.'
}

async function fillPendingHandoff($: EngineInterface) {
  const pending = (await $.store.get(PENDING_HANDOFF)) as { path: string; at: number } | undefined
  if (pending === undefined) return
  const isFresh = (await $.clock.now()) - pending.at < 24 * 60 * 60 * 1000
  await $.store.delete(PENDING_HANDOFF)
  if (!isFresh) return
  await $.prompt.fill({ text: `Read @${pending.path} and continue the work from there.` })
}

const numberOr = (value: unknown, fallback: number) => (typeof value === 'number' ? value : fallback)

export const register: Register = (on, options) => {
  const notifyAfter = numberOr(options.notifyAfterSeconds, 60)
  const cfg: Config = {
    compactAt: numberOr(options.compactAtPercent, 40),
    handoffAt: numberOr(options.handoffAtPercent, 70),
    breaks: parseBreaks(options.breakTimes ?? '17:30 end of work, 22:30 bedtime'),
    scheduleFile: typeof options.scheduleFile === 'string' && options.scheduleFile.length > 0 ? options.scheduleFile : '~/claude-kit/schedule.md',
    leadMinutes: numberOr(options.breakLeadMinutes, 30),
    longSessionMinutes: numberOr(options.longSessionHours, 3) * 60,
    offsetMinutes: 0,
    startedAt: 0,
    lastSuggested: null,
  }
  const failedChecks = new Set<string>()
  let turnStartedAt = 0

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    cfg.startedAt = (await $.session.usage()).startedAt
    cfg.offsetMinutes = await localOffsetMinutes($)
    cfg.scheduleFile = await expandHome($, cfg.scheduleFile)
    await $.command.register({ name: 'handoff', description: 'Save a handoff note, clear, and continue in a fresh session' })
    await $.command.register({ name: 'reflect', description: 'Review this session and propose rule, memory and skill updates' })
    await $.command.register({ name: 'breaks', description: 'Show today\'s breaks, or tell me a schedule change: /breaks today I stop at 4' })
    await $.command.register({ name: 'hud', description: 'Turn the Compact / Handoff / Reflect suggestions on or off' })
    $.clock.every(TICK_MS, () => void refresh($, cfg).catch(() => undefined))
    await refresh($, cfg)
    await fillPendingHandoff($)

    return result
  })

  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear') {
      cfg.startedAt = await $.clock.now()
      cfg.lastSuggested = null
      failedChecks.clear()
      await update($, reflectReason, () => null)
      $.clock.after(500, () => void fillPendingHandoff($))
    }

    return result
  })

  on('prompt.submit', async ($, e, next) => {
    const isPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    if (isPerson && !e.text.startsWith('/') && isCorrection(e.text)) {
      await setReflect($, 'You just corrected me: save it as a rule')
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    const key = checkKey(e.command)
    if (key === undefined || result.deny !== undefined) return result
    if (result.isError === true) {
      failedChecks.add(key)
    } else if (failedChecks.delete(key)) {
      await setReflect($, `\`${key}\` passes now: save what fixed it`)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    turnStartedAt = await $.clock.now()

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    const found = await refresh($, cfg)
    if (!(await read($, isHidden))) await suggest($, cfg, found)
    const seconds = Math.round(((await $.clock.now()) - turnStartedAt) / 1000)
    if (notifyAfter > 0 && turnStartedAt > 0 && seconds >= notifyAfter) {
      void $.ui.notify(`Done after ${seconds}s.`, { title: 'Claude finished' })
    }

    return result
  })

  on('command.run', { command: 'handoff' }, async $ => ({ text: await handoff($, cfg) }))
  on('command.run', { command: 'reflect' }, async $ => ({ text: await reflect($) }))
  on('command.run', { command: 'breaks' }, async ($, e) => {
    const words = e.args.trim()
    if (words.length > 0) {
      await $.prompt.submit({ text: breaksPrompt(cfg.scheduleFile, words) })

      return { text: 'Updating your schedule.' }
    }
    const breaks = await todaysBreaks($, cfg, await $.clock.now())
    const list = breaks.map(one => `${hhmm(one.minute)} ${one.label}`).join(', ')

    return { text: breaks.length === 0 ? `No breaks today (${cfg.scheduleFile}).` : `Today: ${list}.` }
  })
  on('command.run', { command: 'hud' }, async $ => {
    await update($, isHidden, hidden => !hidden)

    return { text: (await read($, isHidden)) ? 'Suggestions off.' : 'Suggestions on.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.isWorking || (await read($, isHidden))) return next(e)

    const working = await read($, busy)
    const list = await read($, hints)
    const isSnoozed = (await read($, snoozedUntil)) > (await $.clock.now())
    if (working === null && (list.length === 0 || isSnoozed)) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    if (working !== null) return <Text dimColor>{working}</Text>

    return (
      <Box flexDirection="column">
        {list.map(hint => (
          <Box key={`row-${hint.kind}`} flexDirection="row" gap={1}>
            <Text color={hint.kind === 'reflect' ? 'suggestion' : hint.kind === 'compact' ? 'warning' : 'claude'}>
              {ICONS[hint.kind]} {hint.reason}
            </Text>
            <Button
              key={hint.kind}
              label={LABELS[hint.kind]}
              onPress={async () => {
                if (hint.kind === 'compact') await compact($, cfg)
                else if (hint.kind === 'handoff') $.ui.toast(await handoff($, cfg))
                else await reflect($)
              }}
            />
          </Box>
        ))}
        <Box flexDirection="row">
          <Button
            key="later"
            label="Not now"
            plain
            onPress={async () => {
              const until = (await $.clock.now()) + SNOOZE_MS
              await update($, snoozedUntil, () => until)
            }}
          />
        </Box>
      </Box>
    )
  })
}
