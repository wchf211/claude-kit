import type { EngineInterface, Register } from 'claude-code'

const TOOL = 'mcp__idea-inbox__park_idea'
const INBOX_HEADING = '## Inbox'
const HEADER = `# Idea backlog

Ideas parked for later. Move one to "Exploring" when you pick it up, and to "Done" or "Dropped" when it ends.
Notes from looking into an idea go in ideas/notes/<slug>.md.

${INBOX_HEADING}

## Exploring

## Done / Dropped
`

const pad = (n: number) => String(n).padStart(2, '0')

export function lineFor(at: number, idea: string, project: string): string {
  const d = new Date(at)
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  return `- [ ] ${idea.trim().replace(/\s*\n\s*/g, ' ')} · _${day}, from ${project}_`
}

// Adds the line at the end of the Inbox section, creating the section when missing.
export function addToInbox(file: string, line: string): string {
  const base = file.trim().length === 0 ? HEADER : file
  const start = base.indexOf(INBOX_HEADING)
  if (start < 0) return `${base.replace(/\n*$/, '\n\n')}${INBOX_HEADING}\n\n${line}\n`

  const afterHeading = start + INBOX_HEADING.length
  const nextHeading = base.indexOf('\n## ', afterHeading)
  const end = nextHeading < 0 ? base.length : nextHeading
  const section = base.slice(afterHeading, end).replace(/\s*$/, '')

  return `${base.slice(0, afterHeading)}${section}\n${line}\n${nextHeading < 0 ? '' : '\n'}${base.slice(end).replace(/^\n+/, '')}`
}

export function openIdeas(file: string): string[] {
  return file.split('\n').filter(line => line.startsWith('- [ ] '))
}

async function expandHome($: EngineInterface, path: string) {
  if (!path.startsWith('~')) return path
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''

  return home + path.slice(1)
}

async function readOrEmpty($: EngineInterface, path: string) {
  try {
    return await $.fs.read(path)
  } catch {
    return ''
  }
}

async function park($: EngineInterface, configured: string, idea: string) {
  const path = await expandHome($, configured)
  const root = await $.session.root()
  const project = root.split('/').filter(part => part.length > 0).pop() ?? root
  const file = await readOrEmpty($, path)
  await $.fs.write(path, addToInbox(file, lineFor(await $.clock.now(), idea, project)))

  return { path, count: openIdeas(await readOrEmpty($, path)).length }
}

export const register: Register = (on, options) => {
  const configured =
    typeof options.backlogPath === 'string' && options.backlogPath.length > 0 ? options.backlogPath : '~/claude-kit/ideas/BACKLOG.md'

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'idea', description: 'Park an idea in the backlog', argumentHint: '<idea>', immediate: true })
    await $.command.register({ name: 'ideas', description: 'List open ideas in the backlog' })
    await $.tool.register({
      name: 'park_idea',
      description:
        'Adds an idea to the user\'s idea backlog for later. Use it when the user says to park, save for later, add to the backlog or "remind me later" about an idea, or when you notice a side idea worth keeping that is outside the current task (say so in one line). One idea per call, written as one clear sentence.',
      inputSchema: { type: 'object', properties: { idea: { type: 'string', description: 'The idea, one sentence.' } }, required: ['idea'] },
      isDeferred: false,
    })

    return result
  })

  on('command.run', { command: 'idea' }, async ($, e) => {
    if (e.args.trim().length === 0) return { text: 'Usage: /idea <your idea>' }
    const { path, count } = await park($, configured, e.args)

    return { text: `Parked. ${count} open ideas in ${path}.` }
  })

  on('command.run', { command: 'ideas' }, async $ => {
    const path = await expandHome($, configured)
    const open = openIdeas(await readOrEmpty($, path))

    return { text: open.length === 0 ? `No open ideas in ${path}.` : `${open.length} open ideas (${path}):\n${open.join('\n')}` }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const idea = typeof e.idea === 'string' ? e.idea : ''
    if (idea.trim().length === 0) return { deny: 'park_idea needs an idea.' }
    const { count } = await park($, configured, idea)
    $.ui.toast(`Idea parked (${count} open).`)

    return { result: `Parked. The backlog has ${count} open ideas.` }
  }).catch(() => ({ deny: 'idea-inbox could not write the backlog file.' }))
}
