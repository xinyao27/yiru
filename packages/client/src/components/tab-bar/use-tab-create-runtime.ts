import {
  type BuiltInWindowsTerminalShell,
  WINDOWS_GIT_BASH_SHELL
} from '@yiru/workbench-model/platform'
import { useMemo } from 'react'
import { type AgentDetectionTarget, useDetectedAgents } from '~renderer/hooks/use-detected-agents'
import { translate } from '~renderer/i18n/i18n'
import { getConnectionIdFromState } from '~renderer/lib/connection-context'
import { getLocalProjectExecutionRuntimeContext } from '~renderer/lib/local-preflight-context'
import {
  getWindowsTerminalCapabilityOwnerKey,
  useWindowsTerminalCapabilities
} from '~renderer/lib/windows-terminal-capabilities'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/lib/worktree-runtime-owner'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store'
import type { ProjectExecutionRuntimeResolution } from '~shared/project-execution-runtime'
import type { Tab, TuiAgent } from '~shared/types'

import { shouldShowMobileEmulatorTabIntro } from '../emulator-pane/mobile-emulator-tab-intro-visibility'
import { buildTabAgentLaunchOptions, orderTabLaunchAgents } from './tab-agent-launch-options'
import type { TabBarProps } from './tab-bar-types'
import { shouldShowWindowsShellMenu } from './windows-shell-menu-visibility'

const EMPTY_AGENT_CMD_OVERRIDES: Partial<Record<TuiAgent, string>> = {}
const EMPTY_UNIFIED_TABS: readonly Tab[] = []
const AGENT_DETECTION_LOCAL_TARGET_KEY = 'local'
const isWindows = navigator.userAgent.includes('Windows')
const isMacOs = navigator.userAgent.includes('Mac')

export type WindowsShellEntry = {
  label: string
  shell: BuiltInWindowsTerminalShell
}

function getProjectRuntimeShellMenuMode(
  projectRuntime: ProjectExecutionRuntimeResolution | undefined
): 'host' | 'wsl' | null {
  if (!projectRuntime) {
    return null
  }
  if (projectRuntime.status === 'repair-required') {
    return 'wsl'
  }
  return projectRuntime.runtime.kind === 'wsl' ? 'wsl' : 'host'
}

export function useTabCreateRuntime(props: TabBarProps) {
  const { groupId, onNewTerminalWithShell, worktreeId } = props
  const mobileEmulatorEnabled = useAppStore(
    (state) => state.settings?.mobileEmulatorEnabled !== false
  )
  const persistedUIReady = useAppStore((state) => state.persistedUIReady)
  const introDismissed = useAppStore((state) => state.mobileEmulatorTabIntroDismissed)
  const defaultWindowsShell = useAppStore(
    (state) => state.settings?.terminalWindowsShell ?? 'powershell.exe'
  )
  const defaultPowerShellImplementation = useAppStore(
    (state) => state.settings?.terminalWindowsPowerShellImplementation ?? 'auto'
  )
  const activeRepoId = useAppStore((state) => state.activeRepoId)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const projects = useAppStore((state) => state.projects)
  const repos = useAppStore((state) => state.repos)
  const settings = useAppStore((state) => state.settings)
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const activeGroupId = useAppStore((state) => state.activeGroupIdByWorktree[worktreeId])
  const unifiedTabs = useAppStore(
    (state) => state.unifiedTabsByWorktree[worktreeId] ?? EMPTY_UNIFIED_TABS
  )
  const activeRuntimeEnvironmentId = useAppStore(
    (state) => getRuntimeEnvironmentIdForWorktree(state, worktreeId)?.trim() || null
  )
  const connectionId = useAppStore(
    (state) => getConnectionIdFromState(state, worktreeId)?.trim() || null
  )
  const remotePlatform = useAppStore((state) =>
    connectionId ? (state.sshConnectionStates.get(connectionId)?.remotePlatform ?? null) : null
  )
  const defaultAgent = useAppStore((state) => state.settings?.defaultTuiAgent)
  const agentCmdOverrides = useAppStore(
    (state) => state.settings?.agentCmdOverrides ?? EMPTY_AGENT_CMD_OVERRIDES
  )
  const detectionTargetKey = useAppStore((state): string | undefined => {
    const selectedConnectionId = getConnectionIdFromState(state, worktreeId)
    if (selectedConnectionId === undefined) {
      return undefined
    }
    if (selectedConnectionId?.trim()) {
      return `ssh:${selectedConnectionId.trim()}`
    }
    const environmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)?.trim()
    return environmentId ? `runtime:${environmentId}` : AGENT_DETECTION_LOCAL_TARGET_KEY
  })
  const detectionTarget = useMemo<AgentDetectionTarget | undefined>(() => {
    if (detectionTargetKey === undefined) {
      return undefined
    }
    if (detectionTargetKey.startsWith('ssh:')) {
      return { kind: 'ssh', connectionId: detectionTargetKey.slice(4) }
    }
    if (detectionTargetKey.startsWith('runtime:')) {
      return { kind: 'runtime', environmentId: detectionTargetKey.slice(8) }
    }
    return { kind: 'local' }
  }, [detectionTargetKey])
  const { detectedIds } = useDetectedAgents(detectionTarget)
  const agentLaunchOptions = useMemo(
    () =>
      buildTabAgentLaunchOptions(
        orderTabLaunchAgents(defaultAgent, detectedIds ?? []),
        agentCmdOverrides
      ),
    [agentCmdOverrides, defaultAgent, detectedIds]
  )
  const capabilityOwnerKey = getWindowsTerminalCapabilityOwnerKey(
    activeRuntimeEnvironmentId,
    connectionId
  )
  const runtimeTarget = useMemo(
    () => getActiveRuntimeTarget({ activeRuntimeEnvironmentId }),
    [activeRuntimeEnvironmentId]
  )
  const isWebClient = (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ === true
  const capabilities = useWindowsTerminalCapabilities(
    isWindows || Boolean(activeRuntimeEnvironmentId) || isWebClient || Boolean(connectionId),
    false,
    capabilityOwnerKey,
    runtimeTarget,
    connectionId
  )
  const hostPlatform = connectionId
    ? (remotePlatform ?? capabilities.hostPlatform)
    : capabilities.hostPlatform
  const showWindowsShellMenu = shouldShowWindowsShellMenu({
    activeRuntimeEnvironmentId,
    hostPlatform,
    isWindowsClient: isWindows,
    worktreeHasRemoteConnection: Boolean(connectionId)
  })
  const projectRuntime = useMemo(() => {
    if (!showWindowsShellMenu || activeRuntimeEnvironmentId || connectionId) {
      return undefined
    }
    return getLocalProjectExecutionRuntimeContext(
      { activeRepoId, activeWorktreeId, projects, repos, settings, worktreesByRepo },
      worktreeId,
      'win32',
      {
        wslAvailable: capabilities.isLoading ? undefined : capabilities.wslAvailable,
        availableWslDistros: capabilities.isLoading ? null : capabilities.wslDistros
      }
    )
  }, [
    activeRepoId,
    activeRuntimeEnvironmentId,
    activeWorktreeId,
    capabilities.isLoading,
    capabilities.wslAvailable,
    capabilities.wslDistros,
    connectionId,
    projects,
    repos,
    settings,
    showWindowsShellMenu,
    worktreeId,
    worktreesByRepo
  ])
  const shellMode = getProjectRuntimeShellMenuMode(projectRuntime)
  const windowsShellEntries = useMemo(() => {
    if (!showWindowsShellMenu || !onNewTerminalWithShell) {
      return undefined
    }
    const entries: WindowsShellEntry[] = []
    if (shellMode !== 'wsl') {
      entries.push(
        {
          label: translate('auto.components.tab.bar.TabBar.2148f65e04', 'PowerShell'),
          shell: 'powershell.exe'
        },
        {
          label: translate('auto.components.tab.bar.TabBar.1a8af49530', 'CMD Prompt'),
          shell: 'cmd.exe'
        }
      )
      if (capabilities.gitBashAvailable) {
        entries.push({
          label: translate('auto.components.tab.bar.TabBar.efb33546ff', 'Git Bash'),
          shell: WINDOWS_GIT_BASH_SHELL
        })
      }
    }
    if (shellMode !== 'host' && capabilities.wslAvailable) {
      entries.push({
        label: translate('auto.components.tab.bar.TabBar.d1afac112b', 'WSL'),
        shell: 'wsl.exe'
      })
    }
    if (entries.length === 0) {
      return undefined
    }
    const defaultEntry = entries.find((entry) => entry.shell === defaultWindowsShell) ?? entries[0]
    return [defaultEntry, ...entries.filter((entry) => entry.shell !== defaultEntry.shell)]
  }, [
    capabilities.gitBashAvailable,
    capabilities.wslAvailable,
    defaultWindowsShell,
    onNewTerminalWithShell,
    shellMode,
    showWindowsShellMenu
  ])

  return {
    agentLaunchOptions,
    defaultPowerShellImplementation,
    mobileEmulatorEnabled,
    pwshAvailable: capabilities.pwshAvailable,
    resolvedGroupId: groupId ?? activeGroupId ?? worktreeId,
    showMobileEmulatorIntroCallout: shouldShowMobileEmulatorTabIntro({
      persistedUIReady,
      mobileEmulatorTabIntroDismissed: introDismissed,
      mobileEmulatorEnabled,
      isMacOs
    }),
    windowsShellEntries,
    workspaceHasSimulatorTab: unifiedTabs.some((tab) => tab.contentType === 'simulator')
  }
}
