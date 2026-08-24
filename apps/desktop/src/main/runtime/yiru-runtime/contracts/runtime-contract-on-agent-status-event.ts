import type {
  RuntimeBrowserGuestEvent,
  RuntimeDriverEvent,
  RuntimeHostProgressEvent,
  RuntimeAgentStatusEvent,
  RuntimeGitHubEvent,
  RuntimeNestedRepoScanProgressEvent,
  RuntimeSettingsChangedEvent,
  RuntimeSkillUpdateRunEvent,
  RuntimeUIChangedEvent,
  RuntimeWorkspacePortAdvertisedUrlChangedEvent,
  RuntimeWorktreeStateEvent
} from '@yiru/runtime-protocol/contract'
import type { AgentBrowserBridge } from '~main/browser/agent-browser-bridge'
import type { BrowserBackend } from '~main/browser/backend'
import type { EmulatorBridge } from '~main/emulator/bridge'
import type {
  RuntimeSyncWindowGraphResult,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsSnapshot,
  RuntimeSyncWindowGraph
} from '~shared/runtime-types'
import type {
  CreateWorktreeResult,
  WorktreeHeadIdentity,
  WorktreeStartupLaunch
} from '~shared/types'
import type { WorkspaceCleanupScanProgress } from '~shared/workspace/cleanup'
import type { WorkspaceSpaceScanProgress } from '~shared/workspace/space-types'

import { RuntimeContractGetLocalProvider } from './runtime-contract-get-local-provider'

export abstract class RuntimeContractOnAgentStatusEvent extends RuntimeContractGetLocalProvider {
  abstract onAgentStatusEvent(listener: (event: RuntimeAgentStatusEvent) => void): () => void

  abstract emitAgentStatusEvent(event: RuntimeAgentStatusEvent): void

  abstract onSkillUpdateRunEvent(listener: (event: RuntimeSkillUpdateRunEvent) => void): () => void

  abstract emitSkillUpdateRunEvent(event: RuntimeSkillUpdateRunEvent): void

  abstract onSettingsChangedEvent(
    listener: (event: RuntimeSettingsChangedEvent) => void
  ): () => void

  abstract emitSettingsChangedEvent(event: RuntimeSettingsChangedEvent): void

  abstract onWorkspacePortAdvertisedUrlChangedEvent(
    listener: (event: RuntimeWorkspacePortAdvertisedUrlChangedEvent) => void
  ): () => void

  abstract emitWorkspacePortAdvertisedUrlChangedEvent(
    event: RuntimeWorkspacePortAdvertisedUrlChangedEvent
  ): void

  abstract onUIChangedEvent(listener: (event: RuntimeUIChangedEvent) => void): () => void

  abstract emitUIChangedEvent(event: RuntimeUIChangedEvent): void

  abstract onGitHubEvent(listener: (event: RuntimeGitHubEvent) => void): () => void

  abstract emitGitHubEvent(event: RuntimeGitHubEvent): void

  abstract onWorktreeStateEvent(listener: (event: RuntimeWorktreeStateEvent) => void): () => void

  abstract emitWorktreeStateEvent(event: RuntimeWorktreeStateEvent): void

  abstract onHostProgressEvent(listener: (event: RuntimeHostProgressEvent) => void): () => void

  abstract emitHostProgressEvent(event: RuntimeHostProgressEvent): void

  abstract onNestedRepoScanProgressEvent(
    listener: (event: RuntimeNestedRepoScanProgressEvent) => void
  ): () => void

  protected abstract emitNestedRepoScanProgressEvent(
    event: RuntimeNestedRepoScanProgressEvent
  ): void

  abstract onWorkspaceCleanupScanProgressEvent(
    listener: (event: WorkspaceCleanupScanProgress) => void
  ): () => void

  protected abstract emitWorkspaceCleanupScanProgressEvent(
    event: WorkspaceCleanupScanProgress
  ): void

  abstract onWorkspaceSpaceScanProgressEvent(
    listener: (event: WorkspaceSpaceScanProgress) => void
  ): () => void

  protected abstract emitWorkspaceSpaceScanProgressEvent(event: WorkspaceSpaceScanProgress): void

  abstract onDriverEvent(listener: (event: RuntimeDriverEvent) => void): () => void

  protected abstract emitDriverEvent(event: RuntimeDriverEvent): void

  abstract onBrowserGuestEvent(listener: (event: RuntimeBrowserGuestEvent) => void): () => void

  abstract emitBrowserGuestEvent(event: RuntimeBrowserGuestEvent): void

  protected abstract notifyWorktreesChanged(repoId: string): void

  protected abstract notifyReposChanged(): void

  abstract notifyWorktreesChangedForRemoteClients(repoId: string): void

  abstract notifyReposChangedForRemoteClients(): void

  abstract notifyWorktreeHeadIdentitiesChangedForRemoteClients(
    repoId: string,
    identities: WorktreeHeadIdentity[]
  ): void

  protected abstract notifyActivateWorktree(
    repoId: string,
    worktreeId: string,
    setup?: CreateWorktreeResult['setup'],
    startup?: WorktreeStartupLaunch,
    defaultTabs?: CreateWorktreeResult['defaultTabs']
  ): void

  abstract setAgentBrowserBridge(bridge: AgentBrowserBridge | null): void

  abstract getAgentBrowserBridge(): AgentBrowserBridge | null

  abstract setBrowserBackend(backend: BrowserBackend | null): void

  abstract getBrowserBackend(): BrowserBackend | null

  abstract setEmulatorBridge(bridge: EmulatorBridge | null): void

  abstract getEmulatorBridge(): EmulatorBridge | null

  abstract attachWindow(windowId: number): void

  protected abstract persistWindowlessPtyBindingsForDesktopAttach(): void

  abstract syncWindowGraph(
    windowId: number,
    graph: RuntimeSyncWindowGraph
  ): RuntimeSyncWindowGraphResult

  protected abstract preserveRemoteViewedLeafBindings(
    graph: RuntimeSyncWindowGraph
  ): RuntimeSyncWindowGraph['leaves']

  abstract listMobileSessionTabs(worktreeSelector: string): Promise<RuntimeMobileSessionTabsResult>

  abstract listAllMobileSessionTabs(): Promise<RuntimeMobileSessionTabsResult[]>

  protected abstract hydrateHeadlessMobileSessionTabsFromWorkspaceSession(
    worktreeId?: string,
    options?: {
      force?: boolean
      allowAttachedWindow?: boolean
      onlyServeOwnedTerminals?: boolean
    }
  ): Set<string>

  protected abstract reconcileHeadlessMobileSessionBrowserTabs(
    worktreeId: string,
    existing: RuntimeMobileSessionTabsSnapshot
  ): void
}
