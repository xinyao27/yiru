import { describe, expect, it } from 'vite-plus/test'

import type { RpcRequest } from './rpc/core'
import { isLongPollRequest } from './runtime-rpc-long-poll-classification'

function request(method: string, params?: unknown): RpcRequest {
  return { id: 'request-id', authToken: 'token', method, params }
}

describe('isLongPollRequest', () => {
  it('classifies orchestration.ask for keepalive and cancellation wiring', () => {
    expect(isLongPollRequest(request('orchestration.ask'))).toBe(true)
  })

  it('preserves existing conditional and ordinary RPC behavior', () => {
    expect(isLongPollRequest(request('terminal.wait'))).toBe(true)
    expect(isLongPollRequest(request('orchestration.check', { wait: true }))).toBe(true)
    expect(isLongPollRequest(request('orchestration.check', { wait: false }))).toBe(false)
    expect(isLongPollRequest(request('orchestration.send'))).toBe(false)
  })
})
