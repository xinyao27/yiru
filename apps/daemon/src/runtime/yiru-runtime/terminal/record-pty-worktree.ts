import { parseSshPtyId } from '@yiru/runtime-protocol/terminal-identity/id'
import type { RuntimeSyncedLeaf } from '@yiru/runtime-protocol/workbench/runtime-types'
import { isTerminalLeafId, makePaneKey } from '@yiru/runtime-protocol/workbench/stable-pane-id'
import { advertisedUrlWatcher } from '~main/ports/advertised-url-watcher'

import { PTY_CONTROLLER_LIST_TIMEOUT_MS, withTimeoutResult } from '../model/runtime-limits'
import { maxTimestamp } from '../model/terminal-normalization'
import type { RuntimePtyWorktreeRecord } from '../model/terminal-records'
import {
  findResolvedWorktreeIdForPath,
  indexPersistedPtyWorktreeBindings,
  inferWorktreeIdFromPtyId
} from '../model/worktree-identity'
import type { ResolvedWorktree } from '../model/worktree-resolution'
import { RuntimeWorktreePruneLineageForMissingRepoWorktrees } from '../worktree/prune-lineage-for-missing-repo-worktrees'

export abstract class RuntimeTerminalRecordPtyWorktree extends RuntimeWorktreePruneLineageForMissingRepoWorktrees {
  protected recordPtyWorktree(
    ptyId: string,
    worktreeId: string,
    state: Partial<
      Pick<
        RuntimePtyWorktreeRecord,
        | 'connected'
        | 'lastOutputAt'
        | 'preview'
        | 'tabId'
        | 'paneKey'
        | 'title'
        | 'connectionId'
        | 'isWsl'
      >
    > = {}
  ): RuntimePtyWorktreeRecord {
    let pty = this.terminalSessions.getPtyRecord(ptyId)
    if (!pty) {
      const titleObservedAt = state.title ? this.nextTitleObservationSequence() : null
      pty = {
        ptyId,
        worktreeId,
        worktreeInstanceId: null,
        connectionId: state.connectionId ?? parseSshPtyId(ptyId)?.connectionId ?? null,
        isWsl: state.isWsl ?? null,
        tabId: state.tabId ?? null,
        paneKey: state.paneKey ?? null,
        launchConfig: null,
        launchToken: null,
        launchAgent: null,
        foregroundAgent: null,
        connected: state.connected ?? true,
        disconnectedAt: state.connected === false ? Date.now() : null,
        lastExitCode: null,
        lastAgentStatus: null,
        lastOscTitle: null,
        lastOscTitleAt: null,
        managementTitle: null,
        managementTitleAt: null,
        title: state.title ?? null,
        titleUpdatedAt: titleObservedAt,
        lastOutputAt: state.lastOutputAt ?? null,
        tailBuffer: [],
        tailPartialLine: '',
        tailPendingAnsi: '',
        tailRedrawCursor: null,
        tailTruncated: false,
        tailLinesTotal: 0,
        preview: state.preview ?? '',
        waitBlockedAt: null
      }
      if (state.title) {
        this.setPtyManagementTitleFromObservedTitle(pty, state.title, titleObservedAt ?? 0)
      }
      this.terminalSessions.commitPtyState(ptyId, { pty })
      // Why: restored/controller-discovered PTYs learn their worktree here
      // without registerPty(), so URL enrichment must bind at this source.
      advertisedUrlWatcher.bindPty(ptyId, worktreeId)
      return pty
    }

    if (pty.worktreeId !== worktreeId) {
      pty.worktreeId = worktreeId
      // Why: path/controller inference can relocate a PTY but cannot attest a new instance.
      pty.worktreeInstanceId = null
    }
    if (state.connectionId !== undefined) {
      pty.connectionId = state.connectionId
    }
    if (state.isWsl !== undefined) {
      pty.isWsl = state.isWsl
    }
    if (state.tabId !== undefined) {
      pty.tabId = state.tabId
    }
    if (state.paneKey !== undefined) {
      pty.paneKey = state.paneKey
    }
    if (state.connected !== undefined) {
      pty.connected = state.connected
      pty.disconnectedAt = state.connected ? null : (pty.disconnectedAt ?? Date.now())
    }
    if (state.lastOutputAt !== undefined) {
      pty.lastOutputAt = maxTimestamp(pty.lastOutputAt, state.lastOutputAt)
    }
    if (state.preview !== undefined && state.preview.length > 0) {
      pty.preview = state.preview
    }
    if (state.title !== undefined && state.title !== null && state.title.length > 0) {
      const observedAt = this.nextTitleObservationSequence()
      pty.title = state.title
      pty.titleUpdatedAt = observedAt
      this.setPtyManagementTitleFromObservedTitle(pty, state.title, observedAt)
    }
    this.terminalSessions.commitPtyState(ptyId, { pty })
    // Why: recordPtyWorktree is the common lifecycle point for every path that
    // resolves a PTY's worktree, including renderer restore and controller list.
    advertisedUrlWatcher.bindPty(ptyId, worktreeId)
    return pty
  }

  protected makeRuntimePaneKey(
    leaf: Pick<RuntimeSyncedLeaf, 'tabId' | 'leafId' | 'paneRuntimeId'>
  ): string {
    return isTerminalLeafId(leaf.leafId)
      ? makePaneKey(leaf.tabId, leaf.leafId)
      : `${leaf.tabId}:${leaf.paneRuntimeId}`
  }

  protected getOrCreatePtyWorktreeRecord(ptyId: string): RuntimePtyWorktreeRecord | null {
    const existing = this.terminalSessions.getPtyRecord(ptyId)
    if (existing) {
      return existing
    }
    const inferredWorktreeId = inferWorktreeIdFromPtyId(ptyId)
    if (!inferredWorktreeId) {
      return null
    }
    // Why: daemon-backed PTY session IDs are prefixed with the worktree ID so
    // mobile summaries survive client graph gaps and browser reloads.
    return this.recordPtyWorktree(ptyId, inferredWorktreeId)
  }

  /**
   * Synchronizes PTY tracking records with the running daemon sessions,
   * querying their foreground agent states.
   */

  protected async refreshPtyWorktreeRecordsFromController(
    resolvedWorktrees: ResolvedWorktree[],
    targetWorktreeId: string | null = null
  ): Promise<Set<string> | null> {
    if (!this.ptyController?.listProcesses) {
      return null
    }
    const sessionsResult = await withTimeoutResult(
      this.ptyController.listProcesses(),
      PTY_CONTROLLER_LIST_TIMEOUT_MS
    )
    if (!sessionsResult.ok) {
      // Why: a transient controller failure is not evidence that retained PTYs exited.
      return null
    }
    const sessions = sessionsResult.value
    const persistedWorktreeIdByPtyId = indexPersistedPtyWorktreeBindings(
      this.store?.getWorkspaceSession?.()
    )
    const livePtyIds = new Set(sessions.map((session) => session.id))
    for (const session of sessions) {
      this.adoptControllerTerminalHandle(session.id, session.terminalHandle)
      // Why: workspace identity migration rekeys persisted ownership while a
      // running daemon PTY keeps the worktree id minted into its session id.
      const worktreeId =
        persistedWorktreeIdByPtyId.get(session.id) ??
        inferWorktreeIdFromPtyId(session.id) ??
        findResolvedWorktreeIdForPath(resolvedWorktrees, session.cwd)
      if (targetWorktreeId && worktreeId !== targetWorktreeId) {
        continue
      }
      if (worktreeId) {
        this.recordPtyWorktree(session.id, worktreeId, {
          connected: true
        })
      }
      // Why: fire-and-forget so this listing hot path (listTerminals/getWorktreePs)
      // does not serialize a relay round-trip per session — and a throwing snapshot
      // listener cannot abort the liveness sweep below.
      this.refreshPtyForegroundAgent(session.id)
    }
    this.terminalSessions.markDisconnectedPtysUnless(livePtyIds, (ptyId) =>
      this.leafExistsForPty(ptyId)
    )
    this.pruneDisconnectedPtyRecords()
    return livePtyIds
  }
}
