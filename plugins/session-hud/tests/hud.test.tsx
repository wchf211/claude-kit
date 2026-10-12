import { expect, test } from 'claude-code/testing'

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

test('the band shows context and cache, with three buttons when idle', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-hud', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /cache/ })).toBeDefined()
    expect(await ui.find({ key: 'compact' })).toBeDefined()
    expect(await ui.find({ key: 'handoff' })).toBeDefined()
    expect(await ui.find({ key: 'reflect' })).toBeDefined()
    await ui.unmount()
  }
})

test('the buttons hide while Claude is working', async $ => {
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
