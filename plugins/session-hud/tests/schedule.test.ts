import { expect, test } from 'claude-code/testing'

import { breaksOn, dayAt, endOfWork } from '../hooks/schedule'

const FILE = `# Schedule

## Regular
- weekdays 17:30 end of work
- Tue,Thu 15:15 kids pickup
- daily 22:30 bedtime

## Dates
- 2026-10-14 16:00 end of work   # dentist
- 2026-11-26 off Thanksgiving
- 2026-12-21..2027-01-02 off winter break
`

const at = (iso: string, weekday: number) => breaksOn(FILE, { iso, weekday }).map(one => `${one.minute / 60}h ${one.label}`)

test('regular weekday', () => {
  expect(at('2026-10-12', 1)).toEqual(['17.5h end of work', '22.5h bedtime'])
  expect(at('2026-10-13', 2)).toEqual(['15.25h kids pickup', '17.5h end of work', '22.5h bedtime'])
})

test('weekend keeps only daily entries', () => {
  expect(at('2026-10-17', 6)).toEqual(['22.5h bedtime'])
})

test('a dated time replaces the regular one with the same label', () => {
  expect(at('2026-10-14', 3)).toEqual(['16h end of work', '22.5h bedtime'])
})

test('a day off and a range off keep only daily entries', () => {
  expect(at('2026-11-26', 4)).toEqual(['22.5h bedtime'])
  expect(at('2026-12-30', 3)).toEqual(['22.5h bedtime'])
})

test('local day and end of work', () => {
  expect(dayAt(Date.UTC(2026, 9, 13, 5, 0), -7 * 60)).toEqual({ iso: '2026-10-12', weekday: 1 })
  expect(endOfWork(breaksOn(FILE, { iso: '2026-10-12', weekday: 1 }))?.minute).toBe(17 * 60 + 30)
})
