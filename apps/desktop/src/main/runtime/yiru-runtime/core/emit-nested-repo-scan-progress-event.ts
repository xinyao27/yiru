import type {
  RuntimeBrowserGuestEvent,
  RuntimeDriverEvent,
  RuntimeNestedRepoScanProgressEvent
} from '@yiru/runtime-protocol/contract'
import type { AgentBrowserBridge } from '~main/browser/agent-browser-bridge'
import type { BrowserBackend } from '~main/browser/backend'
import type { EmulatorBridge } from '~main/emulator/bridge'
import { setEmulatorBridge } from '~main/runtime/yiru-runtime-emulator'
import { toRuntimeActivateWorktreeEvent } from '~shared/runtime-client-events'
import type {
  CreateWorktreeResult,
  WorktreeHeadIdentity,
  WorktreeStartupLaunch
} from '~shared/types'
import type { WorkspaceCleanupScanProgress } from '~shared/workspace/cleanup'
import type { WorkspaceSpaceScanProgress } from '~shared/workspace/space-types'

import { RuntimeCoreListAiVaultSessions } from './list-ai-vault-sessions'

export abstract class RuntimeCoreEmitNestedRepoScanProgressEvent extends RuntimeCoreListAiVaultSessions {
  protected emitNestedRepoScanProgressEvent(event: RuntimeNestedRepoScanProgressEvent): void {
    for (const listener of this.nestedRepoScanEventListeners) {
      listener(event)
    }
  }

  onWorkspaceCleanupScanProgressEvent(
    listener: (event: WorkspaceCleanupScanProgress) => void
  ): () => void {
    this.workspaceCleanupScanEventListeners.add(listener)
    return () => {
      this.workspaceCleanupScanEventListeners.delete(listener)
    }
  }

  protected emitWorkspaceCleanupScanProgressEvent(event: WorkspaceCleanupScanProgress): void {
    for (const listener of this.workspaceCleanupScanEventListeners) {
      listener(event)
    }
  }

  onWorkspaceSpaceScanProgressEvent(
    listener: (event: WorkspaceSpaceScanProgress) => void
  ): () => void {
    this.workspaceSpaceScanEventListeners.add(listener)
    return () => {
      this.workspaceSpaceScanEventListeners.delete(listener)
    }
  }

  protected emitWorkspaceSpaceScanProgressEvent(event: WorkspaceSpaceScanProgress): void {
    for (const listener of this.workspaceSpaceScanEventListeners) {
      listener(event)
    }
  }

  onDriverEvent(listener: (event: RuntimeDriverEvent) => void): () => void {
    this.driverEventListeners.add(listener)
    return () => {
      this.driverEventListeners.delete(listener)
    }
  }

  // Why: driver ownership is pushed to the shell over IPC. Paired clients hold
  // no WebContents, so the same transition is republished for the runtime
  // subscription to fan out.

  protected emitDriverEvent(event: RuntimeDriverEvent): void {
    for (const listener of this.driverEventListeners) {
      listener(event)
    }
  }

  onBrowserGuestEvent(listener: (event: RuntimeBrowserGuestEvent) => void): () => void {
    this.browserGuestEventListeners.add(listener)
    return () => {
      this.browserGuestEventListeners.delete(listener)
    }
  }

  // Why: the browser manager already pushes these to the focused window's
  // WebContents. Paired web/mobile clients have no WebContents, so the same
  // payload is republished here for the runtime subscription to fan out.

  emitBrowserGuestEvent(event: RuntimeBrowserGuestEvent): void {
    for (const listener of this.browserGuestEventListeners) {
      listener(event)
    }
  }

  protected notifyWorktreesChanged(repoId: string): void {
    this.emitClientEvent({ type: 'worktreesChanged', repoId })
  }

  protected notifyReposChanged(): void {
    this.emitClientEvent({ type: 'reposChanged' })
  }

  // Why: renderer-initiated meta updates intentionally skip a shell command
  // (the renderer already applied them optimistically), but remote
  // clients hold no optimistic copy and need the invalidation event.

  notifyWorktreesChangedForRemoteClients(repoId: string): void {
    this.invalidateResolvedWorktreeCache()
    this.emitClientEvent({ type: 'worktreesChanged', repoId })
  }

  notifyReposChangedForRemoteClients(): void {
    this.emitClientEvent({ type: 'reposChanged' })
  }

  // Why: the base-directory watcher's metadata-file head diff has no
  // BrowserWindow to push through once decoupled from shell lifetime — it
  // reaches this via the injected publisher in worktree/head-identity-events.ts
  // (same shape as notifyWorktreesChangedForRemoteClients), so paired web/mobile
  // clients see external head moves the same way the desktop IPC push does.

  notifyWorktreeHeadIdentitiesChangedForRemoteClients(
    repoId: string,
    identities: WorktreeHeadIdentity[]
  ): void {
    this.emitClientEvent({ type: 'worktreeHeadIdentitiesChanged', repoId, identities })
  }

  protected notifyActivateWorktree(
    repoId: string,
    worktreeId: string,
    setup?: CreateWorktreeResult['setup'],
    startup?: WorktreeStartupLaunch,
    defaultTabs?: CreateWorktreeResult['defaultTabs']
  ): void {
    this.dispatchShellCommand({
      type: 'activateWorktree',
      repoId,
      worktreeId,
      ...(setup ? { setup } : {}),
      ...(startup ? { startup } : {}),
      ...(defaultTabs ? { defaultTabs } : {})
    })
    this.emitClientEvent(
      toRuntimeActivateWorktreeEvent(repoId, worktreeId, setup, startup, defaultTabs)
    )
  }

  setAgentBrowserBridge(bridge: AgentBrowserBridge | null): void {
    this.agentBrowserBridge = bridge
  }

  getAgentBrowserBridge(): AgentBrowserBridge | null {
    return this.agentBrowserBridge
  }

  setBrowserBackend(backend: BrowserBackend | null): void {
    this.browserBackend = backend
  }

  getBrowserBackend(): BrowserBackend | null {
    return this.browserBackend
  }

  setEmulatorBridge(bridge: EmulatorBridge | null): void {
    this.emulatorBridge = bridge
    setEmulatorBridge(bridge)
  }

  getEmulatorBridge(): EmulatorBridge | null {
    return this.emulatorBridge
  }
}
