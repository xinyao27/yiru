import type {
  RuntimeHostProgressEvent,
  RuntimeAgentStatusEvent,
  RuntimeEmulatorEvent,
  RuntimeGitHubEvent,
  RuntimeNestedRepoScanProgressEvent,
  RuntimeSettingsChangedEvent,
  RuntimeSkillUpdateRunEvent,
  RuntimeUIChangedEvent,
  RuntimeWorkspacePortAdvertisedUrlChangedEvent,
  RuntimeWorktreeStateEvent
} from '@yiru/runtime-protocol/contract'
import type { AiVaultListArgs, AiVaultListResult } from '@yiru/runtime-protocol/model/agent'
import type { RuntimeClientEvent } from '@yiru/runtime-protocol/workbench/runtime-client-events'
import { listAiVaultSessions } from '~main/ai-vault/cached-session-list'
import type { ShellServicesConnectionId } from '~main/runtime/rpc/orpc/shell-services-identity'
import { dispatchShellUICommand } from '~main/runtime/rpc/orpc/shell-services-reverse-link'

import type { RuntimePtyController } from '../model/terminal-observation'
import { RuntimeOrchestrationGetOrchestrationDb } from '../orchestration/get-orchestration-db'

export abstract class RuntimeCoreListAiVaultSessions extends RuntimeOrchestrationGetOrchestrationDb {
  listAiVaultSessions(args?: AiVaultListArgs): Promise<AiVaultListResult> {
    return listAiVaultSessions(args)
  }

  setPtyController(controller: RuntimePtyController | null): void {
    // Why: CLI terminal writes must go through the main-owned PTY registry
    // instead of tunneling back through renderer IPC, or live handles could
    // drift from the process they are supposed to control during reloads.
    this.ptyController = controller
  }

  attachShellConnection(shellConnectionId: ShellServicesConnectionId): void {
    this.shellConnectionId = shellConnectionId
    this.rateLimitResumeService?.setShellConnectionId(shellConnectionId)
    // Why: run the one-shot fork-upstream backfill once a renderer is attached,
    // so existing forks self-correct on launch and the result can be broadcast.
    if (!this.forkBackfillStarted) {
      this.forkBackfillStarted = true
      void this.backfillForkUpstreams()
    }
  }

  detachShellConnection(shellConnectionId: ShellServicesConnectionId): void {
    if (this.shellConnectionId === shellConnectionId) {
      this.shellConnectionId = null
    }
    this.rateLimitResumeService?.clearShellConnectionId(shellConnectionId)
  }

  protected dispatchShellCommand(input: Parameters<typeof dispatchShellUICommand>[1]): boolean {
    return dispatchShellUICommand(this.shellConnectionId ?? undefined, input)
  }

  onClientEvent(listener: (event: RuntimeClientEvent) => void): () => void {
    this.clientEventListeners.add(listener)
    return () => {
      this.clientEventListeners.delete(listener)
    }
  }

  protected emitClientEvent(event: RuntimeClientEvent): void {
    for (const listener of this.clientEventListeners) {
      listener(event)
    }
  }

  onEmulatorEvent(listener: (event: RuntimeEmulatorEvent) => void): () => void {
    this.emulatorEventListeners.add(listener)
    return () => {
      this.emulatorEventListeners.delete(listener)
    }
  }

  emitEmulatorEvent(event: RuntimeEmulatorEvent): void {
    for (const listener of this.emulatorEventListeners) {
      listener(event)
    }
  }

  onAgentStatusEvent(listener: (event: RuntimeAgentStatusEvent) => void): () => void {
    this.agentStatusEventListeners.add(listener)
    return () => {
      this.agentStatusEventListeners.delete(listener)
    }
  }

  emitAgentStatusEvent(event: RuntimeAgentStatusEvent): void {
    for (const listener of this.agentStatusEventListeners) {
      listener(event)
    }
    this.touchMobileSessionSnapshotsForAgentStatus(event)
  }

  onSkillUpdateRunEvent(listener: (event: RuntimeSkillUpdateRunEvent) => void): () => void {
    this.skillUpdateRunEventListeners.add(listener)
    return () => {
      this.skillUpdateRunEventListeners.delete(listener)
    }
  }

  emitSkillUpdateRunEvent(event: RuntimeSkillUpdateRunEvent): void {
    for (const listener of this.skillUpdateRunEventListeners) {
      listener(event)
    }
  }

  onSettingsChangedEvent(listener: (event: RuntimeSettingsChangedEvent) => void): () => void {
    this.settingsEventListeners.add(listener)
    return () => {
      this.settingsEventListeners.delete(listener)
    }
  }

  emitSettingsChangedEvent(event: RuntimeSettingsChangedEvent): void {
    for (const listener of this.settingsEventListeners) {
      listener(event)
    }
  }

  onWorkspacePortAdvertisedUrlChangedEvent(
    listener: (event: RuntimeWorkspacePortAdvertisedUrlChangedEvent) => void
  ): () => void {
    this.workspacePortEventListeners.add(listener)
    return () => {
      this.workspacePortEventListeners.delete(listener)
    }
  }

  emitWorkspacePortAdvertisedUrlChangedEvent(
    event: RuntimeWorkspacePortAdvertisedUrlChangedEvent
  ): void {
    for (const listener of this.workspacePortEventListeners) {
      listener(event)
    }
  }

  onUIChangedEvent(listener: (event: RuntimeUIChangedEvent) => void): () => void {
    this.uiEventListeners.add(listener)
    return () => {
      this.uiEventListeners.delete(listener)
    }
  }

  emitUIChangedEvent(event: RuntimeUIChangedEvent): void {
    for (const listener of this.uiEventListeners) {
      listener(event)
    }
  }

  onGitHubEvent(listener: (event: RuntimeGitHubEvent) => void): () => void {
    this.githubEventListeners.add(listener)
    return () => {
      this.githubEventListeners.delete(listener)
    }
  }

  emitGitHubEvent(event: RuntimeGitHubEvent): void {
    for (const listener of this.githubEventListeners) {
      listener(event)
    }
  }

  onWorktreeStateEvent(listener: (event: RuntimeWorktreeStateEvent) => void): () => void {
    this.worktreeStateEventListeners.add(listener)
    return () => {
      this.worktreeStateEventListeners.delete(listener)
    }
  }

  emitWorktreeStateEvent(event: RuntimeWorktreeStateEvent): void {
    for (const listener of this.worktreeStateEventListeners) {
      listener(event)
    }
  }

  onHostProgressEvent(listener: (event: RuntimeHostProgressEvent) => void): () => void {
    this.hostProgressEventListeners.add(listener)
    return () => {
      this.hostProgressEventListeners.delete(listener)
    }
  }

  emitHostProgressEvent(event: RuntimeHostProgressEvent): void {
    for (const listener of this.hostProgressEventListeners) {
      listener(event)
    }
  }

  onNestedRepoScanProgressEvent(
    listener: (event: RuntimeNestedRepoScanProgressEvent) => void
  ): () => void {
    this.nestedRepoScanEventListeners.add(listener)
    return () => {
      this.nestedRepoScanEventListeners.delete(listener)
    }
  }
}
