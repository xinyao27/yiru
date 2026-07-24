import { describe, expect, it, vi } from 'vite-plus/test'

import type { RpcClient } from '../transport/rpc-client'
import {
  beginMobileNativeChatSend,
  createMobileNativeChatInputHealingState,
  healMobileNativeChatInput,
  markMobileNativeChatImagePasted,
  recordMobileNativeChatImagePasteOutcome,
  recordMobileNativeChatSendOutcome
} from './mobile-native-chat-input-healing'

function acceptedClient() {
  const sendRequest = vi.fn().mockResolvedValue({
    id: 'request-1',
    ok: true,
    result: { send: { accepted: true } },
    _meta: { runtimeId: 'runtime-1' }
  })
  return { client: { sendRequest } as unknown as RpcClient, sendRequest }
}

describe('Mobile native chat image input healing', () => {
  it('marks an image-bearing unknown send stale and clears it before the next send', async () => {
    const state = createMobileNativeChatInputHealingState()
    markMobileNativeChatImagePasted(state, 'terminal-1')
    const send = beginMobileNativeChatSend(state, 'terminal-1')

    recordMobileNativeChatSendOutcome(state, send, 'unknown')
    expect(state.pastedImageTerminals.has('terminal-1')).toBe(false)
    expect(state.staleInputTerminals.has('terminal-1')).toBe(true)

    const { client, sendRequest } = acceptedClient()
    await expect(
      healMobileNativeChatInput({ state, client, terminal: 'terminal-1' })
    ).resolves.toBe(true)
    expect(sendRequest).toHaveBeenCalledWith('terminal.send', {
      terminal: 'terminal-1',
      text: '\x15',
      enter: false
    })
    expect(state.staleInputTerminals.has('terminal-1')).toBe(false)
  })

  it('does not mark a text-only unknown send as stale', () => {
    const state = createMobileNativeChatInputHealingState()
    const send = beginMobileNativeChatSend(state, 'terminal-1')

    recordMobileNativeChatSendOutcome(state, send, 'unknown')

    expect(state.staleInputTerminals.size).toBe(0)
  })

  it('keeps a pasted image pending after an explicit rejection so retry includes it', () => {
    const state = createMobileNativeChatInputHealingState()
    markMobileNativeChatImagePasted(state, 'terminal-1')
    const send = beginMobileNativeChatSend(state, 'terminal-1')

    recordMobileNativeChatSendOutcome(state, send, 'rejected')

    expect(state.pastedImageTerminals.has('terminal-1')).toBe(true)
    expect(state.staleInputTerminals.size).toBe(0)
  })

  it.each(['rejected', 'unknown'] as const)(
    'marks a %s image paste stale before later text',
    (outcome) => {
      const state = createMobileNativeChatInputHealingState()

      recordMobileNativeChatImagePasteOutcome(state, 'terminal-1', outcome)

      expect(state.pastedImageTerminals.size).toBe(0)
      expect(state.staleInputTerminals.has('terminal-1')).toBe(true)
    }
  )

  it('tracks an accepted image paste as pending input', () => {
    const state = createMobileNativeChatInputHealingState()

    recordMobileNativeChatImagePasteOutcome(state, 'terminal-1', 'accepted')

    expect(state.pastedImageTerminals.has('terminal-1')).toBe(true)
    expect(state.staleInputTerminals.size).toBe(0)
  })
})
