import {
  AGENT_STATUS_STALE_AFTER_MS,
  type AgentStatusEntry
} from '@yiru/runtime-protocol/model/agent'
import { recognizeAgentProcess } from '@yiru/runtime-protocol/workbench/agent/process-recognition'
import type { RuntimeTerminalAgentStatus } from '@yiru/runtime-protocol/workbench/runtime-types'

import type { PtyForegroundAgentRefresh } from '../model/terminal-launch'
import { mapExplicitAgentStateToRuntimeTerminalStatus } from '../model/worktree-status'
import { RuntimeTerminalGetTerminalAgentStatus } from './get-terminal-agent-status'

export abstract class RuntimeTerminalGetPendingForegroundAgentRefreshForTitle extends RuntimeTerminalGetTerminalAgentStatus {
  protected getPendingForegroundAgentRefreshForTitle(
    ptyId: string,
    titleObservedAt: number
  ): Promise<boolean> | undefined {
    if (!this.ptyForegroundAgentRefreshes.has(ptyId)) {
      return undefined
    }
    return this.refreshPtyForegroundAgentFromController(ptyId, {
      afterTitleObservation: titleObservedAt
    })
  }

  protected delayPtyBackedMobileSnapshotForForegroundAgent(
    ptyId: string,
    titleObservedAt: number,
    foregroundRefresh: Promise<boolean>
  ): void {
    this.ptyDelayedForegroundSnapshotTitleObservations.set(ptyId, titleObservedAt)
    void foregroundRefresh.then((foregroundAgentChanged) => {
      if (this.ptyDelayedForegroundSnapshotTitleObservations.get(ptyId) !== titleObservedAt) {
        return
      }
      this.ptyDelayedForegroundSnapshotTitleObservations.delete(ptyId)
      if (!foregroundAgentChanged) {
        this.touchMobileSessionSnapshotsForPty(ptyId)
      }
    })
  }

  /**
   * Deduplicates and manages in-flight foreground agent refresh queries
   * for a specific PTY.
   */

  protected refreshPtyForegroundAgentFromController(
    ptyId: string,
    options: { afterTitleObservation?: number } = {}
  ): Promise<boolean> {
    const startedAfterTitleObservation = options.afterTitleObservation ?? 0
    const pendingRefresh = this.ptyForegroundAgentRefreshes.get(ptyId)
    if (pendingRefresh) {
      pendingRefresh.requestedAfterTitleObservation = Math.max(
        pendingRefresh.requestedAfterTitleObservation,
        startedAfterTitleObservation
      )
      return pendingRefresh.promise
    }
    const entry: PtyForegroundAgentRefresh = {
      promise: Promise.resolve(false),
      startedAfterTitleObservation,
      requestedAfterTitleObservation: startedAfterTitleObservation
    }
    const refresh = (async (): Promise<boolean> => {
      while (true) {
        entry.startedAfterTitleObservation = entry.requestedAfterTitleObservation
        const foregroundAgentChanged = await this.loadPtyForegroundAgentFromController(ptyId)
        if (
          foregroundAgentChanged ||
          entry.requestedAfterTitleObservation <= entry.startedAfterTitleObservation
        ) {
          return foregroundAgentChanged
        }
      }
    })().finally(() => {
      if (this.ptyForegroundAgentRefreshes.get(ptyId) === entry) {
        this.ptyForegroundAgentRefreshes.delete(ptyId)
      }
    })
    entry.promise = refresh
    this.ptyForegroundAgentRefreshes.set(ptyId, entry)
    return refresh
  }

  /**
   * Queries the PTY controller for the active foreground process, identifies if it
   * is a recognized agent, and updates the PTY's foreground agent state if changed.
   */

  protected async loadPtyForegroundAgentFromController(ptyId: string): Promise<boolean> {
    if (!this.ptyController) {
      return false
    }
    // Why: foregroundAgent is only consulted as the owner fallback when
    // launchAgent is unknown, so a known launchAgent makes the relay
    // getForegroundProcess round-trip pure waste (covers all launched agents).
    if (!this.terminalSessions.canProbePtyForegroundAgent(ptyId)) {
      return false
    }
    let foregroundProcess: string | null
    try {
      foregroundProcess = await this.ptyController.getForegroundProcess(ptyId)
    } catch {
      return false
    }
    const foregroundAgent = foregroundProcess
      ? (recognizeAgentProcess(foregroundProcess)?.agent ?? null)
      : null
    if (!this.terminalSessions.setPtyForegroundAgent(ptyId, foregroundAgent)) {
      return false
    }
    this.touchMobileSessionSnapshotsForPty(ptyId)
    return true
  }

  protected getFreshExplicitAgentStatusForHandle(handle: string): {
    status: NonNullable<RuntimeTerminalAgentStatus['status']>
    updatedAt: number
  } | null {
    const paneKey = this.getPaneKeyForTerminalHandle(handle)
    const now = Date.now()
    let bestStatus: NonNullable<RuntimeTerminalAgentStatus['status']> | null = null
    let bestUpdatedAt = -1

    const consider = (
      state: AgentStatusEntry['state'] | undefined,
      updatedAt: number | null | undefined
    ): void => {
      if (!state) {
        return
      }
      if (typeof updatedAt !== 'number' || now - updatedAt > AGENT_STATUS_STALE_AFTER_MS) {
        return
      }
      const status = mapExplicitAgentStateToRuntimeTerminalStatus(state)
      // Why: older retained permission rows can remain visible after the agent
      // resumes. Prefer the newest explicit state; only let permission win ties.
      if (updatedAt > bestUpdatedAt || (updatedAt === bestUpdatedAt && status === 'permission')) {
        bestStatus = status
        bestUpdatedAt = updatedAt
      }
    }

    if (paneKey) {
      const retained = this.latestAgentStatusByPaneKey.get(paneKey)
      consider(retained?.payload.state, retained?.updatedAt)
    }

    for (const entry of this.getAgentStatusSnapshotFn?.() ?? []) {
      if (entry.terminalHandle !== handle && (!paneKey || entry.paneKey !== paneKey)) {
        continue
      }
      consider(entry.state, entry.receivedAt)
    }

    return bestStatus ? { status: bestStatus, updatedAt: bestUpdatedAt } : null
  }
}
