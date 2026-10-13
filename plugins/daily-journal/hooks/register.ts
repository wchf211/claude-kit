import type { EngineInterface, Register, Timer } from 'claude-code'

import { breaksOn, dayAt, endOfWork } from './schedule'

const SUMMARY_PROMPT = `Summarize this session for my work journal. Exactly three bullets, each under 25 words, no preamble:
- Did: what changed or was produced (name files, PRs, systems)
- Learned/decided: the most useful decision or finding
- Open: what is left, or "nothing"`

const WRAPUP_PROMPT = `Below is my work journal for one day: one block per Claude Code session, plus corrections I gave Claude.
Write the day's wrap-up in this exact markdown, short bullets, no preamble:

## Wrap-up
**Summary:** one or two sentences on what the day achieved.
### Done
- the main results (merge sessions about the same work)
### Learned
- decisions and findings worth remembering
### Improve
- concrete changes for tomorrow: a rule for Claude, a skill or a hook to add, a habit to change. Name the file when it is a rule or skill (for example ~/claude-kit/rules/global.md).
### Tomorrow
- the open items to start with, most important first`

const WRAPUP_OPEN = /<!-- wrapup body=(\d+) -->\n[\s\S]*?<!-- \/wrapup -->\n?/
const SESSION_MARK = '<!-- session:'
const DAY_MS = 24 * 60 * 60 * 1000
const TICK_MS = 5 * 60_000
const SETTLE_MS = 3 * 60_000

const pad = (n: number) => String(n).padStart(2, '0')

export function dayOf(at: number, offsetMinutes = 0) {
  return dayAt(at, offsetMinutes).iso
}

export function timeOf(at: number, offsetMinutes = 0) {
  const d = new Date(at + offsetMinutes * 60_000)

  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// The journal without its wrap-up section.
export function withoutWrapUp(file: string) {
  return file.replace(WRAPUP_OPEN, '').replace(/\n*$/, '\n')
}

// A day needs a (new) wrap-up when it has sessions and none was written since the last change.
export function needsWrapUp(file: string) {
  if (!file.includes(SESSION_MARK)) return false
  const match = WRAPUP_OPEN.exec(file)

  return match === null || Number(match[1]) !== withoutWrapUp(file).length
}

// Puts the wrap-up at the end, remembering the size of the journal it summarized.
export function setWrapUp(file: string, wrapUp: string) {
  const body = withoutWrapUp(file)

  return `${body}\n<!-- wrapup body=${body.length} -->\n${wrapUp.trim()}\n<!-- /wrapup -->\n`
}

// Puts the session's block in the day's file, replacing an earlier block of the same session.
export function upsertBlock(file: string, sessionId: string, block: string): string {
  const open = `<!-- session:${sessionId} -->`
  const close = `<!-- /session:${sessionId} -->`
  const wrapped = `${open}\n${block.trim()}\n${close}\n`
  const start = file.indexOf(open)
  const end = file.indexOf(close)
  if (start >= 0 && end > start) return file.slice(0, start) + wrapped + file.slice(end + close.length + 1)

  return (file.length > 0 && !file.endsWith('\n\n') ? file.replace(/\n*$/, '\n\n') : file) + wrapped
}

async function expandHome($: EngineInterface, path: string) {
  if (!path.startsWith('~')) return path
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''

  return home + path.slice(1)
}

async function readOr($: EngineInterface, path: string, fallback: string) {
  try {
    return await $.fs.read(path)
  } catch {
    return fallback
  }
}

// Tries a fork first (it reuses the prompt cache), then a plain completion over the transcript.
async function summarize($: EngineInterface) {
  const forked = await $.model.fork({ prompt: SUMMARY_PROMPT })
  if (forked.isAnswered) return forked.text.trim()

  const messages = await $.session.messages()
  const transcript = messages
    .slice(-60)
    .map(message => `${message.role}: ${message.text.trim().slice(0, 800)}`)
    .join('\n\n')
  const completed = await $.model.complete({
    model: await $.session.model(),
    prompt: `<transcript>\n${transcript}\n</transcript>\n\n${SUMMARY_PROMPT}`,
    maxTokens: 300,
  })
  if (completed.isAnswered) return completed.text.trim()
  const first = messages.find(message => message.role === 'user')

  return `- Did: ${(first?.text ?? 'session').trim().slice(0, 160).replace(/\n+/g, ' ')}\n- Learned/decided: (no summary: ${completed.reason})\n- Open: unknown`
}

type Config = {
  dir: string
  scheduleFile: string
  correctionsFile: string
  isAuto: boolean
  isSync: boolean
  offsetMinutes: number
  startedAt: number
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

async function writeEntry($: EngineInterface, cfg: Config) {
  if ((await $.session.turns()) === 0) return undefined
  const now = await $.clock.now()
  const root = await $.session.root()
  const project = root.split('/').filter(part => part.length > 0).pop() ?? root
  const sessionId = await $.session.id()
  const block = `## ${timeOf(cfg.startedAt, cfg.offsetMinutes)}–${timeOf(now, cfg.offsetMinutes)} · ${project}\n${await summarize($)}`
  const day = dayOf(now, cfg.offsetMinutes)
  const path = `${cfg.dir}/${day}.md`
  const file = await readOr($, path, `# Journal ${day}\n\n`)
  await $.fs.write(path, upsertBlock(file, sessionId, block))

  return path
}

// Commits the journal and schedule, then pushes, so every machine and the weekly review see them.
async function sync($: EngineInterface, cfg: Config, message: string) {
  if (!cfg.isSync) return
  const git = (args: string[], cwd: string) => $.process.run(['git', ...args], { cwd, timeoutMs: 60_000 })
  const top = await git(['rev-parse', '--show-toplevel'], cfg.dir)
  if (top.exitCode !== 0) return
  const root = top.stdout.trim()
  const paths = [cfg.dir, cfg.scheduleFile].filter(path => path.startsWith(root + '/'))
  await git(['add', '--', ...paths], root)
  const commit = await git(['commit', '-q', '-m', message, '--', ...paths], root)
  if (commit.exitCode !== 0) return
  await git(['pull', '-q', '--rebase', '--autostash'], root)
  await git(['push', '-q'], root)
}

// Writes the day's wrap-up from its journal and the corrections log. Returns whether it wrote one.
async function wrapUp($: EngineInterface, cfg: Config, day: string) {
  const path = `${cfg.dir}/${day}.md`
  const file = await readOr($, path, '')
  if (!needsWrapUp(file)) return false
  const corrections = (await readOr($, cfg.correctionsFile, '')).slice(-4000)
  const completed = await $.model.complete({
    model: await $.session.model(),
    prompt: `<journal day="${day}">\n${withoutWrapUp(file)}\n</journal>\n\n<corrections>\n${corrections}\n</corrections>\n\n${WRAPUP_PROMPT}`,
    maxTokens: 900,
  })
  if (!completed.isAnswered) return false
  // Another session may have written the day's file meanwhile; wrap up what is there now.
  const latest = await readOr($, path, file)
  if (!needsWrapUp(latest)) return false
  await $.fs.write(path, setWrapUp(latest, completed.text))
  await sync($, cfg, `journal: wrap-up ${day}`).catch(() => undefined)

  return true
}

// Past days (up to a week back) that never got a wrap-up, or changed after it.
async function catchUp($: EngineInterface, cfg: Config) {
  const now = await $.clock.now()
  for (let back = 7; back >= 1; back--) {
    await wrapUp($, cfg, dayOf(now - back * DAY_MS, cfg.offsetMinutes)).catch(() => false)
  }
}

// At the day's end-of-work time: log this session, wait for the others to do the same, then wrap up.
async function endOfDayTick($: EngineInterface, cfg: Config, done: Set<string>) {
  const now = await $.clock.now()
  const today = dayAt(now, cfg.offsetMinutes)
  if (done.has(today.iso)) return
  const schedule = await readOr($, cfg.scheduleFile, '')
  const end = endOfWork(breaksOn(schedule, today))
  if (end === undefined) return
  const startOfDay = now - ((((now / 60_000 + cfg.offsetMinutes) % (24 * 60)) + 24 * 60) % (24 * 60)) * 60_000
  if (now < startOfDay + end.minute * 60_000) return
  done.add(today.iso)
  await writeEntry($, cfg)
  $.clock.after(SETTLE_MS, () => void wrapUp($, cfg, today.iso).catch(() => undefined))
}

const textOr = (value: unknown, fallback: string) => (typeof value === 'string' && value.length > 0 ? value : fallback)

export const register: Register = (on, options) => {
  const cfg: Config = {
    dir: textOr(options.journalDir, '~/claude-kit/journal'),
    scheduleFile: textOr(options.scheduleFile, '~/claude-kit/schedule.md'),
    correctionsFile: '~/.claude/corrections.md',
    isAuto: options.autoWrapUp !== false,
    isSync: options.syncJournal !== false,
    offsetMinutes: 0,
    startedAt: 0,
  }
  const idleMs = Math.max(1, typeof options.idleMinutes === 'number' ? options.idleMinutes : 10) * 60_000
  const wrappedDays = new Set<string>()
  let isDirty = false
  let idle: Timer | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    cfg.startedAt = await $.clock.now()
    cfg.offsetMinutes = await localOffsetMinutes($)
    cfg.dir = await expandHome($, cfg.dir)
    cfg.scheduleFile = await expandHome($, cfg.scheduleFile)
    cfg.correctionsFile = await expandHome($, cfg.correctionsFile)
    if (cfg.isAuto) {
      $.clock.after(20_000, () => void catchUp($, cfg).catch(() => undefined))
      $.clock.every(TICK_MS, () => void endOfDayTick($, cfg, wrappedDays).catch(() => undefined))
    }
    await $.command.register({ name: 'wrapup', description: 'Write today\'s wrap-up now: summary, learnings, improvements, tomorrow' })
    await $.command.register({ name: 'journal', description: 'Write this session into today\'s journal now' })
    await $.command.register({ name: 'standup', description: 'Draft a standup from yesterday\'s and today\'s journal' })

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    isDirty = true
    idle?.cancel()
    idle = $.clock.after(idleMs, () => {
      isDirty = false
      void writeEntry($, cfg).catch(() => undefined)
    })

    return result
  })

  on('session.end', async ($, e, next) => {
    idle?.cancel()
    if (isDirty) {
      isDirty = false
      await writeEntry($, cfg).catch(() => undefined)
    }
    const result = await next(e)
    if (e.reason === 'clear') cfg.startedAt = await $.clock.now()

    return result
  })

  on('command.run', { command: 'journal' }, async $ => {
    isDirty = false
    const path = await writeEntry($, cfg)

    return { text: path === undefined ? 'Nothing to log yet.' : `Logged to ${path}.` }
  })

  on('command.run', { command: 'wrapup' }, async $ => {
    await writeEntry($, cfg)
    const day = dayOf(await $.clock.now(), cfg.offsetMinutes)
    const isWritten = await wrapUp($, cfg, day)

    return { text: isWritten ? `Wrap-up added to ${cfg.dir}/${day}.md.` : 'Nothing new to wrap up today.' }
  })

  on('command.run', { command: 'standup' }, async $ => {
    const now = await $.clock.now()
    const folder = cfg.dir
    const today = `${folder}/${dayOf(now, cfg.offsetMinutes)}.md`
    const yesterday = `${folder}/${dayOf(now - DAY_MS, cfg.offsetMinutes)}.md`
    await $.prompt.submit({
      text: `Read ${yesterday} and ${today} (skip any that do not exist; if yesterday was a weekend day, also look for the last weekday's file in ${folder}). Start from yesterday's "Wrap-up" section when it has one. Write my standup in three short sections: Yesterday, Today (my best guess from the open items), Blockers. Plain bullets, no filler.`,
    })

    return { text: 'Drafting your standup.' }
  })
}
