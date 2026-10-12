import { expect, test } from 'claude-code/testing'

import { planFor } from '../hooks/register'

test('plans by file type', () => {
  expect(planFor('a/b.py')?.format[0]?.[0]).toBe('ruff')
  expect(planFor('main.go')?.format[0]?.[0]).toBe('gofmt')
  expect(planFor('README')).toBeUndefined()
  expect(planFor('notes.md')).toBeUndefined()
})

test('tells Claude when a file was reformatted and linted', async ($, on) => {
  let reads = 0
  on('tool.call', () => ({ result: { filePath: 'x.py' } }) as never)
  on('fs.read', ($, e) => {
    reads += 1
    return { value: reads === 1 ? 'x=1\n' : 'x = 1\n' }
  })
  on('process.run', ($, e) => {
    const argv = e.argv
    if (argv[1] === 'format') return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    return { value: { exitCode: 1, stdout: 'x.py:1:1: F401 unused import', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const ran = await $.tool.call({ tool: 'Write', file_path: 'x.py', content: 'x=1\n' })
  const context = (ran as { context?: readonly string[] }).context ?? []
  expect(context.some(line => line.includes('reformatted'))).toBe(true)
  expect(context.some(line => line.includes('F401'))).toBe(true)
})

test('stays quiet for files it does not know', async ($, on) => {
  on('tool.call', () => ({ result: { filePath: 'x.txt' } }) as never)
  const ran = await $.tool.call({ tool: 'Write', file_path: 'x.txt', content: 'hi' })
  expect((ran as { context?: readonly string[] }).context ?? []).toEqual([])
})
