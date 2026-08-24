import type { RuntimeTerminalSummary } from '~shared/runtime-types'

import type { RuntimeLeafRecord } from '../model/terminal-records'
import type { ResolvedWorktree } from '../model/worktree-resolution'
import { getLatestLeafTitle } from '../model/worktree-status'
import { RuntimeTerminalWorktreeSummaryResolution } from './worktree-summary-resolution'

export abstract class RuntimeTerminalBuildTerminalSummary extends RuntimeTerminalWorktreeSummaryResolution {
  protected buildTerminalSummary(
    leaf: RuntimeLeafRecord,
    worktreesById: Map<string, ResolvedWorktree>
  ): RuntimeTerminalSummary {
    const worktree = worktreesById.get(leaf.worktreeId)
    const tab = this.terminalSessions.getGraphTab(leaf.tabId) ?? null

    return {
      handle: this.issueHandle(leaf),
      ptyId: leaf.ptyId,
      worktreeId: leaf.worktreeId,
      worktreeInstanceId: leaf.ptyId
        ? (this.terminalSessions.getPtyRecord(leaf.ptyId)?.worktreeInstanceId ?? null)
        : null,
      worktreePath: worktree?.path ?? '',
      branch: worktree?.branch ?? '',
      tabId: leaf.tabId,
      leafId: leaf.leafId,
      title: getLatestLeafTitle(leaf, tab?.title ?? null),
      connected: leaf.connected,
      writable: leaf.writable,
      lastOutputAt: leaf.lastOutputAt,
      preview: leaf.preview
    }
  }
}
