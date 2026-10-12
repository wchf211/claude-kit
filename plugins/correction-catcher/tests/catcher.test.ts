import { expect, test } from 'claude-code/testing'

import { entryFor, isCorrection } from '../hooks/register'

test('spots corrections', () => {
  for (const text of [
    'no, use pnpm not npm',
    "Don't add comments to every line",
    'I said keep it in Go',
    'you forgot to run the tests',
    'that is not what I asked for',
    'Always use uv for python here',
  ])
    expect(isCorrection(text)).toBe(true)
})

test('leaves normal prompts alone', () => {
  for (const text of ['add a retry to the kafka consumer', 'now write the tests', 'looks good, ship it', 'notes for the design doc'])
    expect(isCorrection(text)).toBe(false)
})

test('an entry is one checklist item with both sides', () => {
  const entry = entryFor(Date.UTC(2026, 9, 12, 5, 0), '/repo', 'no, use pnpm', 'I will run npm install')
  expect(entry.startsWith('- [ ] 2026-10-')).toBe(true)
  expect(entry).toContain('You said: no, use pnpm')
  expect(entry).toContain('Claude had just said: I will run npm install')
})
