import { expect, test } from 'claude-code/testing'

import { upsertBlock } from '../hooks/register'

test('adds a block, then replaces it for the same session', () => {
  const header = '# Journal 2026-10-12\n\n'
  const once = upsertBlock(header, 'abc', '## 09:00–09:30 · kit\n- Did: one')
  expect(once).toContain('- Did: one')
  const twice = upsertBlock(once, 'abc', '## 09:00–10:00 · kit\n- Did: two')
  expect(twice).toContain('- Did: two')
  expect(twice).not.toContain('- Did: one')
  expect(twice.startsWith(header)).toBe(true)
})

test('keeps other sessions apart', () => {
  const a = upsertBlock('# J\n', 'a', '- A')
  const ab = upsertBlock(a, 'b', '- B')
  const ab2 = upsertBlock(ab, 'a', '- A2')
  expect(ab2).toContain('- B')
  expect(ab2).toContain('- A2')
  expect(ab2.indexOf('- A2')).toBeLessThan(ab2.indexOf('- B'))
})
