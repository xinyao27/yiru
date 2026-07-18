import { describe, expect, it, vi } from 'vite-plus/test'
import {
  dispatchSpoolPeerResponse,
  type SpoolPendingPeerRequest
} from './spool-peer-response-dispatch'

describe('Spool peer response dispatch', () => {
  it('preserves a validated owner diagnostic message for requester handling', () => {
    const reject = vi.fn()
    const pending = new Map<string, SpoolPendingPeerRequest>([
      [
        'request-one',
        {
          mutation: false,
          streaming: false,
          timeout: null,
          resolve: vi.fn(),
          reject
        }
      ]
    ])

    dispatchSpoolPeerResponse({
      plaintext: JSON.stringify({
        id: 'request-one',
        ok: false,
        error: {
          code: 'internal_error',
          message: 'internal_error:session-consistency'
        },
        ownerRuntimeId: 'owner-one'
      }),
      ownerRuntimeId: 'owner-one',
      pending,
      onOwnerMismatch: vi.fn(),
      onProtocolViolation: vi.fn()
    })

    expect(reject).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'internal_error:session-consistency' })
    )
  })
})
