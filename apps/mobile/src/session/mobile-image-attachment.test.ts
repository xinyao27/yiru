import { describe, expect, it, vi } from 'vite-plus/test'

import type { RpcClient } from '../transport/rpc-client'
import { markRpcDeliveryUnknown } from '../transport/rpc-delivery-ambiguity'
import { attachMobileImageToTerminal } from './mobile-image-attachment'

function createClient(terminalResult: 'accepted' | 'rejected' | 'unknown') {
  const sendRequest = vi.fn(async (method: string) => {
    if (method === 'clipboard.startImageUpload') {
      return {
        id: 'request-1',
        ok: false,
        error: { code: 'method_not_found', message: 'old host' },
        _meta: { runtimeId: 'runtime-1' }
      }
    }
    if (method === 'clipboard.saveImageAsTempFile') {
      return {
        id: 'request-2',
        ok: true,
        result: '/tmp/image.png',
        _meta: { runtimeId: 'runtime-1' }
      }
    }
    if (terminalResult === 'unknown') {
      throw markRpcDeliveryUnknown(new Error('ack lost'))
    }
    return {
      id: 'request-3',
      ok: true,
      result: { send: { accepted: terminalResult === 'accepted' } },
      _meta: { runtimeId: 'runtime-1' }
    }
  })
  return { client: { sendRequest } as unknown as RpcClient, sendRequest }
}

describe('attachMobileImageToTerminal', () => {
  it.each(['accepted', 'rejected', 'unknown'] as const)(
    'preserves the terminal paste %s outcome',
    async (outcome) => {
      const { client } = createClient(outcome)

      await expect(
        attachMobileImageToTerminal('library', {
          client,
          terminal: 'terminal-1',
          deviceToken: null,
          getConnectionId: async () => null,
          pickImage: async () => ({ base64: 'AAAA' })
        })
      ).resolves.toBe(outcome)
    }
  )

  it('distinguishes a blocked lease from a rejected terminal paste', async () => {
    const { client, sendRequest } = createClient('accepted')

    await expect(
      attachMobileImageToTerminal('library', {
        client,
        terminal: 'terminal-1',
        deviceToken: null,
        getConnectionId: async () => null,
        pickImage: async () => ({ base64: 'AAAA' }),
        beforeTerminalSend: async () => false
      })
    ).resolves.toBe('blocked')
    expect(sendRequest).not.toHaveBeenCalledWith('terminal.send', expect.anything())
  })
})
