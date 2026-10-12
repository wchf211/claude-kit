import { expect, mock, test } from 'claude-code/testing'

import { checkKey, computeHints, isCorrection, parseBreaks } from '../hooks/register'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

const BASE = {
  percent: 10,
  localMinute: 10 * 60,
  breaks: parseBreaks('17:30 end of work, 22:30 bedtime'),
  leadMinutes: 30,
  sessionMinutes: 20,
  turns: 5,
  reflect: null,
  compactAt: 40,
  handoffAt: 70,
  longSessionMinutes: 180,
}

test('no hints in a calm session', () => {
  expect(computeHints(BASE)).toEqual([])
})

test('compact from 40%, handoff from 70%', () => {
  expect(computeHints({ ...BASE, percent: 45 }).map(h => h.kind)).toEqual(['compact'])
  expect(computeHints({ ...BASE, percent: 72 }).map(h => h.kind)).toEqual(['compact', 'handoff'])
})

test('handoff shortly before a break time', () => {
  const [hint] = computeHints({ ...BASE, localMinute: 17 * 60 + 10 })
  expect(hint).toEqual({ kind: 'handoff', reason: 'end of work at 17:30 (in 20 min)' })
  expect(computeHints({ ...BASE, localMinute: 16 * 60 })).toEqual([])
  expect(computeHints({ ...BASE, localMinute: 22 * 60 + 15 })[0]?.reason).toContain('bedtime')
})

test('handoff after a long session', () => {
  expect(computeHints({ ...BASE, sessionMinutes: 200, turns: 12 })[0]?.reason).toBe('This session has run 3h')
})

test('reflect comes first when there is a reason', () => {
  expect(computeHints({ ...BASE, percent: 50, reflect: 'You just corrected me' })[0]?.kind).toBe('reflect')
})

test('break times parse', () => {
  expect(parseBreaks('15:10 pick up kids, bad, 7:05')).toEqual([
    { minute: 15 * 60 + 10, label: 'pick up kids' },
    { minute: 7 * 60 + 5, label: 'break' },
  ])
})

test('corrections and checks are recognized', () => {
  expect(isCorrection('no, use pnpm')).toBe(true)
  expect(isCorrection('add retries to the consumer')).toBe(false)
  expect(checkKey('pytest tests/test_a.py -k slow')).toBe('pytest tests/test_a.py')
  expect(checkKey('go test ./... && echo ok')).toBe('go test')
  expect(checkKey('ls -la')).toBeUndefined()
})

test('the band stays empty without hints, and shows Reflect after a correction', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  mock.clock(on, { now: Date.UTC(2026, 9, 12, 17) })
  on('prompt.submit', ($, e) => ({ text: e.text }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const quiet = await $.ui.mount({ plugin: 'session-hud', surface, ...BAND })
    expect(await quiet.find({ key: 'reflect' })).toBeUndefined()
    await quiet.unmount()
  }

  await $.prompt.submit({ text: "no, don't use npm here", origin: { kind: 'composer' }, wait: false })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-hud', surface, ...BAND })
    expect(await ui.find({ key: 'reflect' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /corrected/ })).toBeDefined()
    expect(await ui.find({ key: 'compact' })).toBeUndefined()
    await ui.unmount()
  }
})
