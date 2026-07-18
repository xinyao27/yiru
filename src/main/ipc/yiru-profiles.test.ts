import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const {
  handlers,
  appExitMock,
  appQuitMock,
  appRelaunchMock,
  destroySystemTrayMock,
  createLocalYiruProfileMock,
  getYiruProfileListStateMock,
  seedNewYiruProfileTelemetryConsentMock,
  setActiveYiruProfileMock,
  transferYiruProfileProjectMock
} = vi.hoisted(() => ({
  handlers: new Map<string, (_event: unknown, args?: unknown) => unknown>(),
  appExitMock: vi.fn(),
  appQuitMock: vi.fn(),
  appRelaunchMock: vi.fn(),
  destroySystemTrayMock: vi.fn(),
  createLocalYiruProfileMock: vi.fn(),
  getYiruProfileListStateMock: vi.fn(),
  seedNewYiruProfileTelemetryConsentMock: vi.fn(),
  setActiveYiruProfileMock: vi.fn(),
  transferYiruProfileProjectMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    exit: appExitMock,
    quit: appQuitMock,
    relaunch: appRelaunchMock,
    getPath: () => '/tmp/yiru-user-data'
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    })
  }
}))

vi.mock('../tray/system-tray', () => ({
  destroySystemTray: destroySystemTrayMock
}))

vi.mock('../yiru-profiles/profile-index-store', () => ({
  createLocalYiruProfile: createLocalYiruProfileMock,
  getYiruProfileListState: getYiruProfileListStateMock,
  seedNewYiruProfileTelemetryConsent: seedNewYiruProfileTelemetryConsentMock,
  setActiveYiruProfile: setActiveYiruProfileMock
}))

function makeStoreMock(flush = vi.fn()): {
  flush: typeof flush
  freezeWrites: ReturnType<typeof vi.fn>
  getSettings: () => Record<string, never>
} {
  return { flush, freezeWrites: vi.fn(), getSettings: () => ({}) }
}

vi.mock('../yiru-profiles/profile-project-transfer', () => ({
  transferYiruProfileProject: transferYiruProfileProjectMock
}))

import { registerYiruProfileHandlers } from './yiru-profiles'

describe('registerYiruProfileHandlers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    handlers.clear()
    appExitMock.mockReset()
    appQuitMock.mockReset()
    appRelaunchMock.mockReset()
    destroySystemTrayMock.mockReset()
    createLocalYiruProfileMock.mockReset()
    getYiruProfileListStateMock.mockReset()
    seedNewYiruProfileTelemetryConsentMock.mockReset()
    setActiveYiruProfileMock.mockReset()
    transferYiruProfileProjectMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers list and create handlers', async () => {
    const listState = {
      activeProfileId: 'local-default',
      profiles: [{ id: 'local-default', name: 'Personal' }]
    }
    const createState = {
      ...listState,
      profile: { id: 'local-work', name: 'Work' }
    }
    getYiruProfileListStateMock.mockReturnValue(listState)
    createLocalYiruProfileMock.mockReturnValue(createState)

    registerYiruProfileHandlers(makeStoreMock() as never)

    await expect(Promise.resolve(handlers.get('yiruProfiles:list')?.(null))).resolves.toEqual({
      ...listState,
      multiProfileUi: false
    })
    await expect(
      Promise.resolve(handlers.get('yiruProfiles:createLocal')?.(null, { name: 'Work' }))
    ).resolves.toBe(createState)
    expect(createLocalYiruProfileMock).toHaveBeenCalledWith({ name: 'Work' })
  })

  it('reports multiProfileUi when the env flag is set', async () => {
    const previous = process.env.YIRU_MULTI_PROFILE_UI
    process.env.YIRU_MULTI_PROFILE_UI = '1'
    try {
      getYiruProfileListStateMock.mockReturnValue({
        activeProfileId: 'local-default',
        profiles: []
      })
      registerYiruProfileHandlers(makeStoreMock() as never)

      await expect(Promise.resolve(handlers.get('yiruProfiles:list')?.(null))).resolves.toEqual({
        activeProfileId: 'local-default',
        profiles: [],
        multiProfileUi: true
      })
    } finally {
      if (previous === undefined) {
        delete process.env.YIRU_MULTI_PROFILE_UI
      } else {
        process.env.YIRU_MULTI_PROFILE_UI = previous
      }
    }
  })

  it('marks the target profile active, flushes, and relaunches', async () => {
    const flush = vi.fn()
    const onBeforeRelaunch = vi.fn()
    getYiruProfileListStateMock.mockReturnValue({
      activeProfileId: 'local-default',
      profiles: []
    })
    setActiveYiruProfileMock.mockReturnValue({
      activeProfileId: 'local-work',
      profiles: []
    })
    registerYiruProfileHandlers(makeStoreMock(flush) as never, { onBeforeRelaunch })

    const resultPromise = Promise.resolve(
      handlers.get('yiruProfiles:switch')?.(null, { profileId: 'local-work' })
    )

    await expect(resultPromise).resolves.toEqual({ status: 'relaunching' })
    expect(setActiveYiruProfileMock).toHaveBeenCalledWith('local-work')
    expect(flush).toHaveBeenCalledOnce()
    expect(onBeforeRelaunch).toHaveBeenCalledOnce()
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(
      setActiveYiruProfileMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    )
    expect(appRelaunchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(150)

    expect(appRelaunchMock).toHaveBeenCalledOnce()
    // Why quit, not exit: before-quit/will-quit teardown (scrollback capture,
    // PTY kill, daemon checkpoints) must run on a profile switch.
    expect(appQuitMock).toHaveBeenCalledOnce()
    expect(appExitMock).not.toHaveBeenCalled()
  })

  it('does not mark a profile active when current profile flush fails', async () => {
    const flush = vi.fn(() => {
      throw new Error('flush_failed')
    })
    getYiruProfileListStateMock.mockReturnValue({
      activeProfileId: 'local-default',
      profiles: []
    })
    registerYiruProfileHandlers(makeStoreMock(flush) as never)

    await expect(
      Promise.resolve(handlers.get('yiruProfiles:switch')?.(null, { profileId: 'local-work' }))
    ).rejects.toThrow('flush_failed')

    expect(setActiveYiruProfileMock).not.toHaveBeenCalled()
    expect(appRelaunchMock).not.toHaveBeenCalled()
  })

  it('does not relaunch when switching to the active profile', async () => {
    getYiruProfileListStateMock.mockReturnValue({
      activeProfileId: 'local-default',
      profiles: []
    })
    registerYiruProfileHandlers(makeStoreMock() as never)

    await expect(
      Promise.resolve(handlers.get('yiruProfiles:switch')?.(null, { profileId: 'local-default' }))
    ).resolves.toEqual({ status: 'already-active' })

    expect(setActiveYiruProfileMock).not.toHaveBeenCalled()
    expect(appRelaunchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid profile ids', async () => {
    registerYiruProfileHandlers(makeStoreMock() as never)

    await expect(
      Promise.resolve(handlers.get('yiruProfiles:switch')?.(null, { profileId: ' ' }))
    ).rejects.toThrow('invalid_yiru_profile_id')
  })

  it('transfers projects between inactive profiles after flushing active state', async () => {
    const flush = vi.fn()
    const result = {
      status: 'transferred',
      mode: 'copy',
      sourceProfileId: 'personal',
      targetProfileId: 'work',
      sourceRepoId: 'repo-1',
      targetRepoId: 'repo-2',
      targetProjectId: 'repo:repo-2'
    }
    getYiruProfileListStateMock.mockReturnValue({
      activeProfileId: 'personal',
      profiles: []
    })
    transferYiruProfileProjectMock.mockReturnValue(result)
    registerYiruProfileHandlers(makeStoreMock(flush) as never)

    await expect(
      Promise.resolve(
        handlers.get('yiruProfiles:transferProject')?.(null, {
          sourceProfileId: ' personal ',
          targetProfileId: ' work ',
          repoId: ' repo-1 ',
          mode: 'copy'
        })
      )
    ).resolves.toBe(result)

    expect(flush).toHaveBeenCalledOnce()
    expect(transferYiruProfileProjectMock).toHaveBeenCalledWith(
      {
        sourceProfileId: 'personal',
        targetProfileId: 'work',
        repoId: 'repo-1',
        mode: 'copy'
      },
      '/tmp/yiru-user-data'
    )
  })

  it('moves a project out of the active profile and relaunches into the target profile', async () => {
    const flush = vi.fn()
    const onBeforeRelaunch = vi.fn()
    const result = {
      status: 'transferred',
      mode: 'move',
      sourceProfileId: 'personal',
      targetProfileId: 'work',
      sourceRepoId: 'repo-1',
      targetRepoId: 'repo-1',
      targetProjectId: 'repo:repo-1'
    }
    getYiruProfileListStateMock.mockReturnValue({
      activeProfileId: 'personal',
      profiles: []
    })
    transferYiruProfileProjectMock.mockReturnValue(result)
    registerYiruProfileHandlers(makeStoreMock(flush) as never, { onBeforeRelaunch })

    await expect(
      Promise.resolve(
        handlers.get('yiruProfiles:transferProject')?.(null, {
          sourceProfileId: 'personal',
          targetProfileId: 'work',
          repoId: 'repo-1',
          mode: 'move'
        })
      )
    ).resolves.toEqual({ ...result, willRelaunch: true })

    expect(onBeforeRelaunch).toHaveBeenCalledOnce()
    expect(flush).toHaveBeenCalledOnce()
    expect(transferYiruProfileProjectMock).toHaveBeenCalledWith(
      {
        sourceProfileId: 'personal',
        targetProfileId: 'work',
        repoId: 'repo-1',
        mode: 'move'
      },
      '/tmp/yiru-user-data'
    )
    expect(setActiveYiruProfileMock).toHaveBeenCalledWith('work')
    expect(appRelaunchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(150)

    expect(appRelaunchMock).toHaveBeenCalledOnce()
    expect(appQuitMock).toHaveBeenCalledOnce()
    expect(appExitMock).not.toHaveBeenCalled()
  })

  it('rejects transfers that would mutate the active target profile offline', async () => {
    getYiruProfileListStateMock.mockReturnValue({
      activeProfileId: 'work',
      profiles: []
    })
    registerYiruProfileHandlers(makeStoreMock() as never)

    await expect(
      Promise.resolve(
        handlers.get('yiruProfiles:transferProject')?.(null, {
          sourceProfileId: 'personal',
          targetProfileId: 'work',
          repoId: 'repo-1',
          mode: 'copy'
        })
      )
    ).rejects.toThrow('active_target_yiru_profile_transfer_requires_relaunch')

    expect(transferYiruProfileProjectMock).not.toHaveBeenCalled()
  })
})
