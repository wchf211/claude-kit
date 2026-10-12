import type { EngineInterface, Register } from 'claude-code'

type Plan = { format: string[][]; lint: string[][] }

const MAX_LINT_LINES = 40

const extOf = (path: string) => {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')

  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

// Each list holds candidates tried in order; the first that starts wins.
export function planFor(path: string): Plan | undefined {
  switch (extOf(path)) {
    case 'py':
      return { format: [['ruff', 'format', '--quiet', path], ['black', '--quiet', path]], lint: [['ruff', 'check', '--output-format=concise', '--quiet', path]] }
    case 'go':
      return { format: [['gofmt', '-w', path]], lint: [] }
    case 'rs':
      return { format: [['rustfmt', '--quiet', path]], lint: [] }
    case 'sh':
    case 'bash':
      return { format: [['shfmt', '-w', path]], lint: [['shellcheck', '-f', 'gcc', path]] }
    case 'tf':
      return { format: [['terraform', 'fmt', path]], lint: [] }
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
      return {
        format: [['node_modules/.bin/prettier', '--write', '--log-level=warn', path], ['prettier', '--write', '--log-level=warn', path]],
        lint: [['node_modules/.bin/eslint', '--format=unix', path]],
      }
    case 'json':
    case 'css':
    case 'scss':
    case 'yaml':
    case 'yml':
      return { format: [['node_modules/.bin/prettier', '--write', '--log-level=warn', path], ['prettier', '--write', '--log-level=warn', path]], lint: [] }
    default:
      return undefined
  }
}

// Runs the first candidate that starts; undefined when none is installed.
async function runFirst($: EngineInterface, candidates: readonly string[][]) {
  for (const argv of candidates) {
    try {
      const ran = await $.process.run(argv, { timeoutMs: 20_000 })

      return { tool: argv[0] ?? '', ...ran }
    } catch {
      continue
    }
  }

  return undefined
}

async function readOrEmpty($: EngineInterface, path: string) {
  try {
    return await $.fs.read(path)
  } catch {
    return ''
  }
}

export const register: Register = (on, options) => {
  const lint = options.lint !== false

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny !== undefined || result.isError === true) return result

    const plan = planFor(e.file_path)
    if (plan === undefined) return result

    const notes: string[] = []
    const before = await readOrEmpty($, e.file_path)
    const formatted = await runFirst($, plan.format)
    if (formatted !== undefined && formatted.exitCode === 0 && (await readOrEmpty($, e.file_path)) !== before) {
      notes.push(`auto-format: ${formatted.tool} reformatted ${e.file_path}. Read it again before the next Edit of that file.`)
    }

    if (lint) {
      const linted = await runFirst($, plan.lint)
      const output = `${linted?.stdout ?? ''}${linted?.stderr ?? ''}`.trim()
      if (linted !== undefined && linted.exitCode !== 0 && output.length > 0) {
        const lines = output.split('\n')
        const shown = lines.slice(0, MAX_LINT_LINES).join('\n')
        const more = lines.length > MAX_LINT_LINES ? `\n(${lines.length - MAX_LINT_LINES} more lines)` : ''
        notes.push(`auto-format: ${linted.tool} found problems in ${e.file_path}:\n${shown}${more}`)
      }
    }

    return notes.length === 0 ? result : { ...result, context: [...(result.context ?? []), ...notes] }
  }).catch(($, e, next) => next(e))
}
