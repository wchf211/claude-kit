import { expect, test } from 'claude-code/testing'

import { statusText } from '../hooks/register'

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

test('the band shows the three buttons when idle', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-hud', surface, ...BAND })
    expect(await ui.find({ key: 'compact' })).toBeDefined()
    expect(await ui.find({ key: 'handoff' })).toBeDefined()
    expect(await ui.find({ key: 'reflect' })).toBeDefined()
    await ui.unmount()
  }
})

test('the buttons hide while Claude is working', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  const ui = await $.ui.mount({
    plugin: 'session-hud',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, isWorking: true },
  })
  expect(await ui.find({ key: 'compact' })).toBeUndefined()
  await ui.unmount()
})

test('/hud toggles the band', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  const { text } = await $.command.run({
    command: 'hud',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })
  expect(text).toBe('HUD hidden.')
  const ui = await $.ui.mount({ plugin: 'session-hud', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'compact' })).toBeUndefined()
  await ui.unmount()
})

test('the status line carries every figure and marks a full context', () => {
  const fill = { percent: 55, tokens: 110_000, window: 200_000, fiveHour: 27, sevenDay: 18, usd: 0.12 }
  expect(statusText(fill, 192_000, 50)).toBe('🔴 ctx 55% (110k/200k) · cache 3:12 · 5h 27% · 7d 18% · $0.12')
  expect(statusText({ ...fill, percent: 40 }, 0, 50)).toContain('🟡 ctx 40%')
  expect(statusText({ ...fill, percent: 4 }, null, 50)?.startsWith('ctx 4%')).toBe(true)
})
