import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0', quit: vi.fn() }
}))
vi.mock('./persistence', () => ({
  getCanonicalUserDataPath: () => '/canonical/yiru'
}))

import { isServeUpdateSupervisorConfigured } from './serve-update-handoff'

describe('serve update supervisor signal', () => {
  it('requires macOS, the canonical handoff path, and a live IPC owner', () => {
    const base = {
      platform: 'darwin' as const,
      configuredPath: '/canonical/yiru/serve-update-handoff.json',
      expectedPath: '/canonical/yiru/serve-update-handoff.json',
      ipcConnected: true
    }
    expect(isServeUpdateSupervisorConfigured(base)).toBe(true)
    expect(isServeUpdateSupervisorConfigured({ ...base, platform: 'linux' })).toBe(false)
    expect(isServeUpdateSupervisorConfigured({ ...base, platform: 'win32' })).toBe(false)
    expect(isServeUpdateSupervisorConfigured({ ...base, ipcConnected: false })).toBe(false)
    expect(
      isServeUpdateSupervisorConfigured({ ...base, configuredPath: '/tmp/untrusted.json' })
    ).toBe(false)
  })
})
