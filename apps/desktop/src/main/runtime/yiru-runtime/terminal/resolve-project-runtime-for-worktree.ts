import { resolveLocalProjectRuntimeForWorktreeId } from '~main/local-project-runtime-resolution'
import { getRuntimeHostPathsProvider } from '~main/runtime/host/paths-provider'
import { resolveTerminalOrchestrationCliCommand } from '~main/runtime/orchestration/cli-command'
import type { CommitMessageAgentEnvironmentResolvers } from '~main/text-generation/commit-message-agent-environment'
import type { ProjectExecutionRuntimeResolution } from '~shared/project-execution-runtime'
import type { GlobalSettings } from '~shared/types'

import {
  recentTerminalOutputIncludesPath,
  recentTerminalPathCandidatesIncludePath
} from '../model/terminal-path-provenance'
import type { RuntimePtyWorktreeRecord } from '../model/terminal-records'
import { RuntimeTerminalSerializeHeadlessTerminalBuffer } from './serialize-headless-terminal-buffer'

export abstract class RuntimeTerminalResolveProjectRuntimeForWorktree extends RuntimeTerminalSerializeHeadlessTerminalBuffer {
  resolveProjectRuntimeForWorktree(
    worktreeId: string | null | undefined
  ): ProjectExecutionRuntimeResolution | undefined {
    return this.store && worktreeId
      ? resolveLocalProjectRuntimeForWorktreeId(this.requireStore(), worktreeId)
      : undefined
  }

  getTerminalOrchestrationCliCommand(handle: string): string {
    const isPackaged = getRuntimeHostPathsProvider().isPackaged()
    let pty: RuntimePtyWorktreeRecord | null = null
    try {
      const ptyId = this.resolveLeafForHandle(handle)?.ptyId
      pty = ptyId ? (this.terminalSessions.getPtyRecord(ptyId) ?? null) : null
    } catch {
      return resolveTerminalOrchestrationCliCommand({
        connectionId: null,
        isPackaged,
        isWsl: false,
        worktreeId: ''
      })
    }
    if (!pty) {
      return resolveTerminalOrchestrationCliCommand({
        connectionId: null,
        isPackaged,
        isWsl: false,
        worktreeId: ''
      })
    }
    return resolveTerminalOrchestrationCliCommand({
      connectionId: pty.connectionId,
      isPackaged,
      isWsl: pty.isWsl,
      worktreeId: pty.worktreeId,
      projectRuntime: this.store
        ? resolveLocalProjectRuntimeForWorktreeId(this.requireStore(), pty.worktreeId)
        : undefined
    })
  }

  hasRecentTerminalOutputPath(handle: string, pathText: string, absolutePath: string): boolean {
    const ptyId = this.resolveLeafForHandle(handle)?.ptyId
    const recentOutput = ptyId ? this.recentPtyOutputById.get(ptyId) : null
    if (recentOutput && recentTerminalOutputIncludesPath(recentOutput, pathText, absolutePath)) {
      return true
    }
    const candidates = ptyId ? this.recentPtyPathCandidatesById.get(ptyId) : null
    return candidates
      ? recentTerminalPathCandidatesIncludePath(candidates, pathText, absolutePath)
      : false
  }

  registerSubscriptionCleanup(
    subscriptionId: string,
    cleanup: () => void | Promise<void>,
    connectionId?: string
  ): void {
    this.terminalSessions.registerSubscription(subscriptionId, cleanup, connectionId)
  }

  cleanupSubscription(subscriptionId: string): void {
    this.terminalSessions.cleanupSubscription(subscriptionId)
  }

  retrySubscriptionCleanupAfter(
    subscriptionId: string,
    cleanupOwner: () => void | Promise<void>,
    gate: Promise<void>
  ): void {
    this.terminalSessions.retrySubscriptionCleanupAfter(subscriptionId, cleanupOwner, gate)
  }

  cleanupSubscriptionAndWait(subscriptionId: string): Promise<void> {
    return this.terminalSessions.cleanupSubscriptionAndWait(subscriptionId)
  }

  cleanupSubscriptionsByPrefix(prefix: string): void {
    this.terminalSessions.cleanupSubscriptionsByPrefix(prefix)
  }

  // Why: invoked from the WebSocket transport's on-close hook so streaming
  // listeners registered for this exact socket get torn down even when other
  // sockets sharing the same deviceToken are still alive (multi-screen
  // mobile). Without this sweep, listeners leak across every reconnect.

  cleanupSubscriptionsForConnection(connectionId: string): void {
    this.terminalSessions.cleanupSubscriptionsForConnection(connectionId)
  }

  getNotificationSettings(): GlobalSettings['notifications'] | undefined {
    return this.store?.getSettings ? this.store.getSettings().notifications : undefined
  }

  setCommitMessageAgentEnvironmentResolvers(
    resolvers: CommitMessageAgentEnvironmentResolvers
  ): void {
    this.commitMessageAgentEnv = resolvers
  }

  getCommitMessageAgentEnvironmentResolvers(): CommitMessageAgentEnvironmentResolvers | undefined {
    return this.commitMessageAgentEnv ?? undefined
  }
}
