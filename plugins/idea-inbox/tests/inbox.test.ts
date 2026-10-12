import { expect, test } from 'claude-code/testing'

import { addToInbox, lineFor, openIdeas } from '../hooks/register'

test('a new backlog gets the template and the idea', () => {
  const file = addToInbox('', '- [ ] try Bigtable change streams')
  expect(file).toContain('# Idea backlog')
  expect(file.indexOf('try Bigtable')).toBeLessThan(file.indexOf('## Exploring'))
})

test('ideas stay in the Inbox, in order', () => {
  let file = addToInbox('', '- [ ] one')
  file = addToInbox(file, '- [ ] two')
  expect(openIdeas(file)).toEqual(['- [ ] one', '- [ ] two'])
  expect(file.indexOf('- [ ] two')).toBeLessThan(file.indexOf('## Exploring'))
})

test('a line has the date and the project', () => {
  expect(lineFor(Date.UTC(2026, 9, 12, 12), 'agent eval\nharness', 'kit')).toMatch(/^- \[ \] agent eval harness · _2026-10-1\d, from kit_$/)
})
