import { describe, expect, it, vi } from 'vite-plus/test'

import type { RpcClient } from '../transport/rpc-client'
import { markRpcDeliveryUnknown } from '../transport/rpc-delivery-ambiguity'
import { LogicalClientCutoverError } from '../transport/stable-logical-rpc-client'
import { sendMobileNativeChatMessageWithOutcome } from './mobile-native-chat-send'

function clientWith(result: unknown): RpcClient {
  return {
    sendRequest: vi
      .fn()
      .mockImplementation(() =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
      )
  } as unknown as RpcClient
}

describe('sendMobileNativeChatMessageWithOutcome', () => {
  it('distinguishes an explicit rejection from delivery ambiguity', async () => {
    const rejected = clientWith({
      id: 'request-1',
      ok: true,
      result: { send: { accepted: false } },
      _meta: { runtimeId: 'runtime-1' }
    })
    const interrupted = clientWith(markRpcDeliveryUnknown(new Error('connection interrupted')))
    const cutover = clientWith(new LogicalClientCutoverError())

    await expect(
      sendMobileNativeChatMessageWithOutcome({
        client: rejected,
        terminal: 'terminal-1',
        text: 'hello'
      })
    ).resolves.toBe('rejected')
    await expect(
      sendMobileNativeChatMessageWithOutcome({
        client: interrupted,
        terminal: 'terminal-1',
        text: 'hello'
      })
    ).resolves.toBe('unknown')
    await expect(
      sendMobileNativeChatMessageWithOutcome({
        client: cutover,
        terminal: 'terminal-1',
        text: 'hello'
      })
    ).resolves.toBe('unknown')
  })
})
