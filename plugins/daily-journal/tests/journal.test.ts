import { expect, test } from 'claude-code/testing'

import { dayOf, needsWrapUp, setWrapUp, timeOf, upsertBlock, withoutWrapUp } from '../hooks/register'

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

test('wrap-up is needed once, then again only after the journal changes', () => {
  const day = upsertBlock('# Journal 2026-10-12\n\n', 'a', '## 09:00–10:00 · kit\n- Did: one')
  expect(needsWrapUp('# Journal 2026-10-12\n')).toBe(false)
  expect(needsWrapUp(day)).toBe(true)
  const wrapped = setWrapUp(day, '## Wrap-up\n**Summary:** fine')
  expect(needsWrapUp(wrapped)).toBe(false)
  expect(withoutWrapUp(wrapped)).toBe(withoutWrapUp(day))
  const later = upsertBlock(wrapped, 'b', '## 20:00–21:00 · kit\n- Did: two')
  expect(needsWrapUp(later)).toBe(true)
  const rewrapped = setWrapUp(later, '## Wrap-up\n**Summary:** two')
  expect(rewrapped.match(/Wrap-up/g)?.length).toBe(1)
  expect(rewrapped.indexOf('- Did: two')).toBeLessThan(rewrapped.indexOf('## Wrap-up'))
})

test('day and time use the given offset', () => {
  const at = Date.UTC(2026, 9, 13, 5, 30)
  expect(dayOf(at, -7 * 60)).toBe('2026-10-12')
  expect(timeOf(at, -7 * 60)).toBe('22:30')
})
