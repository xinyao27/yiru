import type { RuntimeWorktreeAgentRow } from '@yiru/runtime-protocol/mobile-runtime-types'
import {
  isFreshNonDoneAgentStatus,
  type ParsedAgentStatusPayload
} from '@yiru/runtime-protocol/model/agent'
import type { RuntimeWorktreePsSummary } from '@yiru/runtime-protocol/workbench/runtime-types'
import { parsePaneKey } from '@yiru/runtime-protocol/workbench/stable-pane-id'

import type { RuntimeWorktreeSummaryPathIndex } from '../model/worktree-identity'
import { mergeWorktreeStatus } from '../model/worktree-status'
import { RuntimeTerminalGetWorktreePs } from './get-worktree-ps'

export abstract class RuntimeTerminalAttachAgentRowsToSummaries extends RuntimeTerminalGetWorktreePs {
  protected attachAgentRowsToSummaries(
    summaries: Map<string, RuntimeWorktreePsSummary>,
    runtimeWorktreeSummaryPathIndex: RuntimeWorktreeSummaryPathIndex,
    missingRuntimeWorktreeIds: Set<string>,
    mirroredWorktreeIdByTabId: ReadonlyMap<string, string>
  ): void {
    // Why: most agents report via hooks (agent-hooks/server), not OSC, so the
    // hook snapshot is the primary source — same one the desktop sidebar reads.
    // OSC-only entries (no hook) are merged in as a fallback, keyed by paneKey.
    const rowSources = new Map<
      string,
      {
        paneKey: string
        tabId?: string
        worktreeId?: string
        state: ParsedAgentStatusPayload['state']
        agentType: string | null
        prompt: string
        lastAssistantMessage: string | null
        toolName: string | null
        toolInput: string | null
        interrupted: boolean
        stateStartedAt: number
        updatedAt: number
      }
    >()
    for (const snapshot of this.latestAgentStatusByPaneKey.values()) {
      const { payload } = snapshot
      rowSources.set(snapshot.paneKey, {
        paneKey: snapshot.paneKey,
        tabId: snapshot.tabId,
        worktreeId: snapshot.worktreeId,
        state: payload.state,
        agentType: payload.agentType ?? null,
        prompt: payload.prompt,
        lastAssistantMessage: payload.lastAssistantMessage ?? null,
        toolName: payload.toolName ?? null,
        toolInput: payload.toolInput ?? null,
        interrupted: payload.interrupted ?? false,
        stateStartedAt: snapshot.stateStartedAt,
        updatedAt: snapshot.updatedAt
      })
    }
    for (const entry of this.getAgentStatusSnapshotFn?.() ?? []) {
      const existing = rowSources.get(entry.paneKey)
      // Why: hook rows win ties, but an older cached hook must not replace a
      // fresh OSC status and make a running mobile workspace look inactive.
      if (existing && existing.updatedAt > entry.receivedAt) {
        continue
      }
      rowSources.set(entry.paneKey, {
        paneKey: entry.paneKey,
        tabId: entry.tabId,
        worktreeId: entry.worktreeId,
        state: entry.state,
        agentType: entry.agentType ?? null,
        prompt: entry.prompt,
        lastAssistantMessage: entry.lastAssistantMessage ?? null,
        toolName: entry.toolName ?? null,
        toolInput: entry.toolInput ?? null,
        interrupted: entry.interrupted ?? false,
        stateStartedAt: entry.stateStartedAt,
        updatedAt: entry.receivedAt
      })
    }
    if (rowSources.size === 0) {
      return
    }
    const orchestrationByPaneKey = this.buildAgentOrchestrationByPaneKey()
    const rowsByWorktree = new Map<string, RuntimeWorktreeAgentRow[]>()
    const now = Date.now()
    for (const src of rowSources.values()) {
      // Why: hooks retain launch-time attribution across automatic workspace
      // renames; the tab's current mirrored owner is authoritative when present.
      const tabId = src.tabId ?? parsePaneKey(src.paneKey)?.tabId
      const worktreeId =
        (tabId ? mirroredWorktreeIdByTabId.get(tabId) : undefined) ?? src.worktreeId
      if (!worktreeId) {
        continue
      }
      const summary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        worktreeId
      )
      if (!summary) {
        continue
      }
      const taskTitle = orchestrationByPaneKey?.[src.paneKey]?.taskTitle ?? null
      const displayName = orchestrationByPaneKey?.[src.paneKey]?.displayName ?? null
      const row: RuntimeWorktreeAgentRow = {
        paneKey: src.paneKey,
        parentPaneKey: orchestrationByPaneKey?.[src.paneKey]?.parentPaneKey ?? null,
        state: src.state,
        agentType: src.agentType,
        prompt: src.prompt,
        taskTitle,
        displayName,
        lastAssistantMessage: src.lastAssistantMessage,
        toolName: src.toolName,
        toolInput: src.toolInput,
        interrupted: src.interrupted,
        stateStartedAt: src.stateStartedAt,
        updatedAt: src.updatedAt
      }
      // Why: paired-runtime projections can spell an equivalent path differently;
      // bucket by the canonical summary id so mobile keeps the agent activity.
      const rows = rowsByWorktree.get(summary.worktreeId)
      if (rows) {
        rows.push(row)
      } else {
        rowsByWorktree.set(summary.worktreeId, [row])
      }
    }
    for (const [worktreeId, rows] of rowsByWorktree) {
      // Oldest-started first, matching the desktop dashboard's start-order sort.
      rows.sort((a, b) => a.stateStartedAt - b.stateStartedAt)
      const summary = summaries.get(worktreeId)
      if (summary) {
        summary.agents = rows
        for (const row of rows) {
          if (!isFreshNonDoneAgentStatus(row, now)) {
            continue
          }
          // Why: worktree.ps is mobile's host-sidebar parity source, so a live
          // agent must survive the same temporary PTY gaps as desktop.
          summary.hasHostSidebarActivity = true
          summary.status = mergeWorktreeStatus(
            summary.status,
            row.state === 'working' ? 'working' : 'permission'
          )
        }
      }
    }
  }
}
