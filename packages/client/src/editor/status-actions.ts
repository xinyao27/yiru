import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'

import {
  branchCompareMatchesStatusHead,
  createLoadingBranchCompareSummary,
  getKnownGitHead
} from './branch-compare-policy'
import {
  areGitStatusEntriesEqual,
  areTrackedConflictMapsEqual,
  areUpstreamStatusesEqual,
  reconcileOpenFilesForStatus
} from './git-status-reconciliation'
import type { EditorGitSlice } from './git-store'
import type { EditorSlice } from './store-contract'

type EditorStatusActions = Pick<
  EditorGitSlice,
  | 'editorCursorLine'
  | 'setEditorCursorLine'
  | 'gitStatusByWorktree'
  | 'gitStatusHeadByWorktree'
  | 'gitStatusHugeByWorktree'
  | 'gitIgnoredPathsByWorktree'
  | 'gitConflictOperationByWorktree'
  | 'trackedConflictPathsByWorktree'
  | 'trackConflictPath'
  | 'setGitStatus'
  | 'setConflictOperation'
  | 'remoteStatusesByWorktree'
  | 'setUpstreamStatus'
>

export function createEditorStatusActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorStatusActions {
  return {
    editorCursorLine: {},
    setEditorCursorLine: (fileId, line) =>
      set((s) => ({
        editorCursorLine: { ...s.editorCursorLine, [fileId]: line }
      })),

    // Git status
    gitStatusByWorktree: {},
    gitStatusHeadByWorktree: {},
    gitStatusHugeByWorktree: {},
    gitIgnoredPathsByWorktree: {},
    gitConflictOperationByWorktree: {},
    trackedConflictPathsByWorktree: {},
    trackConflictPath: (worktreeId, path, conflictKind) =>
      set((s) => {
        const nextTracked = {
          ...s.trackedConflictPathsByWorktree[worktreeId],
          [path]: conflictKind
        }
        return {
          trackedConflictPathsByWorktree: {
            ...s.trackedConflictPathsByWorktree,
            [worktreeId]: nextTracked
          }
        }
      }),
    // Why: session-local conflict tracking (trackedConflictPaths, Resolved locally
    // state) lives entirely in the renderer and never crosses the IPC boundary.
    // The main process returns only what `git status` reports. The renderer is
    // responsible for setting conflictStatusSource ('git' for live u-records,
    // 'session' for Resolved locally) and for all Resolved locally lifecycle.
    setGitStatus: (worktreeId, status) =>
      set((s) => {
        const hadStatusEntry = Object.prototype.hasOwnProperty.call(
          s.gitStatusByWorktree,
          worktreeId
        )
        const prevEntries = s.gitStatusByWorktree[worktreeId] ?? []
        const prevOperation = s.gitConflictOperationByWorktree[worktreeId] ?? 'unknown'
        const currentTracked = { ...s.trackedConflictPathsByWorktree[worktreeId] }
        // Why: conflictStatusSource is NOT set by the main process. The renderer
        // stamps 'git' here for live u-records, and 'session' below when applying
        // Resolved locally state. This keeps the main process free of session
        // awareness while letting the renderer distinguish the two sources.
        const normalizedEntries = status.entries.map((entry) =>
          entry.conflictStatus === 'unresolved'
            ? { ...entry, conflictStatusSource: 'git' as const }
            : entry
        )
        const unresolvedEntries = normalizedEntries.filter(
          (entry) => entry.conflictStatus === 'unresolved' && entry.conflictKind
        )
        const unresolvedByPath = new Map(unresolvedEntries.map((entry) => [entry.path, entry]))

        // Why: when the operation is aborted (git merge --abort, etc.), all u-records
        // disappear and the HEAD file is cleaned up simultaneously. We detect this as
        // the operation transitioning to 'unknown' with zero unresolved entries. In
        // this case we clear the entire trackedConflictPaths set rather than
        // transitioning each path to Resolved locally — abort is NOT resolution, and
        // showing "Resolved locally" on every previously-conflicted file after an
        // abort would be misleading.
        if (
          status.conflictOperation === 'unknown' &&
          prevOperation !== 'unknown' &&
          unresolvedByPath.size === 0
        ) {
          for (const path of Object.keys(currentTracked)) {
            delete currentTracked[path]
          }
        }

        const nextEntries = normalizedEntries.map((entry) => {
          if (entry.conflictStatus === 'unresolved') {
            return entry
          }
          const trackedConflictKind = currentTracked[entry.path]
          if (!trackedConflictKind) {
            return entry
          }
          return {
            ...entry,
            conflictKind: trackedConflictKind,
            conflictStatus: 'resolved_locally' as const,
            conflictStatusSource: 'session' as const
          }
        })

        const visiblePaths = new Set(nextEntries.map((entry) => entry.path))
        for (const path of Object.keys(currentTracked)) {
          if (!visiblePaths.has(path) && !unresolvedByPath.has(path)) {
            delete currentTracked[path]
          }
        }

        const nextOpenFiles = reconcileOpenFilesForStatus(s.openFiles, worktreeId, nextEntries)
        const statusUnchanged = hadStatusEntry && areGitStatusEntriesEqual(prevEntries, nextEntries)
        const trackedUnchanged = areTrackedConflictMapsEqual(
          s.trackedConflictPathsByWorktree[worktreeId] ?? {},
          currentTracked
        )
        const openFilesUnchanged = nextOpenFiles === s.openFiles
        const operationUnchanged = prevOperation === status.conflictOperation

        const prevIgnored = s.gitIgnoredPathsByWorktree[worktreeId]
        const nextIgnored = status.ignoredPaths ?? []
        const ignoredUnchanged =
          prevIgnored !== undefined &&
          prevIgnored.length === nextIgnored.length &&
          prevIgnored.every((p, i) => p === nextIgnored[i])

        const prevHuge = s.gitStatusHugeByWorktree[worktreeId]
        const nextHuge = status.didHitLimit ? { limit: nextEntries.length } : undefined
        const hugeUnchanged = (prevHuge?.limit ?? null) === (nextHuge?.limit ?? null)
        const prevStatusHead = s.gitStatusHeadByWorktree[worktreeId]
        const nextStatusHead = getKnownGitHead(status.head)
        const statusHeadUnchanged = prevStatusHead === nextStatusHead

        const prevBranchSummary = s.gitBranchCompareSummaryByWorktree[worktreeId]
        // Why: a compare request can finish after git status has observed a new
        // HEAD; reject that stale snapshot before it can render a false clean state.
        const shouldInvalidateBranchCompare =
          !statusHeadUnchanged &&
          nextStatusHead !== undefined &&
          prevBranchSummary?.status === 'ready' &&
          !branchCompareMatchesStatusHead(prevBranchSummary, nextStatusHead)

        if (
          statusUnchanged &&
          trackedUnchanged &&
          openFilesUnchanged &&
          operationUnchanged &&
          ignoredUnchanged &&
          hugeUnchanged &&
          statusHeadUnchanged &&
          !shouldInvalidateBranchCompare
        ) {
          return s
        }

        const nextHugeMap = hugeUnchanged
          ? s.gitStatusHugeByWorktree
          : nextHuge
            ? { ...s.gitStatusHugeByWorktree, [worktreeId]: nextHuge }
            : (() => {
                const copy = { ...s.gitStatusHugeByWorktree }
                delete copy[worktreeId]
                return copy
              })()

        const nextStatusHeadMap = statusHeadUnchanged
          ? s.gitStatusHeadByWorktree
          : nextStatusHead
            ? { ...s.gitStatusHeadByWorktree, [worktreeId]: nextStatusHead }
            : (() => {
                const copy = { ...s.gitStatusHeadByWorktree }
                delete copy[worktreeId]
                return copy
              })()
        const nextBranchCompareSummaries = shouldInvalidateBranchCompare
          ? {
              ...s.gitBranchCompareSummaryByWorktree,
              [worktreeId]: createLoadingBranchCompareSummary(prevBranchSummary.baseRef)
            }
          : s.gitBranchCompareSummaryByWorktree
        const nextBranchChanges = shouldInvalidateBranchCompare
          ? { ...s.gitBranchChangesByWorktree, [worktreeId]: [] }
          : s.gitBranchChangesByWorktree

        return {
          openFiles: nextOpenFiles,
          gitStatusHugeByWorktree: nextHugeMap,
          gitStatusHeadByWorktree: nextStatusHeadMap,
          gitStatusByWorktree: statusUnchanged
            ? s.gitStatusByWorktree
            : { ...s.gitStatusByWorktree, [worktreeId]: nextEntries },
          gitIgnoredPathsByWorktree: ignoredUnchanged
            ? s.gitIgnoredPathsByWorktree
            : { ...s.gitIgnoredPathsByWorktree, [worktreeId]: nextIgnored },
          gitConflictOperationByWorktree: operationUnchanged
            ? s.gitConflictOperationByWorktree
            : { ...s.gitConflictOperationByWorktree, [worktreeId]: status.conflictOperation },
          trackedConflictPathsByWorktree: trackedUnchanged
            ? s.trackedConflictPathsByWorktree
            : { ...s.trackedConflictPathsByWorktree, [worktreeId]: currentTracked },
          gitBranchCompareSummaryByWorktree: nextBranchCompareSummaries,
          gitBranchChangesByWorktree: nextBranchChanges
        }
      }),
    setConflictOperation: (worktreeId, operation) =>
      set((s) => {
        const prev = s.gitConflictOperationByWorktree[worktreeId] ?? 'unknown'
        if (prev === operation) {
          return s
        }
        // Why: when the operation clears (transitions to 'unknown') on a non-active
        // worktree, we also need to clear tracked conflict paths — same as the
        // full setGitStatus handler does for the active worktree.
        const nextTracked =
          operation === 'unknown' && prev !== 'unknown'
            ? {}
            : s.trackedConflictPathsByWorktree[worktreeId]
        const trackedUnchanged = nextTracked === s.trackedConflictPathsByWorktree[worktreeId]
        return {
          gitConflictOperationByWorktree: {
            ...s.gitConflictOperationByWorktree,
            [worktreeId]: operation
          },
          ...(trackedUnchanged
            ? {}
            : {
                trackedConflictPathsByWorktree: {
                  ...s.trackedConflictPathsByWorktree,
                  [worktreeId]: nextTracked
                }
              })
        }
      }),
    remoteStatusesByWorktree: {},
    setUpstreamStatus: (worktreeId, status) =>
      set((s) => {
        if (areUpstreamStatusesEqual(s.remoteStatusesByWorktree[worktreeId], status)) {
          return s
        }
        return {
          remoteStatusesByWorktree: {
            ...s.remoteStatusesByWorktree,
            [worktreeId]: status
          }
        }
      })
  }
}
