import type { EngineInterface, Register, Timer } from 'claude-code'

const SUMMARY_PROMPT = `Summarize this session for my work journal. Exactly three bullets, each under 25 words, no preamble:
- Did: what changed or was produced (name files, PRs, systems)
- Learned/decided: the most useful decision or finding
- Open: what is left, or "nothing"`

const pad = (n: number) => String(n).padStart(2, '0')

export function dayOf(at: number) {
  const d = new Date(at)

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function timeOf(at: number) {
  const d = new Date(at)

  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
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

async function writeEntry($: EngineInterface, dir: string, startedAt: number) {
  if ((await $.session.turns()) === 0) return undefined
  const now = await $.clock.now()
  const root = await $.session.root()
  const project = root.split('/').filter(part => part.length > 0).pop() ?? root
  const sessionId = await $.session.id()
  const block = `## ${timeOf(startedAt)}–${timeOf(now)} · ${project}\n${await summarize($)}`
  const path = `${await expandHome($, dir)}/${dayOf(now)}.md`
  const file = await readOr($, path, `# Journal ${dayOf(now)}\n\n`)
  await $.fs.write(path, upsertBlock(file, sessionId, block))

  return path
}

export const register: Register = (on, options) => {
  const dir = typeof options.journalDir === 'string' && options.journalDir.length > 0 ? options.journalDir : '~/.claude/journal'
  const idleMs = Math.max(1, typeof options.idleMinutes === 'number' ? options.idleMinutes : 10) * 60_000
  let startedAt = 0
  let isDirty = false
  let idle: Timer | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    startedAt = await $.clock.now()
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
      void writeEntry($, dir, startedAt).catch(() => undefined)
    })

    return result
  })

  on('session.end', async ($, e, next) => {
    idle?.cancel()
    if (isDirty) {
      isDirty = false
      await writeEntry($, dir, startedAt).catch(() => undefined)
    }
    const result = await next(e)
    if (e.reason === 'clear') startedAt = await $.clock.now()

    return result
  })

  on('command.run', { command: 'journal' }, async $ => {
    isDirty = false
    const path = await writeEntry($, dir, startedAt)

    return { text: path === undefined ? 'Nothing to log yet.' : `Logged to ${path}.` }
  })

  on('command.run', { command: 'standup' }, async $ => {
    const now = await $.clock.now()
    const folder = await expandHome($, dir)
    const today = `${folder}/${dayOf(now)}.md`
    const yesterday = `${folder}/${dayOf(now - 24 * 60 * 60 * 1000)}.md`
    await $.prompt.submit({
      text: `Read ${yesterday} and ${today} (skip any that do not exist; if yesterday was a weekend day, also look for the last weekday's file in ${folder}). Write my standup in three short sections: Yesterday, Today (my best guess from the open items), Blockers. Plain bullets, no filler.`,
    })

    return { text: 'Drafting your standup.' }
  })
}
