import type { SleepingAgentLaunchConfig } from '@yiru/runtime-protocol/model/agent'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  type AgentStatusOrchestrationContext
} from '@yiru/runtime-protocol/model/agent'
import {
  isTerminalLeafId,
  makePaneKey,
  parsePaneKey
} from '@yiru/runtime-protocol/workbench/stable-pane-id'
import { buildOrchestrationTaskDisplayMetadata } from '~main/orchestration/task-display'
import type { OrchestrationDb } from '~main/runtime/orchestration/db'

import { copySleepingAgentLaunchConfig } from '../model/terminal-launch'
import type { RuntimePtyWorktreeRecord } from '../model/terminal-records'
import { RuntimeSessionFindPtyForMobileTerminalTab } from '../session/find-pty-for-mobile-terminal-tab'

export abstract class RuntimeTerminalGetAgentStatusForHandle extends RuntimeSessionFindPtyForMobileTerminalTab {
  getAgentStatusForHandle(handle: string): string | null {
    try {
      const ptyId = this.getTerminalAgentStatusPtyId(handle)
      return this.getTerminalAgentStatusSnapshot(handle, ptyId).titleStatus
    } catch {
      return null
    }
  }

  getAgentStatusOrchestrationContextForPaneKey(
    paneKey: string
  ): AgentStatusOrchestrationContext | undefined {
    const handle = this.getTerminalHandleForPaneKey(paneKey)
    if (!handle) {
      return undefined
    }
    return this.getAgentStatusOrchestrationContextForHandle(handle)
  }

  getAgentStatusTerminalHandleForPaneKey(paneKey: string): string | undefined {
    return this.getTerminalHandleForPaneKey(paneKey) ?? undefined
  }

  getAgentStatusLaunchConfigForPaneKey(
    paneKey: string,
    args?: { launchToken?: string }
  ): SleepingAgentLaunchConfig | undefined {
    const pty = this.getPtyRecordForPaneKey(paneKey)
    if (!pty?.launchConfig) {
      return undefined
    }
    if (pty.launchToken === null || pty.launchToken !== args?.launchToken) {
      return undefined
    }
    return copySleepingAgentLaunchConfig(pty.launchConfig)
  }

  protected buildAgentOrchestrationByPaneKey():
    | Record<string, AgentStatusOrchestrationContext>
    | undefined {
    const db = this.getOrchestrationDbIfAvailable()
    if (!db) {
      return undefined
    }
    const contexts: Record<string, AgentStatusOrchestrationContext> = {}
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      if (!leaf.ptyId) {
        continue
      }
      const handle = this.issueHandle(leaf)
      const context = this.getAgentStatusOrchestrationContextForHandle(handle, db)
      if (context) {
        contexts[this.makeRuntimePaneKey(leaf)] = context
      }
    }
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (!pty.paneKey || contexts[pty.paneKey]) {
        continue
      }
      const handle = this.issuePtyHandle(pty)
      const context = this.getAgentStatusOrchestrationContextForHandle(handle, db)
      if (context) {
        contexts[pty.paneKey] = context
      }
    }
    return Object.keys(contexts).length > 0 ? contexts : undefined
  }

  protected getAgentStatusOrchestrationContextForHandle(
    handle: string,
    db = this.getOrchestrationDbIfAvailable()
  ): AgentStatusOrchestrationContext | undefined {
    // Why: active dispatches are authoritative for reused terminals. Completed
    // context is only useful while the corresponding done/recent row can still
    // be visible; after that it would stale-group unrelated future work.
    const dispatch =
      db?.getActiveDispatchForTerminal?.(handle) ??
      this.getRecentCompletedDispatchForTerminal(handle, db)
    if (!dispatch) {
      return undefined
    }
    const task = db?.getTask?.(dispatch.task_id)
    const display =
      typeof task?.spec === 'string'
        ? buildOrchestrationTaskDisplayMetadata({
            spec: task.spec,
            taskTitle: task.task_title,
            displayName: task.display_name
          })
        : { taskTitle: '', displayName: '' }
    const activeRun = dispatch.status === 'completed' ? undefined : db?.getActiveCoordinatorRun?.()
    const parentTerminalHandle =
      task?.created_by_terminal_handle ??
      (activeRun?.coordinator_handle && activeRun.coordinator_handle !== handle
        ? activeRun.coordinator_handle
        : undefined)
    const parentPaneKey = parentTerminalHandle
      ? this.getPaneKeyForTerminalHandle(parentTerminalHandle)
      : undefined

    return {
      taskId: dispatch.task_id,
      dispatchId: dispatch.id,
      ...(display.taskTitle ? { taskTitle: display.taskTitle } : {}),
      ...(display.displayName ? { displayName: display.displayName } : {}),
      ...(parentTerminalHandle ? { parentTerminalHandle } : {}),
      ...(parentPaneKey ? { parentPaneKey } : {}),
      ...(activeRun?.coordinator_handle ? { coordinatorHandle: activeRun.coordinator_handle } : {}),
      ...(activeRun?.id ? { orchestrationRunId: activeRun.id } : {})
    }
  }

  protected getRecentCompletedDispatchForTerminal(
    handle: string,
    db = this.getOrchestrationDbIfAvailable()
  ): ReturnType<OrchestrationDb['getLatestDispatchForTerminal']> {
    const dispatch = db?.getLatestDispatchForTerminal?.(handle)
    if (dispatch?.status !== 'completed' || !dispatch.completed_at) {
      return undefined
    }
    const completedAtMs = Date.parse(
      dispatch.completed_at.includes('T')
        ? dispatch.completed_at
        : `${dispatch.completed_at.replace(' ', 'T')}Z`
    )
    if (!Number.isFinite(completedAtMs)) {
      return undefined
    }
    return Date.now() - completedAtMs <= AGENT_STATUS_STALE_AFTER_MS ? dispatch : undefined
  }

  protected getTerminalHandleForPaneKey(paneKey: string): string | null {
    const parsed = parsePaneKey(paneKey)
    if (parsed) {
      const leaf = this.terminalSessions.getGraphLeafByKey(
        this.getLeafKey(parsed.tabId, parsed.leafId)
      )
      if (leaf?.ptyId) {
        return this.issueHandle(leaf)
      }
    }
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (pty.paneKey === paneKey) {
        return this.issuePtyHandle(pty)
      }
    }
    return null
  }

  protected getPtyRecordForPaneKey(paneKey: string): RuntimePtyWorktreeRecord | null {
    const parsed = parsePaneKey(paneKey)
    if (parsed) {
      const leaf = this.terminalSessions.getGraphLeafByKey(
        this.getLeafKey(parsed.tabId, parsed.leafId)
      )
      const pty = leaf?.ptyId ? this.terminalSessions.getPtyRecord(leaf.ptyId) : undefined
      if (pty) {
        return pty
      }
    }
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (pty.paneKey === paneKey) {
        return pty
      }
    }
    return null
  }

  protected getPaneKeyForTerminalHandle(handle: string): string | null {
    const livePty = this.getLivePtyForHandle(handle)
    if (livePty?.pty.paneKey) {
      return livePty.pty.paneKey
    }
    const record = this.terminalSessions.getTerminalHandle(handle)
    if (!record || record.runtimeId !== this.runtimeId) {
      return null
    }
    if (!isTerminalLeafId(record.leafId)) {
      return null
    }
    return makePaneKey(record.tabId, record.leafId)
  }
}
