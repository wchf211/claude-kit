import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { HudUsage } from '../types'

const now = atom({ plugin: 'session-hud', key: 'now' } as const, 0)
const lastReplyAt = atom({ plugin: 'session-hud', key: 'lastReplyAt' } as const, null)
const usage = atom({ plugin: 'session-hud', key: 'usage' } as const, null)
const busy = atom({ plugin: 'session-hud', key: 'busy' } as const, null)
const isHidden = atom({ plugin: 'session-hud', key: 'isHidden' } as const, false)

const PENDING_HANDOFF = 'pendingHandoff'
const HANDOFF_DIR = '.claude/handoffs'
const TICK_MS = 5000

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
     conventions), mistakes you made, workflows we repeated, and steps a hook could automate.
2. For each item, propose ONE concrete change and where it goes:
   - This project only: CLAUDE.md in the repo, or .claude/skills/ and .claude/settings.json.
   - Every project: ~/claude-kit/rules/global.md (my global rules), a skill under
     ~/claude-kit/skills/<name>/SKILL.md, or a note under ~/claude-kit/knowledge/.
     Fall back to ~/.claude/CLAUDE.md and ~/.claude/skills/ when ~/claude-kit does not exist.
   Show each change as a short diff. Skip anything already recorded.
3. Ask me which ones to apply (by number). Apply only what I approve. Then:
   - Remove the handled entries from ~/.claude/corrections.md.
   - If ~/claude-kit changed, commit there with a one-line message (do not push).`

const usageOf = async ($: EngineInterface): Promise<HudUsage> => {
  const { context, rateLimits, cost } = await $.session.usage()
  const limit = (kind: string) => rateLimits.find(one => one.kind === kind)?.percentUsed ?? null

  return {
    percent: context.percent ?? null,
    tokens: context.tokens ?? null,
    window: context.window,
    fiveHour: limit('five_hour'),
    sevenDay: limit('seven_day'),
    usd: cost?.usd ?? null,
  }
}

const limitColor = (used: number) => (used >= 80 ? 'error' : used >= 60 ? 'warning' : 'inactive')

const kTokens = (n: number) => `${Math.round(n / 1000)}k`

const clockText = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60

  return minutes >= 10 ? `${minutes}m` : `${minutes}:${String(seconds).padStart(2, '0')}`
}

const stamp = (ms: number) => {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')

  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`
}

type Config = { ttlMs: number; redAt: number; warnedRed: boolean }

const refresh = async ($: EngineInterface, cfg: Config) => {
  const at = await $.clock.now()
  const fill = await usageOf($)
  await update($, now, () => at)
  await update($, usage, () => fill)

  const replied = await read($, lastReplyAt)
  const parts: string[] = []
  if (fill.percent !== null) parts.push(`ctx ${fill.percent}%`)
  if (replied !== null) {
    const left = cfg.ttlMs - (at - replied)
    parts.push(left > 0 ? `cache ${clockText(left)}` : 'cache cold')
  }
  $.ui.status(parts.length > 0 ? parts.join(' · ') : undefined)

  if (fill.percent !== null && fill.percent >= cfg.redAt && !cfg.warnedRed) {
    cfg.warnedRed = true
    $.ui.toast(`Context is at ${fill.percent}%. Consider /compact or /handoff.`)
  }
  if (fill.percent !== null && fill.percent < cfg.redAt) cfg.warnedRed = false
}

const compact = async ($: EngineInterface, cfg: Config) => {
  await update($, busy, () => 'Compacting…')
  try {
    const { skip } = await $.session.compact()
    $.ui.toast(skip === undefined ? 'Compacted.' : `Compact skipped: ${skip}`)
  } catch {
    $.ui.toast('Cannot compact while Claude is working. Try again when the turn ends.')
  } finally {
    await update($, busy, () => null)
    await refresh($, cfg)
  }
}

const handoff = async ($: EngineInterface): Promise<string> => {
  await update($, busy, () => 'Writing handoff…')
  try {
    const answer = await $.model.fork({ prompt: HANDOFF_PROMPT })
    if (!answer.isAnswered) return `Handoff failed: ${answer.reason}.`

    const path = `${HANDOFF_DIR}/${stamp(await $.clock.now())}.md`
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

const reflect = async ($: EngineInterface) => {
  await $.prompt.submit({ text: REFLECT_PROMPT })

  return 'Reflection started.'
}

const fillPendingHandoff = async ($: EngineInterface) => {
  const pending = (await $.store.get(PENDING_HANDOFF)) as { path: string; at: number } | undefined
  if (pending === undefined) return
  const isFresh = (await $.clock.now()) - pending.at < 24 * 60 * 60 * 1000
  await $.store.delete(PENDING_HANDOFF)
  if (!isFresh) return
  await $.prompt.fill({ text: `Read @${pending.path} and continue the work from there.` })
}


export const register: Register = (on, options) => {
  const ttlMs = options.cacheTtl === '1h' ? 60 * 60 * 1000 : 5 * 60 * 1000
  const redAt = typeof options.redAtPercent === 'number' ? options.redAtPercent : 50
  const notifyAfter = typeof options.notifyAfterSeconds === 'number' ? options.notifyAfterSeconds : 60
  const warnAt = Math.max(0, redAt - 15)
  const cfg: Config = { ttlMs, redAt, warnedRed: false }
  let turnStartedAt = 0

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'handoff', description: 'Save a handoff note, clear, and continue in a fresh session' })
    await $.command.register({ name: 'reflect', description: 'Review this session and propose rule, memory and skill updates' })
    await $.command.register({ name: 'hud', description: 'Show or hide the session HUD above the prompt' })
    $.clock.every(TICK_MS, () => void refresh($, cfg))
    await refresh($, cfg)
    await fillPendingHandoff($)

    return result
  })

  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear') {
      await update($, lastReplyAt, () => null)
      $.clock.after(500, () => void fillPendingHandoff($))
    }

    return result
  })

  on('turn.start', async ($, e, next) => {
    turnStartedAt = await $.clock.now()

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined) {
      const at = await $.clock.now()
      await update($, lastReplyAt, () => at)
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      await refresh($, cfg)
      const seconds = Math.round(((await $.clock.now()) - turnStartedAt) / 1000)
      if (notifyAfter > 0 && turnStartedAt > 0 && seconds >= notifyAfter) {
        void $.ui.notify(`Done after ${seconds}s.`, { title: 'Claude finished' })
      }
    }

    return result
  })

  on('command.run', { command: 'handoff' }, async $ => ({ text: await handoff($) }))
  on('command.run', { command: 'reflect' }, async $ => ({ text: await reflect($) }))
  on('command.run', { command: 'hud' }, async $ => {
    await update($, isHidden, hidden => !hidden)

    return { text: (await read($, isHidden)) ? 'HUD hidden.' : 'HUD shown.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const fill = await read($, usage)
    const at = await read($, now)
    const replied = await read($, lastReplyAt)
    const working = await read($, busy)

    const percent = fill?.percent ?? null
    const ctxColor = percent === null ? 'inactive' : percent >= redAt ? 'error' : percent >= warnAt ? 'warning' : 'success'
    const ctxText =
      percent === null || fill === null
        ? 'ctx –'
        : `ctx ${percent}%${fill.tokens === null ? '' : ` (${kTokens(fill.tokens)}/${kTokens(fill.window)})`}`

    const left = replied === null ? null : ttlMs - (at - replied)
    const cacheColor = left === null ? 'inactive' : left <= 0 ? 'error' : left < 60_000 ? 'warning' : 'success'
    const cacheText = left === null ? 'cache –' : left <= 0 ? 'cache cold' : `cache ${clockText(left)}`

    const isIdle = !e.props.isWorking && working === null

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={ctxColor} bold>
          {ctxText}
        </Text>
        <Text dimColor>·</Text>
        <Text color={cacheColor}>{cacheText}</Text>
        {fill !== null && fill.fiveHour !== null && <Text color={limitColor(fill.fiveHour)}>· 5h {fill.fiveHour}%</Text>}
        {fill !== null && fill.sevenDay !== null && <Text color={limitColor(fill.sevenDay)}>· 7d {fill.sevenDay}%</Text>}
        {fill !== null && fill.usd !== null && fill.usd > 0 && <Text dimColor>· ${fill.usd.toFixed(2)}</Text>}
        {working !== null && <Text dimColor> {working}</Text>}
        {isIdle && <Button key="compact" label="Compact" onPress={() => compact($, cfg)} />}
        {isIdle && (
          <Button
            key="handoff"
            label="Handoff"
            onPress={async () => {
              $.ui.toast(await handoff($))
            }}
          />
        )}
        {isIdle && <Button key="reflect" label="Reflect" onPress={() => reflect($)} />}
      </Box>
    )
  })
}
