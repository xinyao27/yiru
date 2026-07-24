import { describe, expect, it, vi } from 'vite-plus/test'

import type { RpcClient } from '../transport/rpc-client'
import { markRpcDeliveryUnknown } from '../transport/rpc-delivery-ambiguity'
import { sendMobileBufferedTerminalInput } from './mobile-buffered-terminal-send'
import {
  createMobileNativeChatInputHealingState,
  recordMobileNativeChatImagePasteOutcome
} from './mobile-native-chat-input-healing'

function acceptedResponse(id: string) {
  return {
    id,
    ok: true as const,
    result: { send: { accepted: true } },
    _meta: { runtimeId: 'runtime-1' }
  }
}

describe('sendMobileBufferedTerminalInput', () => {
  it('heals an ambiguous image paste before sending the next raw terminal command', async () => {
    const state = createMobileNativeChatInputHealingState()
    recordMobileNativeChatImagePasteOutcome(state, 'terminal-1', 'unknown')
    const sendRequest = vi
      .fn()
      .mockResolvedValueOnce(acceptedResponse('heal'))
      .mockResolvedValueOnce(acceptedResponse('command'))

    await expect(
      sendMobileBufferedTerminalInput({
        state,
        client: { sendRequest } as unknown as RpcClient,
        terminal: 'terminal-1',
        text: 'next command'
      })
    ).resolves.toBe('accepted')

    expect(sendRequest).toHaveBeenNthCalledWith(1, 'terminal.send', {
      terminal: 'terminal-1',
      text: '\x15',
      enter: false
    })
    expect(sendRequest).toHaveBeenNthCalledWith(2, 'terminal.send', {
      terminal: 'terminal-1',
      text: 'next command',
      enter: true
    })
  })

  it('marks an image-bearing ambiguous command stale without retrying it', async () => {
    const state = createMobileNativeChatInputHealingState()
    recordMobileNativeChatImagePasteOutcome(state, 'terminal-1', 'accepted')
    const sendRequest = vi.fn().mockRejectedValue(markRpcDeliveryUnknown(new Error('ack lost')))

    await expect(
      sendMobileBufferedTerminalInput({
        state,
        client: { sendRequest } as unknown as RpcClient,
        terminal: 'terminal-1',
        text: 'describe this image'
      })
    ).resolves.toBe('unknown')

    expect(sendRequest).toHaveBeenCalledOnce()
    expect(state.pastedImageTerminals.has('terminal-1')).toBe(false)
    expect(state.staleInputTerminals.has('terminal-1')).toBe(true)
  })
})
