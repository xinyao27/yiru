import { describe, expect, it } from 'vite-plus/test'

import { mapRuntimeError } from './errors'

describe('runtime RPC error mapping', () => {
  it.each([
    'remote_update_manual_required',
    'remote_update_not_available',
    'remote_update_not_downloaded'
  ])('preserves remote updater failure %s', (code) => {
    expect(mapRuntimeError('request-1', { runtimeId: 'runtime-1' }, new Error(code))).toMatchObject(
      {
        ok: false,
        error: { code, message: code }
      }
    )
  })
})
