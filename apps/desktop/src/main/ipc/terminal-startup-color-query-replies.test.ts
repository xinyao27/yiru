import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  answerStartupTerminalColorQueries,
  clearStartupTerminalColorQueryReplies,
  registerStartupTerminalColorQueryReplies
} from './terminal-startup-color-query-replies'

const PTY_ID = 'startup-color-query-test'
const COMBINED_COLOR_QUERY = '\x1b]10;?;?\x07'
const COMBINED_COLOR_REPLIES = '\x1b]10;rgb:1111/2222/3333\x1b\\\x1b]11;rgb:4444/5555/6666\x1b\\'

afterEach(() => {
  clearStartupTerminalColorQueryReplies(PTY_ID)
})

describe('startup terminal color query replies', () => {
  it('removes an answered query before renderer delivery', () => {
    const write = vi.fn()
    registerStartupTerminalColorQueryReplies(PTY_ID, {
      foreground: '#123',
      background: '#456'
    })

    const input = `before${COMBINED_COLOR_QUERY}after`
    const rendererData = answerStartupTerminalColorQueries(PTY_ID, input, () => ({ write }))

    expect(rendererData).toBe('beforeafter')
    expect(write).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledWith(PTY_ID, COMBINED_COLOR_REPLIES)
  })

  it('keeps the whole query visible when the atomic provider write fails', () => {
    const failedWrite = vi.fn(() => {
      throw new Error('provider unavailable')
    })
    registerStartupTerminalColorQueryReplies(PTY_ID, {
      foreground: '#123',
      background: '#456'
    })

    const failedData = answerStartupTerminalColorQueries(PTY_ID, COMBINED_COLOR_QUERY, () => ({
      write: failedWrite
    }))
    expect(failedData).toBe(COMBINED_COLOR_QUERY)
    expect(failedWrite).toHaveBeenCalledOnce()

    const recoveredWrite = vi.fn()
    const recoveredData = answerStartupTerminalColorQueries(PTY_ID, COMBINED_COLOR_QUERY, () => ({
      write: recoveredWrite
    }))
    expect(recoveredData).toBe('')
    expect(recoveredWrite).toHaveBeenCalledWith(PTY_ID, COMBINED_COLOR_REPLIES)
  })
})
