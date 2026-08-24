import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import type {
  DetectedWorktreeListResult,
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode,
  LocalBaseRefRefreshResult,
  FolderWorkspace,
  Worktree,
  WorktreeLineage
} from '~shared/types'

import type { WorktreeWithLineage } from './worktree-host-model'

export const REMOTE_WORKTREE_LIST_PARITY_LIMIT = 10_000
export const WORKTREE_REMOVAL_AMBIGUOUS_ERROR =
  'Workspace identity is ambiguous across hosts. Refresh projects and try again.'
export const ACTIVE_WORKTREE_TERMINAL_PREP_DELAY_MS = 300
export const ACTIVE_WORKTREE_TERMINAL_PREP_INPUT_QUIET_MS = 450
export const ACTIVE_WORKTREE_TERMINAL_PREP_IDLE_TIMEOUT_MS = 180
// Why: each repo's `git worktree list` is an independent main-process child, so
// a higher ceiling cuts startup scan batches (#7225) while staying bounded so
// one UI moment can't launch every git probe at once.
export const WORKTREE_REFRESH_CONCURRENCY = 8
export const pendingActivationTerminalPrepCancels = new Map<string, () => void>()
export const detachedHeadAutoDerivedDisplayNames = new Map<string, string>()
export const folderWorkspaceWorktreeCache = new WeakMap<FolderWorkspace, Worktree>()
export const hostedReviewPushTargetLookupsInFlight = new Set<string>()
export const detectedWorktreeRefreshesInFlight = new Map<
  string,
  Promise<DetectedWorktreeListResult>
>()

export type BackgroundRuntimeRefreshOptions = {
  reuseRecentCompatibilityFailure?: boolean
}

export async function mapReposForWorktreeRefresh<TRepo extends { id: string }, TResult>(
  repos: readonly TRepo[],
  mapper: (repo: TRepo) => Promise<TResult>
): Promise<TResult[]> {
  const results = Array<TResult>(repos.length)
  let nextIndex = 0
  const workerCount = Math.min(WORKTREE_REFRESH_CONCURRENCY, repos.length)

  // Why: worktree refresh can be triggered during activation/startup. Keeping
  // repo scans bounded avoids one UI moment launching every git probe at once.
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < repos.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await mapper(repos[index])
      }
    })
  )

  return results
}

export function countTerminalLayoutLeaves(node: TerminalPaneLayoutNode | null | undefined): number {
  if (!node) {
    return 0
  }
  if (node.type === 'leaf') {
    return 1
  }
  return countTerminalLayoutLeaves(node.first) + countTerminalLayoutLeaves(node.second)
}

export function getActivationSpawnSuppression(
  layout: TerminalLayoutSnapshot | undefined
): true | number {
  const paneCount = Math.max(
    1,
    countTerminalLayoutLeaves(layout?.root),
    Object.keys(layout?.ptyIdsByLeafId ?? {}).length
  )
  return paneCount === 1 ? true : paneCount
}

export function shouldDeferActivationTerminalPrep(): boolean {
  return typeof window !== 'undefined' && import.meta.env.MODE !== 'test'
}

export function publishLocalBaseRefRefreshResult(
  result: LocalBaseRefRefreshResult | undefined
): void {
  if (!result || result.status === 'updated') {
    return
  }
  publishRendererCommandResult({ type: 'worktree-local-base-ref-refresh', result })
}

export function arraysShallowEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b || a.length !== b.length) {
    return !a?.length && !b?.length
  }
  return a.every((v, i) => v === b[i])
}

export function areLineageRecordsEqual(
  a: WorktreeLineage | null | undefined,
  b: WorktreeLineage | null | undefined
): boolean {
  if (!a || !b) {
    return !a && !b
  }
  return (
    a.worktreeId === b.worktreeId &&
    a.worktreeInstanceId === b.worktreeInstanceId &&
    a.parentWorktreeId === b.parentWorktreeId &&
    a.parentWorktreeInstanceId === b.parentWorktreeInstanceId &&
    a.origin === b.origin &&
    a.capture.source === b.capture.source &&
    a.capture.confidence === b.capture.confidence &&
    a.orchestrationRunId === b.orchestrationRunId &&
    a.taskId === b.taskId &&
    a.coordinatorHandle === b.coordinatorHandle &&
    a.createdByTerminalHandle === b.createdByTerminalHandle &&
    a.createdAt === b.createdAt
  )
}

export function areWorktreesEqual(current: Worktree[] | undefined, next: Worktree[]): boolean {
  if (!current || current.length !== next.length) {
    return false
  }

  return current.every((worktree, index) => {
    const candidate = next[index]
    return (
      worktree.id === candidate.id &&
      worktree.instanceId === candidate.instanceId &&
      worktree.repoId === candidate.repoId &&
      worktree.projectId === candidate.projectId &&
      worktree.hostId === candidate.hostId &&
      worktree.projectHostSetupId === candidate.projectHostSetupId &&
      worktree.path === candidate.path &&
      worktree.head === candidate.head &&
      worktree.branch === candidate.branch &&
      worktree.isBare === candidate.isBare &&
      worktree.isMainWorktree === candidate.isMainWorktree &&
      worktree.isSparse === candidate.isSparse &&
      worktree.displayName === candidate.displayName &&
      worktree.comment === candidate.comment &&
      worktree.linkedPR === candidate.linkedPR &&
      worktree.linkedGitLabMR === candidate.linkedGitLabMR &&
      worktree.linkedBitbucketPR === candidate.linkedBitbucketPR &&
      worktree.linkedAzureDevOpsPR === candidate.linkedAzureDevOpsPR &&
      worktree.linkedGiteaPR === candidate.linkedGiteaPR &&
      worktree.isArchived === candidate.isArchived &&
      worktree.isUnread === candidate.isUnread &&
      worktree.isPinned === candidate.isPinned &&
      worktree.sortOrder === candidate.sortOrder &&
      worktree.manualOrder === candidate.manualOrder &&
      worktree.lastActivityAt === candidate.lastActivityAt &&
      worktree.workspaceStatus === candidate.workspaceStatus &&
      worktree.createdWithAgent === candidate.createdWithAgent &&
      worktree.pendingFirstAgentMessageRename === candidate.pendingFirstAgentMessageRename &&
      worktree.firstAgentMessageRenameError === candidate.firstAgentMessageRenameError &&
      worktree.baseRef === candidate.baseRef &&
      worktree.pushTarget?.remoteName === candidate.pushTarget?.remoteName &&
      worktree.pushTarget?.branchName === candidate.pushTarget?.branchName &&
      worktree.pushTarget?.remoteUrl === candidate.pushTarget?.remoteUrl &&
      worktree.sparseBaseRef === candidate.sparseBaseRef &&
      arraysShallowEqual(worktree.sparseDirectories, candidate.sparseDirectories) &&
      arraysShallowEqual(worktree.priorWorktreeIds, candidate.priorWorktreeIds) &&
      (worktree as WorktreeWithLineage).parentWorktreeId ===
        (candidate as WorktreeWithLineage).parentWorktreeId &&
      arraysShallowEqual(
        (worktree as WorktreeWithLineage).childWorktreeIds,
        (candidate as WorktreeWithLineage).childWorktreeIds
      ) &&
      areLineageRecordsEqual(
        (worktree as WorktreeWithLineage).lineage,
        (candidate as WorktreeWithLineage).lineage
      )
    )
  })
}

export function areDetectedWorktreeResultsEqual(
  current: DetectedWorktreeListResult | undefined,
  next: DetectedWorktreeListResult
): boolean {
  return Boolean(
    current &&
    current.repoId === next.repoId &&
    current.authoritative === next.authoritative &&
    current.source === next.source &&
    areWorktreesEqual(current.worktrees, next.worktrees) &&
    current.worktrees.every((worktree, index) => {
      const candidate = next.worktrees[index]
      return (
        worktree.ownership === candidate.ownership &&
        worktree.selectedCheckout === candidate.selectedCheckout &&
        worktree.visible === candidate.visible
      )
    })
  )
}
