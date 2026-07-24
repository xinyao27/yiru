import { describe, expect, it } from 'vite-plus/test'

import { resolveRemoteServerUpdateSupport } from './remote-server-update-support'

describe('remote server update support', () => {
  it('keeps direct headless services manual even when the updater is initialized', () => {
    expect(
      resolveRemoteServerUpdateSupport({
        installMode: 'unsupported-headless-serve',
        isPackaged: true,
        isDev: false,
        updaterInitialized: true
      })
    ).toEqual({
      installMode: 'unsupported-headless-serve',
      automatic: false,
      reason: 'manual-service-update-required'
    })
  })

  it('advertises control only for packaged, initialized, restart-owned installs', () => {
    expect(
      resolveRemoteServerUpdateSupport({
        installMode: 'interactive',
        isPackaged: true,
        isDev: false,
        updaterInitialized: true
      })
    ).toEqual({ installMode: 'interactive', automatic: true, reason: 'available' })
    expect(
      resolveRemoteServerUpdateSupport({
        installMode: 'interactive',
        isPackaged: true,
        isDev: false,
        updaterInitialized: false
      }).reason
    ).toBe('updater-unavailable')
  })
})
