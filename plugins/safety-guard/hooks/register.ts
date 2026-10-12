import type { Register } from 'claude-code'

type Rule = { pattern: RegExp; reason: string }

const BASH_RULES: Rule[] = [
  {
    pattern: /\bgit\s+push\b(?=.*(\s--force(?!-with-lease)\b|\s-f\b|\s\+\S))/,
    reason: 'force push rewrites shared history. Use --force-with-lease, or ask the user to run it.',
  },
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+-?[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*\s+-?[a-zA-Z]*r|-[a-zA-Z]*(rf|fr)[a-zA-Z]*)\b[^;&|]*\s(\/|\/\*|~\/?|\$HOME\/?|\*|\.\.?\/?)(\s|$|;|&|\|)/,
    reason: 'rm -rf on /, ~, $HOME, . , .. or * would wipe far more than intended.',
  },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: 'git reset --hard throws away uncommitted work. Ask the user first.' },
  { pattern: /\bgit\s+clean\s+-[a-zA-Z]*f/, reason: 'git clean -f deletes untracked files for good. Ask the user first.' },
  { pattern: /\bterraform\s+(apply|destroy)\b/, reason: 'terraform apply/destroy changes real infrastructure. Show the plan and let the user run it.' },
  { pattern: /\bterragrunt\s+(apply|destroy|run-all\s+(apply|destroy))\b/, reason: 'terragrunt apply/destroy changes real infrastructure.' },
  {
    pattern: /\bkubectl\b(?=.*\bprod)(?=.*\b(apply|delete|edit|patch|scale|replace|drain|cordon|rollout\s+restart)\b)/,
    reason: 'this kubectl command changes a production cluster. Let the user run it.',
  },
  { pattern: /\bhelm\b(?=.*\bprod)(?=.*\b(install|upgrade|uninstall|delete|rollback)\b)/, reason: 'this helm command changes a production release.' },
  { pattern: /\b(DROP\s+(TABLE|DATABASE|SCHEMA|KEYSPACE)|TRUNCATE\s+TABLE)\b/i, reason: 'this SQL drops or truncates data.' },
  { pattern: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/, reason: 'piping a download into a shell runs unreviewed code.' },
  { pattern: /\b(mkfs(\.\w+)?|dd\s+[^;]*of=\/dev\/)/, reason: 'this writes a raw disk.' },
  { pattern: /\bchmod\s+(-R\s+)?777\b/, reason: 'chmod 777 opens the files to everyone.' },
  { pattern: /\b(gsutil\s+(-m\s+)?rm\s+-r|gcloud\s+storage\s+rm\s+-r|aws\s+s3\s+rb|aws\s+s3\s+rm\s+[^;]*--recursive)\b/, reason: 'this deletes a cloud bucket or many objects.' },
]

const SECRET_PATH = /(^|\/)(\.env(\.(?!example$|sample$|template$)[\w.-]+)?|[^/]+\.(pem|key|p12|pfx)|id_(rsa|ed25519|ecdsa)(\.pub)?|\.ssh\/[^/]+|\.aws\/credentials|\.netrc|\.npmrc|\.pypirc|credentials\.json|service-account[^/]*\.json)$/

export function bashReason(command: string, extra: readonly RegExp[]): string | undefined {
  const hit = BASH_RULES.find(rule => rule.pattern.test(command))
  if (hit !== undefined) return hit.reason
  if (extra.some(pattern => pattern.test(command))) return 'it matches a pattern the user blocked.'

  return undefined
}

export function isSecretPath(path: string): boolean {
  return SECRET_PATH.test(path)
}

export function parseExtra(text: unknown): RegExp[] {
  if (typeof text !== 'string') return []

  return text
    .split(';;')
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .flatMap(part => {
      try {
        return [new RegExp(part)]
      } catch {
        return []
      }
    })
}

export const register: Register = (on, options) => {
  const extra = parseExtra(options.extraBlocked)

  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const reason = bashReason(e.command, extra)

    return reason === undefined ? next(e) : { deny: `safety-guard blocked this: ${reason}` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'safety-guard: its check failed, so the command was blocked.' }))

  on('tool.call', { tool: ['Edit', 'Write'] }, ($, e, next) =>
    isSecretPath(e.file_path)
      ? { deny: `safety-guard blocked this: ${e.file_path} holds secrets. Ask the user to change it.` }
      : next(e),
  ).catch(($, e, next) => (next.called ? next(e) : { deny: 'safety-guard: its check failed, so the edit was blocked.' }))

  on('tool.call', { tool: 'Read' }, ($, e, next) =>
    isSecretPath(e.file_path)
      ? { deny: `safety-guard blocked this: ${e.file_path} holds secrets, so it stays out of the transcript.` }
      : next(e),
  ).catch(($, e, next) => (next.called ? next(e) : { deny: 'safety-guard: its check failed, so the read was blocked.' }))
}
