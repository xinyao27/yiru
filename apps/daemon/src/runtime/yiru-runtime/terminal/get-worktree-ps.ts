import type { RuntimeWorktreePsSummary } from '@yiru/runtime-protocol/workbench/runtime-types'

import { compactWorktreePsForMobile, compareWorktreePs } from '../model/mobile-worktree-summary'
import { DEFAULT_WORKTREE_PS_LIMIT } from '../model/runtime-limits'
import { maxTimestamp } from '../model/terminal-normalization'
import { buildRuntimeWorktreeSummaryPathIndex } from '../model/worktree-identity'
import {
  getLeafWorktreeStatus,
  getSavedTabWorktreeStatus,
  mergeWorktreeStatus
} from '../model/worktree-status'
import { RuntimeTerminalBuildWorktreeSummaries } from './build-worktree-summaries'

export abstract class RuntimeTerminalGetWorktreePs extends RuntimeTerminalBuildWorktreeSummaries {
  async getWorktreePs(
    limit = DEFAULT_WORKTREE_PS_LIMIT,
    clientKind?: 'mobile' | 'runtime'
  ): Promise<{
    worktrees: RuntimeWorktreePsSummary[]
    totalCount: number
    truncated: boolean
  }> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('invalid_limit')
    }
    const resolvedWorktreeSnapshot = await this.listResolvedWorktreeSnapshot()
    const resolvedWorktrees = resolvedWorktreeSnapshot.worktrees.filter((worktree) =>
      this.isRuntimeWorktreeVisible(worktree)
    )
    // Why: worktree.ps backs the mobile sidebar, so it must use the same
    // host-owned imported-worktree visibility gate as worktree.list/desktop.
    await this.refreshPtyWorktreeRecordsFromController(resolvedWorktrees)
    const allRepos = this.store?.getRepos() ?? []
    const platformByRepoId = resolvedWorktreeSnapshot.platformByRepoId
    const summaries = this.buildWorktreeSummaries(resolvedWorktrees, platformByRepoId, allRepos)

    const runtimeWorktreeSummaryPathIndex = buildRuntimeWorktreeSummaryPathIndex(
      summaries,
      resolvedWorktrees,
      platformByRepoId
    )
    const missingRuntimeWorktreeIds = new Set<string>()
    const countedPtyIds = new Set<string>()
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      const summary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        leaf.worktreeId
      )
      if (!summary) {
        continue
      }
      if (leaf.ptyId) {
        countedPtyIds.add(leaf.ptyId)
      }
      if (leaf.ptyId && leaf.connected) {
        summary.hasHostSidebarActivity = true
      }
      const previousLastOutputAt = summary.lastOutputAt
      summary.liveTerminalCount += 1
      summary.hasAttachedPty = summary.hasAttachedPty || leaf.connected
      summary.lastOutputAt = maxTimestamp(summary.lastOutputAt, leaf.lastOutputAt)
      summary.status = mergeWorktreeStatus(
        summary.status,
        getLeafWorktreeStatus(leaf, this.terminalSessions.getGraphTab(leaf.tabId)?.title ?? null)
      )
      if (
        leaf.preview &&
        (summary.preview.length === 0 || (leaf.lastOutputAt ?? -1) >= (previousLastOutputAt ?? -1))
      ) {
        summary.preview = leaf.preview
      }
    }

    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (!pty.connected || countedPtyIds.has(pty.ptyId)) {
        continue
      }
      const summary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        pty.worktreeId
      )
      if (!summary) {
        continue
      }
      const previousLastOutputAt = summary.lastOutputAt
      summary.liveTerminalCount += 1
      summary.hasAttachedPty = true
      summary.hasHostSidebarActivity = true
      summary.lastOutputAt = maxTimestamp(summary.lastOutputAt, pty.lastOutputAt)
      summary.status = mergeWorktreeStatus(summary.status, 'active')
      if (
        pty.preview &&
        (summary.preview.length === 0 || (pty.lastOutputAt ?? -1) >= (previousLastOutputAt ?? -1))
      ) {
        summary.preview = pty.preview
      }
    }

    const session = this.store?.getWorkspaceSession?.()
    for (const worktreeId of session?.activeWorktreeIdsOnShutdown ?? []) {
      const summary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        worktreeId
      )
      if (summary) {
        // Why: desktop advertises deferred reattach ids as live before their
        // panes mount; mobile must preserve the same startup activity view.
        summary.hasHostSidebarActivity = true
      }
    }
    for (const [worktreeId, tabs] of Object.entries(session?.tabsByWorktree ?? {})) {
      if (tabs.length === 0) {
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
      // Why: desktop can show terminal tabs that are not mounted as renderer
      // leaves and are not currently visible in the PTY provider list. Mobile
      // still needs those worktrees to show as terminal-bearing entries.
      summary.liveTerminalCount = Math.max(summary.liveTerminalCount, tabs.length)
      summary.hasAttachedPty = summary.hasAttachedPty || tabs.some((tab) => tab.ptyId !== null)
      if (
        tabs.some(
          (tab) => tab.ptyId !== null && this.terminalSessions.getPtyRecord(tab.ptyId)?.connected
        )
      ) {
        summary.hasHostSidebarActivity = true
      }
      for (const tab of tabs) {
        summary.status = mergeWorktreeStatus(
          summary.status,
          getSavedTabWorktreeStatus(tab.title, tab.ptyId !== null)
        )
      }
    }

    for (const [worktreeId, tabs] of Object.entries(session?.browserTabsByWorktree ?? {})) {
      if (tabs.length === 0) {
        continue
      }
      const summary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        worktreeId
      )
      if (summary) {
        // Why: desktop's sleeping predicate treats any open browser workspace
        // as active, so the mobile host projection must preserve that parity.
        summary.hasHostSidebarActivity = true
      }
    }

    // Why: surface the desktop's focused worktree so mobile can scroll it into
    // view and highlight it. Resolve through getSummaryForRuntimeWorktreeId so
    // runtime-projected path ids match the same way tabsByWorktree does.
    if (session?.activeWorktreeId) {
      const activeSummary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        session.activeWorktreeId
      )
      if (activeSummary) {
        activeSummary.isActive = true
      }
    }

    const mirroredWorktreeIdByTabId = new Map<string, string>()
    for (const [worktreeId, tabs] of Object.entries(session?.tabsByWorktree ?? {})) {
      for (const tab of tabs) {
        mirroredWorktreeIdByTabId.set(tab.id, worktreeId)
      }
    }
    // Why: a live renderer graph may precede persistence, but persisted tab
    // ownership wins when an automatic workspace rename has already rekeyed it.
    for (const tab of this.terminalSessions.listGraphTabs()) {
      if (!mirroredWorktreeIdByTabId.has(tab.tabId)) {
        mirroredWorktreeIdByTabId.set(tab.tabId, tab.worktreeId)
      }
    }

    this.attachAgentRowsToSummaries(
      summaries,
      runtimeWorktreeSummaryPathIndex,
      missingRuntimeWorktreeIds,
      mirroredWorktreeIdByTabId
    )

    const sorted = [...summaries.values()].sort(compareWorktreePs)
    const visibleWorktrees =
      clientKind === 'mobile'
        ? sorted.map((summary) => compactWorktreePsForMobile(summary))
        : sorted
    return {
      worktrees: visibleWorktrees.slice(0, limit),
      totalCount: visibleWorktrees.length,
      truncated: visibleWorktrees.length > limit
    }
  }

  // Why: maps the retained per-pane agent snapshots into each worktree's inline
  // agent list, mirroring the desktop sidebar. Lineage parent is resolved from
  // the orchestration db (paneKey-keyed), not the OSC payload, since spawn
  // hierarchy is pane-level state tracked separately from terminal output.
}
