import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  handlers,
  createCloudLinkedYiruProfileMock,
  connectCurrentYiruProfileMock,
  getCurrentYiruProfileAuthStatusMock,
  refreshCurrentYiruProfileAuthMock,
  selectCurrentYiruProfileOrgMock,
  signOutCurrentYiruProfileMock
} = vi.hoisted(() => ({
  handlers: new Map<string, (_event: unknown, args?: unknown) => unknown>(),
  createCloudLinkedYiruProfileMock: vi.fn(),
  connectCurrentYiruProfileMock: vi.fn(),
  getCurrentYiruProfileAuthStatusMock: vi.fn(),
  refreshCurrentYiruProfileAuthMock: vi.fn(),
  selectCurrentYiruProfileOrgMock: vi.fn(),
  signOutCurrentYiruProfileMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    exit: vi.fn(),
    getPath: () => '/tmp/yiru-user-data',
    relaunch: vi.fn()
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    })
  }
}))

vi.mock('../tray/system-tray', () => ({
  destroySystemTray: vi.fn()
}))

vi.mock('../yiru-profiles/profile-index-store', () => ({
  createLocalYiruProfile: vi.fn(),
  getYiruProfileListState: vi.fn(),
  seedNewYiruProfileTelemetryConsent: vi.fn(),
  setActiveYiruProfile: vi.fn()
}))

vi.mock('../yiru-profiles/profile-project-transfer', () => ({
  transferYiruProfileProject: vi.fn()
}))

vi.mock('../yiru-profiles/profile-cloud-service', () => ({
  createCloudLinkedYiruProfile: createCloudLinkedYiruProfileMock,
  connectCurrentYiruProfile: connectCurrentYiruProfileMock,
  getCurrentYiruProfileAuthStatus: getCurrentYiruProfileAuthStatusMock,
  refreshCurrentYiruProfileAuth: refreshCurrentYiruProfileAuthMock,
  selectCurrentYiruProfileOrg: selectCurrentYiruProfileOrgMock,
  signOutCurrentYiruProfile: signOutCurrentYiruProfileMock
}))

import { registerYiruProfileHandlers } from './yiru-profiles'

describe('registerYiruProfileHandlers auth channels', () => {
  beforeEach(() => {
    handlers.clear()
    createCloudLinkedYiruProfileMock.mockReset()
    connectCurrentYiruProfileMock.mockReset()
    getCurrentYiruProfileAuthStatusMock.mockReset()
    refreshCurrentYiruProfileAuthMock.mockReset()
    selectCurrentYiruProfileOrgMock.mockReset()
    signOutCurrentYiruProfileMock.mockReset()
  })

  it('returns auth status for the current profile', async () => {
    const status = {
      activeProfileId: 'local-default',
      configured: false,
      state: 'unconfigured',
      persistence: 'none'
    }
    getCurrentYiruProfileAuthStatusMock.mockReturnValue(status)
    registerYiruProfileHandlers({
      flush: vi.fn(),
      freezeWrites: vi.fn(),
      getSettings: () => ({})
    } as never)

    await expect(Promise.resolve(handlers.get('yiruProfiles:authStatus')?.(null))).resolves.toBe(
      status
    )
    expect(getCurrentYiruProfileAuthStatusMock).toHaveBeenCalledWith('/tmp/yiru-user-data')
  })

  it('connects and signs out the current profile through the cloud service', async () => {
    const connectResult = { status: 'unconfigured', auth: { activeProfileId: 'local-default' } }
    const signOutResult = { status: 'signed-out', auth: { activeProfileId: 'local-default' } }
    connectCurrentYiruProfileMock.mockResolvedValue(connectResult)
    signOutCurrentYiruProfileMock.mockResolvedValue(signOutResult)
    registerYiruProfileHandlers({
      flush: vi.fn(),
      freezeWrites: vi.fn(),
      getSettings: () => ({})
    } as never)

    await expect(
      Promise.resolve(handlers.get('yiruProfiles:connectCurrent')?.(null))
    ).resolves.toBe(connectResult)
    await expect(
      Promise.resolve(handlers.get('yiruProfiles:signOutCurrent')?.(null))
    ).resolves.toBe(signOutResult)
    expect(connectCurrentYiruProfileMock).toHaveBeenCalledWith('/tmp/yiru-user-data')
    expect(signOutCurrentYiruProfileMock).toHaveBeenCalledWith('/tmp/yiru-user-data')
  })

  it('refreshes profile auth through the cloud service', async () => {
    const refreshResult = { status: 'refreshed', auth: { activeProfileId: 'local-default' } }
    refreshCurrentYiruProfileAuthMock.mockResolvedValue(refreshResult)
    registerYiruProfileHandlers({
      flush: vi.fn(),
      freezeWrites: vi.fn(),
      getSettings: () => ({})
    } as never)

    await expect(Promise.resolve(handlers.get('yiruProfiles:refreshAuth')?.(null))).resolves.toBe(
      refreshResult
    )
    expect(refreshCurrentYiruProfileAuthMock).toHaveBeenCalledWith('/tmp/yiru-user-data')
  })

  it('validates organization selection before calling the cloud service', async () => {
    const selectResult = { status: 'selected', auth: { activeProfileId: 'local-default' } }
    selectCurrentYiruProfileOrgMock.mockResolvedValue(selectResult)
    registerYiruProfileHandlers({
      flush: vi.fn(),
      freezeWrites: vi.fn(),
      getSettings: () => ({})
    } as never)

    await expect(
      Promise.resolve(handlers.get('yiruProfiles:selectOrg')?.(null, { orgId: ' org-1 ' }))
    ).resolves.toBe(selectResult)
    expect(selectCurrentYiruProfileOrgMock).toHaveBeenCalledWith('/tmp/yiru-user-data', 'org-1')

    await expect(
      Promise.resolve(handlers.get('yiruProfiles:selectOrg')?.(null, { orgId: ' ' }))
    ).rejects.toThrow('invalid_yiru_profile_org_selection')
  })

  it('creates cloud-linked profiles with trimmed optional args', async () => {
    const createResult = {
      status: 'created',
      auth: { activeProfileId: 'local-default' },
      activeProfileId: 'local-default',
      profiles: [],
      profile: { id: 'cloud-1' }
    }
    createCloudLinkedYiruProfileMock.mockResolvedValue(createResult)
    registerYiruProfileHandlers({
      flush: vi.fn(),
      freezeWrites: vi.fn(),
      getSettings: () => ({})
    } as never)

    await expect(
      Promise.resolve(
        handlers.get('yiruProfiles:createCloudLinked')?.(null, { orgId: ' org-1 ', name: ' Acme ' })
      )
    ).resolves.toBe(createResult)
    expect(createCloudLinkedYiruProfileMock).toHaveBeenCalledWith('/tmp/yiru-user-data', {
      orgId: 'org-1',
      name: 'Acme'
    })
  })
})
