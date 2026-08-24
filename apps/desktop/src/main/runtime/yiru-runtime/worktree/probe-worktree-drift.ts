import {
  getBaseRefDefault,
  getDefaultRemote,
  getRemoteDrift,
  getRecentDriftSubjects
} from '~main/git/repo'
import { gitExecFileAsync } from '~main/git/runner'
import { fetchPrHeadTrackingRef } from '~main/github/pr-head-tracking-ref'
import { resolveGitHubPrStartPoint } from '~main/github/pr-start-point'
import {
  getLocalProjectGitExecOptions,
  getLocalProjectWorktreeGitOptions
} from '~main/project-runtime-git-options'
import { stripYiruProvenanceMetaUpdates } from '~main/worktree-removal-safety'
import { persistExistingWorktreeSortOrder } from '~main/worktree-sort-order-persistence'
import { isFolderRepo } from '~shared/repo-kind'
import type { GitHubPrStartPoint, GitPushTarget, Repo, WorktreeMeta } from '~shared/types'
import { worktreeWorkspaceKey } from '~shared/workspace/scope'

import { DRIFT_PROBE_SUBJECT_LIMIT } from '../model/runtime-limits'
import { RuntimeLineageError } from '../model/worktree-resolution'
import { findLocalRepoById, omitUndefinedProperties } from '../model/worktree-storage'
import { RuntimeWorktreeReconcileWorktreeBaseStatus } from './reconcile-worktree-base-status'

export abstract class RuntimeWorktreeProbeWorktreeDrift extends RuntimeWorktreeReconcileWorktreeBaseStatus {
  async probeWorktreeDrift(worktreeSelector: string): Promise<{
    base: string
    behind: number
    recentSubjects: string[]
  } | null> {
    const wt = await this.resolveWorktreeSelector(worktreeSelector)
    if (!this.store) {
      return null
    }
    const repo = findLocalRepoById(this.store, wt.repoId)
    if (!repo) {
      return null
    }
    const localGitExecOptions = getLocalProjectGitExecOptions(this.requireStore(), repo)
    const localWorktreeGitOptions = getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
    const meta = this.store.getWorktreeMeta(wt.id)
    const base =
      meta?.baseRef ||
      meta?.sparseBaseRef ||
      repo.worktreeBaseRef ||
      (await getBaseRefDefault(repo.path, localWorktreeGitOptions))
    if (!base) {
      // Why: brand-new repo with no remote primary — nothing to compare
      // against, so there's no meaningful drift to report. Dispatch should
      // not block on a probe that cannot form an opinion.
      return null
    }
    const remoteTrackingBase = await this.resolveRemoteTrackingBase(
      repo.path,
      base,
      localWorktreeGitOptions
    )
    if (!remoteTrackingBase) {
      return null
    }
    const remote = remoteTrackingBase.remote
    // Why: fetch failures are non-fatal; we proceed with whatever the
    // last-known remote ref points at. `fetchRemoteWithCache` never throws.
    await this.fetchRemoteWithCache(repo.path, remote, localWorktreeGitOptions)
    const drift = getRemoteDrift(wt.path, 'HEAD', base, localGitExecOptions)
    if (!drift) {
      return null
    }
    const recentSubjects = getRecentDriftSubjects(
      wt.path,
      'HEAD',
      base,
      DRIFT_PROBE_SUBJECT_LIMIT,
      localGitExecOptions
    )
    return { base, behind: drift.behind, recentSubjects }
  }

  async updateManagedWorktreeMeta(
    worktreeSelector: string,
    updates: Omit<Partial<WorktreeMeta>, 'pushTarget'> & {
      pushTarget?: GitPushTarget | null
      lineage?: {
        parentWorktree?: string
        noParent?: boolean
      }
    }
  ) {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    const { lineage, ...metaUpdates } = updates
    const shouldClearPushTarget =
      Object.prototype.hasOwnProperty.call(metaUpdates, 'pushTarget') &&
      metaUpdates.pushTarget === null
    const normalizedMetaUpdates: Partial<WorktreeMeta> = shouldClearPushTarget
      ? { ...metaUpdates, pushTarget: undefined }
      : (metaUpdates as Partial<WorktreeMeta>)
    const persistedMetaUpdates: Partial<WorktreeMeta> = omitUndefinedProperties(
      normalizedMetaUpdates.displayName !== undefined
        ? {
            ...normalizedMetaUpdates,
            pendingFirstAgentMessageRename: false,
            firstAgentMessageRenameError: null
          }
        : normalizedMetaUpdates
    )
    if (shouldClearPushTarget) {
      // Why: omitUndefinedProperties protects ordinary optional RPC fields, but
      // pushTarget:null is an explicit request to remove persisted target metadata.
      persistedMetaUpdates.pushTarget = undefined
    }
    if (lineage?.noParent === true) {
      this.store.removeWorktreeLineage?.(worktree.id)
      this.store.removeWorkspaceLineage?.(worktreeWorkspaceKey(worktree.id))
    } else if (lineage?.parentWorktree) {
      const parent = await this.resolveWorktreeSelector(lineage.parentWorktree)

      this.validateLineageParent(worktree, parent)
      if (!worktree.instanceId || !parent.instanceId) {
        throw new RuntimeLineageError(
          'LINEAGE_PARENT_CONTEXT_MISSING',
          'Worktree instance identity was unavailable.'
        )
      }
      if (!this.store.setWorktreeLineage) {
        throw new RuntimeLineageError(
          'LINEAGE_PARENT_CONTEXT_MISSING',
          'Worktree lineage storage was unavailable.'
        )
      }
      const createdAt = Date.now()
      this.store.setWorktreeLineage(worktree.id, {
        worktreeId: worktree.id,
        worktreeInstanceId: worktree.instanceId,
        parentWorktreeId: parent.id,
        parentWorktreeInstanceId: parent.instanceId,
        origin: 'manual',
        capture: { source: 'manual-action', confidence: 'explicit' },
        createdAt
      })
      this.store.setWorkspaceLineage?.({
        childWorkspaceKey: worktreeWorkspaceKey(worktree.id),
        childInstanceId: worktree.instanceId,
        parentWorkspaceKey: worktreeWorkspaceKey(parent.id),
        parentInstanceId: parent.instanceId,
        origin: 'manual',
        capture: { source: 'manual-action', confidence: 'explicit' },
        createdAt
      })
    }
    this.store.setWorktreeMeta(worktree.id, stripYiruProvenanceMetaUpdates(persistedMetaUpdates))
    // Why: unlike renderer-initiated optimistic updates, CLI callers need an
    // explicit push so the editor refreshes metadata changed outside the UI.
    this.invalidateResolvedWorktreeCache()
    this.notifyWorktreesChanged(worktree.repoId)
    return await this.showManagedWorktree(`id:${worktree.id}`)
  }

  persistManagedWorktreeSortOrder(
    orderedIds: string[],
    options: { notifyClients?: boolean } = {}
  ): { updated: number } {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const updated = persistExistingWorktreeSortOrder(this.store, orderedIds)
    if (options.notifyClients !== false) {
      this.invalidateResolvedWorktreeCache()
      this.notifyReposChanged()
    }
    return { updated }
  }

  async resolveManagedPrBase(args: {
    repoSelector: string
    prNumber: number
    headRefName?: string
    baseRefName?: string
    isCrossRepository?: boolean
  }): Promise<GitHubPrStartPoint | { error: string }> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    let repo: Repo
    try {
      repo = await this.resolveRepoSelector(args.repoSelector)
    } catch {
      return { error: 'Repo not found' }
    }
    if (isFolderRepo(repo)) {
      return { error: 'Folder mode does not support creating worktrees.' }
    }
    const localGitExecOptions = getLocalProjectGitExecOptions(this.requireStore(), repo)
    const localWorktreeGitOptions = getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
    const gitExec = (gitArgs: string[]) => gitExecFileAsync(gitArgs, localGitExecOptions)
    const resolveRemote = () => getDefaultRemote(repo.path, localWorktreeGitOptions)
    const fetchRemoteTrackingRef = (remote: string, branch: string): Promise<void> =>
      fetchPrHeadTrackingRef(repo, remote, branch, { localGitExecOptions })

    return resolveGitHubPrStartPoint({
      repoPath: repo.path,
      prNumber: args.prNumber,
      headRefName: args.headRefName,
      baseRefName: args.baseRefName,
      isCrossRepository: args.isCrossRepository,
      connectionId: null,
      localGitOptions: localWorktreeGitOptions,
      gitExec,
      fetchRemoteTrackingRef,
      resolveRemote
    })
  }
}
