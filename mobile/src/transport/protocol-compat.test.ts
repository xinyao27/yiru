import { describe, expect, it } from 'vite-plus/test'
import { evaluateCompat } from './protocol-compat'

describe('evaluateCompat', () => {
  it('allows the current mobile app to connect before a protocol-2 desktop updates', () => {
    expect(
      evaluateCompat({
        desktopProtocolVersion: 2,
        desktopMinCompatibleMobileVersion: 2
      })
    ).toEqual({ kind: 'ok' })
  })
})
