import { BrowserWindow, app, powerMonitor } from 'electron'
import { resolveEnvironment } from '~shared/runtime-environment-store'
import { getPreferredPairingOffer } from '~shared/runtime-environments'
import type { RuntimeDesktopWindowStatus } from '~shared/runtime-types'

import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import { agentHookServer } from '../agent-hooks/server'
import { AgentBrowserBridge } from '../browser/agent-browser-bridge'
import { electronRuntimeBrowserShellAdapter } from '../browser/electron-runtime-adapter'
import { browserManager } from '../browser/manager'
import type { CodexAccountSelectionTarget } from '../codex/accounts/runtime-selection'
import { EmulatorBridge } from '../emulator/bridge'
import { previewGhosttyImport } from '../ghostty/import-preview'
import type { Store } from '../persistence'
import { setRepoChangeEventPublisher } from '../project-groups/repo-events'
import { clearProviderPtyState, getLocalPtyProvider } from '../pty/pty'
import { RateLimitResumeService } from '../rate-limit-resume/service'
import { setAgentStatusEventPublisher } from '../runtime/agent-status-events'
import { callRuntimeEnvironment } from '../runtime/environment-transport-routing'
import { setGitHubEventPublisher } from '../runtime/github-events'
import { setHostProgressEventPublisher } from '../runtime/host-progress-events'
import {
  fingerprintOrchestrationPeer,
  type OrchestrationEnvironmentTransport
} from '../runtime/orchestration/environment-transport'
import { setSettingsEventPublisher } from '../runtime/settings-events'
import { setSkillUpdateRunEventPublisher } from '../runtime/skill-update-run-events'
import { terminalMultiplexDisabledCapabilities } from '../runtime/terminal-multiplex/release-gate'
import { setUIEventPublisher } from '../runtime/ui-events'
import { setWorkspacePortEventPublisher } from '../runtime/workspace-port-events'
import { YiruRuntimeService } from '../runtime/yiru-runtime'
import { RuntimeBrowserCommands } from '../runtime/yiru-runtime-browser'
import { StarNagService } from '../star-nag/service'
import { fetchCursorUsageForStats } from '../stats/cursor-usage'
import { getUsageScopePaths } from '../stats/usage-scope'
import { previewWarpThemeImport } from '../warp-themes/electron-import-preview'
import { setWorktreeChangeEventPublisher } from '../worktree/change-events'
import { setWorktreeHeadIdentityEventPublisher } from '../worktree/head-identity-events'
import type { AccountServices } from './account-services'

export type RuntimeServices = {
  runtime: YiruRuntimeService
  rateLimitResumes: RateLimitResumeService
  starNag: StarNagService
}

export function initializeRuntimeServices(options: {
  store: Store
  accounts: AccountServices
  isServeMode: boolean
  getDesktopWindowStatus: () => RuntimeDesktopWindowStatus
  prepareForCodexLaunch: (
    target?: CodexAccountSelectionTarget,
    launchEnv?: NodeJS.ProcessEnv
  ) => string | null
}): RuntimeServices {
  const { accounts, store } = options
  const orchestrationEnvironmentTransport: OrchestrationEnvironmentTransport = {
    resolve: (selector) => {
      const environment = resolveEnvironment(app.getPath('userData'), selector)
      const pairing = getPreferredPairingOffer(environment)
      return {
        environmentId: environment.id,
        name: environment.name,
        peerFingerprint: fingerprintOrchestrationPeer(pairing.publicKeyB64)
      }
    },
    call: (selector, contract, params, timeoutMs, envelope) =>
      callRuntimeEnvironment(app.getPath('userData'), selector, contract, params, timeoutMs, {
        envelope
      })
  }
  const runtime = new YiruRuntimeService(store, accounts.stats, {
    getLocalProvider: () => getLocalPtyProvider(),
    onPtyStopped: clearProviderPtyState,
    onTerminalAgentStatus: (event) => agentHookServer.ingestTerminalStatus(event),
    getDesktopWindowStatus: options.getDesktopWindowStatus,
    getWindowById: (windowId) => BrowserWindow.fromId(windowId),
    getHostProcessMetrics: () => app.getAppMetrics(),
    createBrowserCommands: (host) =>
      new RuntimeBrowserCommands(host, electronRuntimeBrowserShellAdapter),
    disabledCapabilities: terminalMultiplexDisabledCapabilities(),
    getAgentStatusSnapshot: () =>
      agentHookServer.getStatusSnapshot().filter((entry) => entry.providerSessionOnly !== true),
    getAdditionalAiVaultCodexHomePaths: () =>
      accounts.codexRuntimeHome.getHostCodexHomePathsForSessionDiscovery(),
    resolveAiVaultClaudeProjectsDirs: (target) =>
      accounts.claudeRuntimeAuth.resolveSessionProjectRoots(target),
    buildAgentHookPtyEnv: () =>
      isAgentStatusHooksEnabled(store.getSettings()) ? agentHookServer.buildPtyEnv() : {},
    previewGhosttyImportForClient: () => previewGhosttyImport(store),
    previewWarpThemeImportForClient: (source) => previewWarpThemeImport(store, source),
    orchestrationEnvironmentTransport,
    providerUsageStores: {
      claude: accounts.claudeUsage,
      codex: accounts.codexUsage,
      openCode: accounts.openCodeUsage,
      getUsageScopePaths: () => getUsageScopePaths(store),
      getCursorUsage: fetchCursorUsageForStats
    }
  })

  browserManager.setBrowserGuestStateChangedListener((worktreeId) => {
    runtime.notifyMobileSessionTabsChanged(worktreeId)
  })
  browserManager.setGuestEventPublisher((event) => runtime.emitBrowserGuestEvent(event))
  setHostProgressEventPublisher((event) => runtime.emitHostProgressEvent(event))
  setGitHubEventPublisher((event) => runtime.emitGitHubEvent(event))
  setSettingsEventPublisher((event) => runtime.emitSettingsChangedEvent(event))
  setUIEventPublisher((event) => runtime.emitUIChangedEvent(event))
  setAgentStatusEventPublisher((event) => runtime.emitAgentStatusEvent(event))
  setSkillUpdateRunEventPublisher((event) => runtime.emitSkillUpdateRunEvent(event))
  setWorkspacePortEventPublisher((event) =>
    runtime.emitWorkspacePortAdvertisedUrlChangedEvent(event)
  )
  setWorktreeHeadIdentityEventPublisher((repoId, identities) =>
    runtime.notifyWorktreeHeadIdentitiesChangedForRemoteClients(repoId, identities)
  )
  setWorktreeChangeEventPublisher((repoId) =>
    runtime.notifyWorktreesChangedForRemoteClients(repoId)
  )
  setRepoChangeEventPublisher(() => runtime.notifyReposChangedForRemoteClients())

  const rateLimitResumes = new RateLimitResumeService(store, accounts.rateLimits, {
    subscribeToWake: (listener) => {
      powerMonitor.on('resume', listener)
      return () => powerMonitor.off('resume', listener)
    }
  })
  runtime.setRateLimitResumeService(rateLimitResumes)
  runtime.accounts.configure({
    claudeAccounts: accounts.claudeAccounts,
    codexAccounts: accounts.codexAccounts,
    rateLimits: accounts.rateLimits
  })
  runtime.setCommitMessageAgentEnvironmentResolvers({
    prepareForCodexLaunch: options.prepareForCodexLaunch,
    prepareForClaudeLaunch: (target) => accounts.claudeRuntimeAuth.prepareForClaudeLaunch(target)
  })

  const starNag = new StarNagService(store, accounts.stats)
  starNag.start()
  starNag.registerShellService()
  runtime.setAgentBrowserBridge(
    new AgentBrowserBridge(browserManager, {
      onTabsChanged: (worktreeId) => runtime.notifyMobileSessionTabsChanged(worktreeId)
    })
  )
  runtime.setEmulatorBridge(new EmulatorBridge())

  return {
    runtime,
    rateLimitResumes,
    starNag
  }
}
