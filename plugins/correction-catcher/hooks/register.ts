import type { EngineInterface, Register } from 'claude-code'

const STARTS_LIKE_CORRECTION = /^\s*(no\b|nope\b|wrong\b|stop\b|don'?t\b|do not\b|not that\b|that'?s not\b|that is not\b|undo\b|revert\b)/i
const SOUNDS_LIKE_CORRECTION =
  /\b(i (said|told you|asked( you)?)|you (forgot|missed|broke|ignored|should(n'?t| not)?)|not what i (asked|wanted|meant)|never (do|use)|always (do|use)|stop (doing|using)|why did you|that'?s wrong|is wrong|again\?)/i

const NOTE_FOR_MODEL =
  'correction-catcher: this message looks like a correction. Apply it. It was logged for the next /reflect, so do not save it to memory yourself.'

const pad = (n: number) => String(n).padStart(2, '0')

export function isCorrection(text: string): boolean {
  const head = text.slice(0, 400)

  return STARTS_LIKE_CORRECTION.test(head) || SOUNDS_LIKE_CORRECTION.test(head)
}

export function entryFor(at: number, cwd: string, said: string, before: string): string {
  const d = new Date(at)
  const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const quote = (text: string, limit: number) =>
    text.trim().slice(0, limit).replace(/\n+/g, ' ') + (text.trim().length > limit ? '…' : '')

  return `- [ ] ${when} · \`${cwd}\`\n  - You said: ${quote(said, 500)}\n  - Claude had just said: ${quote(before, 300)}\n`
}

async function expandHome($: EngineInterface, path: string) {
  if (!path.startsWith('~')) return path
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''

  return home + path.slice(1)
}

async function readOrHeader($: EngineInterface, path: string) {
  try {
    return await $.fs.read(path)
  } catch {
    return '# Corrections\n\nLogged by correction-catcher. /reflect turns these into rules, then removes them.\n\n'
  }
}

async function lastAssistantText($: EngineInterface) {
  const messages = await $.session.messages()
  const last = [...messages].reverse().find(message => message.role === 'assistant' && message.text.trim().length > 0)

  return last?.text ?? ''
}

export const register: Register = (on, options) => {
  const configured = typeof options.logPath === 'string' && options.logPath.length > 0 ? options.logPath : '~/.claude/corrections.md'

  on('prompt.submit', async ($, e, next) => {
    const isPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    if (!isPerson || e.text.startsWith('/') || !isCorrection(e.text)) return next(e)

    try {
      const path = await expandHome($, configured)
      const current = await readOrHeader($, path)
      const entry = entryFor(await $.clock.now(), await $.session.cwd(), e.text, await lastAssistantText($))
      await $.fs.write(path, current + entry)
      const pending = (current + entry).split('\n').filter(line => line.startsWith('- [ ]')).length
      $.ui.toast(`Correction logged (${pending} waiting for /reflect).`)
    } catch {
      $.ui.toast('correction-catcher could not write its log.')
    }

    return next({ ...e, context: [...(e.context ?? []), NOTE_FOR_MODEL] })
  }).catch(($, e, next) => next(e))
}
