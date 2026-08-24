import type { RuntimeTerminalListResult, RuntimeTerminalSummary } from '~shared/runtime-types'

import { DEFAULT_TERMINAL_LIST_LIMIT } from '../model/runtime-limits'
import type { RuntimeLeafRecord } from '../model/terminal-records'
import { includeTargetResolvedWorktree } from '../model/worktree-identity'
import { RuntimeTerminalApplyMobileDisplayMode } from './apply-mobile-display-mode'

export abstract class RuntimeTerminalFailActiveDispatchOnExit extends RuntimeTerminalApplyMobileDisplayMode {
  protected failActiveDispatchOnExit(leaf: RuntimeLeafRecord, exitCode: number): void {
    if (!this._orchestrationDb) {
      return
    }

    const handle = this.terminalSessions.getTerminalHandleForLeafKey(
      this.getLeafKey(leaf.tabId, leaf.leafId)
    )
    if (!handle) {
      return
    }

    const dispatch = this._orchestrationDb.getActiveDispatchForTerminal(handle)
    if (!dispatch) {
      return
    }

    const errorContext = `Agent exited with code ${exitCode}`
    this._orchestrationDb.failDispatch(dispatch.id, errorContext)

    // Why: create an escalation message so the coordinator is notified about
    // the unexpected exit on its next check cycle, even if the circuit breaker
    // hasn't tripped yet.
    const run = this._orchestrationDb.getActiveCoordinatorRun()
    if (run) {
      this._orchestrationDb.insertMessage({
        from: handle,
        to: run.coordinator_handle,
        subject: `Agent exited unexpectedly (code ${exitCode})`,
        type: 'escalation',
        priority: 'high',
        payload: JSON.stringify({
          taskId: dispatch.task_id,
          exitCode,
          handle
        })
      })
    }
  }

  async listTerminals(
    worktreeSelector?: string,
    limit = DEFAULT_TERMINAL_LIST_LIMIT,
    opts: { requireFreshPtyLiveness?: boolean } = {}
  ): Promise<RuntimeTerminalListResult> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('invalid_limit')
    }
    const graphEpoch =
      this.terminalSessions.getGraphStatus() === 'ready'
        ? this.terminalSessions.getGraphEpoch()
        : null
    const explicitTargetWorktreeId = worktreeSelector
      ? this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
      : null
    const initialResolvedWorktreeCache = this.resolvedWorktreeCache
    const cachedResolvedWorktrees =
      initialResolvedWorktreeCache && initialResolvedWorktreeCache.expiresAt > Date.now()
        ? initialResolvedWorktreeCache.worktrees
        : null
    const cachedExplicitTargetWorktree =
      explicitTargetWorktreeId && cachedResolvedWorktrees
        ? (cachedResolvedWorktrees.find((worktree) => worktree.id === explicitTargetWorktreeId) ??
          null)
        : null
    const parsedExplicitTargetWorktree =
      explicitTargetWorktreeId && !cachedExplicitTargetWorktree
        ? this.buildResolvedWorktreeFromId(explicitTargetWorktreeId)
        : null
    const targetWorktree =
      worktreeSelector && !explicitTargetWorktreeId
        ? await this.resolveWorktreeSelector(worktreeSelector)
        : (cachedExplicitTargetWorktree ?? parsedExplicitTargetWorktree)
    const targetWorktreeId = explicitTargetWorktreeId ?? targetWorktree?.id ?? null
    const classificationResolvedWorktreeCache = this.resolvedWorktreeCache
    const classificationResolvedWorktrees =
      targetWorktreeId &&
      classificationResolvedWorktreeCache &&
      classificationResolvedWorktreeCache.expiresAt > Date.now()
        ? includeTargetResolvedWorktree(
            classificationResolvedWorktreeCache.worktrees,
            targetWorktree
          )
        : targetWorktreeId && explicitTargetWorktreeId
          ? this.listKnownResolvedWorktreesForExplicitTarget(targetWorktreeId, targetWorktree)
          : null
    const worktreesById =
      targetWorktreeId && targetWorktree
        ? new Map([[targetWorktree.id, targetWorktree]])
        : targetWorktreeId
          ? new Map()
          : await this.getResolvedWorktreeMap()
    if (graphEpoch !== null) {
      this.assertStableReadyGraph(graphEpoch)
    }

    const resolvedWorktrees =
      targetWorktreeId && classificationResolvedWorktrees
        ? classificationResolvedWorktrees
        : targetWorktreeId && targetWorktree
          ? [targetWorktree]
          : targetWorktreeId
            ? []
            : [...worktreesById.values()]
    const refreshedPtyLiveness = await this.refreshPtyWorktreeRecordsFromController(
      resolvedWorktrees,
      targetWorktreeId
    )
    if (opts.requireFreshPtyLiveness && !refreshedPtyLiveness) {
      throw new Error('terminal_liveness_unavailable')
    }

    const livePtyWorktreeIds = new Set<string>()
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (pty.connected) {
        livePtyWorktreeIds.add(pty.worktreeId)
      }
    }

    const terminals: RuntimeTerminalSummary[] = []
    const ptyIdsFromLeaves = new Set<string>()
    if (graphEpoch !== null) {
      for (const leaf of this.terminalSessions.listGraphLeaves()) {
        if (targetWorktreeId && leaf.worktreeId !== targetWorktreeId) {
          continue
        }
        if (opts.requireFreshPtyLiveness && leaf.ptyId && !refreshedPtyLiveness?.has(leaf.ptyId)) {
          continue
        }
        if (!leaf.ptyId && livePtyWorktreeIds.has(leaf.worktreeId)) {
          continue
        }
        if (leaf.ptyId) {
          ptyIdsFromLeaves.add(leaf.ptyId)
        }
        terminals.push(this.buildTerminalSummary(leaf, worktreesById))
      }
    }

    // Why: worktree.ps can classify active worktrees from PTY records even when
    // the renderer graph is missing a leaf. terminal.list needs the same fallback
    // so mobile does not show a false "No terminals" create flow.
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (!pty.connected || ptyIdsFromLeaves.has(pty.ptyId)) {
        continue
      }
      if (opts.requireFreshPtyLiveness && !refreshedPtyLiveness?.has(pty.ptyId)) {
        continue
      }
      if (targetWorktreeId && pty.worktreeId !== targetWorktreeId) {
        continue
      }
      terminals.push(this.buildPtyTerminalSummary(pty, worktreesById))
    }

    const listedTerminals = terminals.slice(0, limit)
    const visualLayouts = this.buildTerminalVisualLayouts(
      listedTerminals,
      worktreesById,
      targetWorktreeId
    )

    return {
      terminals: listedTerminals,
      ...(visualLayouts.length > 0 ? { visualLayouts } : {}),
      totalCount: terminals.length,
      truncated: terminals.length > limit
    }
  }
}
