import { describe, expect, it } from 'vite-plus/test'

import { getDefaultPersistedState } from '../../shared/constants'
import { decodePersistedState } from './persisted-state-codec'

describe('decodePersistedState', () => {
  it('migrates inherited legacy defaults while preserving explicit opt-outs', () => {
    const legacy = getDefaultPersistedState('/Users/tester')
    legacy.settings.systemTypographyDefaultsMigrated = false
    legacy.settings.appFontFamily = 'Geist'
    legacy.settings.terminalFontSize = 14
    legacy.settings.terminalMacOptionAsAltMigrated = false
    legacy.settings.terminalMacOptionAsAlt = 'true'
    legacy.settings.terminalRightClickToPasteDefaultedForPlatform = false
    legacy.settings.terminalRightClickToPaste = false

    const decoded = decodePersistedState(legacy, {
      homeDir: '/Users/tester',
      platform: 'darwin',
      fileExistedOnLoad: true,
      createInstallId: () => 'install-id'
    })

    expect(decoded.needsSave).toBe(true)
    expect(decoded.state.settings).toMatchObject({
      appFontFamily: 'system-ui',
      terminalFontSize: 13,
      systemTypographyDefaultsMigrated: true,
      terminalMacOptionAsAlt: 'auto',
      terminalMacOptionAsAltMigrated: true,
      terminalRightClickToPaste: false,
      terminalRightClickToPasteDefaultedForPlatform: true
    })
  })

  it('applies one-shot UI migrations from the raw persisted values', () => {
    const legacy = getDefaultPersistedState('/home/tester')
    legacy.ui.sortBy = 'recent'
    legacy.ui._sortBySmartMigrated = false
    legacy.ui.rightSidebarOpen = undefined as unknown as boolean
    legacy.settings.rightSidebarOpenByDefault = false

    const decoded = decodePersistedState(legacy, {
      homeDir: '/home/tester',
      platform: 'linux',
      fileExistedOnLoad: true,
      createInstallId: () => 'install-id'
    })

    expect(decoded.needsSave).toBe(true)
    expect(decoded.state.ui.sortBy).toBe('smart')
    expect(decoded.state.ui._sortBySmartMigrated).toBe(true)
    expect(decoded.state.ui.rightSidebarOpen).toBe(false)
  })

  it('isolates corrupt workspace sessions instead of discarding healthy host partitions', () => {
    const legacy = getDefaultPersistedState('/home/tester')
    const healthySession = {
      ...legacy.workspaceSession,
      activeRepoId: 'repo-one'
    }
    legacy.workspaceSession = { activeRepoId: 42 } as never
    legacy.workspaceSessionsByHostId = {
      'runtime:healthy': healthySession,
      'ssh:corrupt': { activeRepoId: 42 } as never,
      local: healthySession
    }

    const decoded = decodePersistedState(legacy, {
      homeDir: '/home/tester',
      platform: 'linux',
      fileExistedOnLoad: true,
      createInstallId: () => 'install-id'
    })

    expect(decoded.state.workspaceSession.activeRepoId).toBe(null)
    expect(decoded.state.workspaceSessionsByHostId).toEqual({
      'runtime:healthy': healthySession
    })
  })

  it('completes partial telemetry state without overwriting explicit consent', () => {
    const legacy = getDefaultPersistedState('/home/tester')
    legacy.settings.telemetry = {
      optedIn: false,
      installId: '',
      existedBeforeTelemetryRelease: undefined
    } as never

    const decoded = decodePersistedState(legacy, {
      homeDir: '/home/tester',
      platform: 'linux',
      fileExistedOnLoad: true,
      createInstallId: () => 'stable-install-id'
    })

    expect(decoded.state.settings.telemetry).toEqual({
      optedIn: false,
      installId: 'stable-install-id',
      existedBeforeTelemetryRelease: true
    })
  })

  it('initializes a new profile without classifying it as an upgraded user', () => {
    const decoded = decodePersistedState(undefined, {
      homeDir: '/home/tester',
      platform: 'linux',
      fileExistedOnLoad: false,
      createInstallId: () => 'new-install-id',
      now: () => 123
    })

    expect(decoded.state.onboarding).toMatchObject({
      closedAt: null,
      outcome: null
    })
    expect(decoded.state.settings.telemetry).toEqual({
      optedIn: true,
      installId: 'new-install-id',
      existedBeforeTelemetryRelease: false
    })
    expect(decoded.warnings).toEqual([])
  })

  it('migrates terminal, agent, and renamed settings while dropping retired payloads', () => {
    const legacy = getDefaultPersistedState('/home/tester')
    const legacySettings = legacy.settings as typeof legacy.settings & {
      terminalScrollbackBytes?: number
      experimentalSidekick?: boolean
      compactWorktreeCards?: boolean
    }
    Reflect.deleteProperty(legacySettings, 'terminalScrollbackRows')
    legacySettings.terminalScrollbackBytes = 50_000_000
    legacySettings.terminalTuiScrollSensitivity = 3
    legacySettings.terminalTuiScrollSensitivityDefaultedToOne = false
    legacySettings.agentDefaultArgs = {
      ...legacySettings.agentDefaultArgs,
      opencode: '--dangerously-skip-permissions --model test'
    }
    legacySettings.experimentalPet = undefined as never
    legacySettings.experimentalSidekick = true
    legacySettings.compactWorktreeCards = true

    const decoded = decodePersistedState(legacy, {
      homeDir: '/home/tester',
      platform: 'linux',
      fileExistedOnLoad: true,
      createInstallId: () => 'install-id'
    })

    expect(decoded.state.settings).toMatchObject({
      terminalScrollbackRows: 25_000,
      terminalTuiScrollSensitivity: 1,
      terminalTuiScrollSensitivityDefaultedToOne: true,
      experimentalPet: true,
      agentDefaultArgs: { opencode: '--model test' }
    })
    expect(decoded.state.settings).not.toHaveProperty('terminalScrollbackBytes')
    expect(decoded.state.settings).not.toHaveProperty('compactWorktreeCards')
  })

  it('migrates existing-profile onboarding and worktree-card defaults once', () => {
    const legacy = getDefaultPersistedState('/home/tester')
    legacy.onboarding = undefined as never
    legacy.ui.worktreeCardProperties = ['branch']
    legacy.ui._inlineAgentsDefaultedForAllUsers = false
    legacy.ui._expandedWorktreeCardPropertiesDefaulted = false
    legacy.schemaVersion = 99

    const decoded = decodePersistedState(legacy, {
      homeDir: '/home/tester',
      platform: 'linux',
      fileExistedOnLoad: true,
      createInstallId: () => 'install-id',
      now: () => 456
    })

    expect(decoded.state.onboarding).toMatchObject({
      closedAt: 456,
      outcome: 'completed'
    })
    expect(decoded.state.ui.worktreeCardProperties).toEqual(
      expect.arrayContaining(['branch', 'inline-agents', 'ports'])
    )
    // Why: forward schema values were historically preserved rather than
    // rejected; explicit versioning must keep that downgrade-safe behavior.
    expect(decoded.state.schemaVersion).toBe(99)
  })

  it('normalizes legacy SSH state and bounded terminal-session collections', () => {
    const legacy = getDefaultPersistedState('/home/tester')
    legacy.sshTargets = [
      {
        id: 'target-one',
        label: 'prod-alias',
        host: 'prod.example.com',
        remoteWorkspaceSyncEnabled: true,
        remoteWorkspaceSyncGracePeriodSeconds: 0,
        relayGracePeriodSeconds: 10_800,
        systemSshConnectionReuse: false
      } as never
    ]
    legacy.deletedSshConfigAliases = ['old-alias', 42 as never]
    legacy.sshRemotePtyLeases = [
      { targetId: 'target-one', ptyId: 'pty-one', state: 'detached' } as never,
      { targetId: 42, ptyId: 'invalid' } as never
    ]
    legacy.claudeLivePtySessionIds = ['pty-a', '', 'pty-b', 'pty-a']

    const decoded = decodePersistedState(legacy, {
      homeDir: '/home/tester',
      platform: 'linux',
      fileExistedOnLoad: true,
      createInstallId: () => 'install-id',
      now: () => 789
    })

    expect(decoded.state.sshTargets[0]).toMatchObject({
      configHost: 'prod-alias',
      relayGracePeriodSeconds: 0,
      systemSshConnectionReuse: false
    })
    expect(decoded.state.sshTargets[0]).not.toHaveProperty('remoteWorkspaceSyncEnabled')
    expect(decoded.state.deletedSshConfigAliases).toEqual(['old-alias'])
    expect(decoded.state.sshRemotePtyLeases).toEqual([
      {
        targetId: 'target-one',
        ptyId: 'pty-one',
        state: 'detached',
        createdAt: 789,
        updatedAt: 789
      }
    ])
    expect(decoded.state.claudeLivePtySessionIds).toEqual(['pty-b', 'pty-a'])
  })
})
