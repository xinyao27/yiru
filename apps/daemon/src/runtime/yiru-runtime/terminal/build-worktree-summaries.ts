import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import { folderWorkspaceToWorktree } from '@yiru/runtime-protocol/workbench/folder-workspace-worktree'
import type { RuntimeWorktreePsSummary } from '@yiru/runtime-protocol/workbench/runtime-types'
import type { Repo } from '@yiru/runtime-protocol/workbench/types'
import { DEFAULT_WORKSPACE_STATUS_ID } from '@yiru/runtime-protocol/workbench/workspace/statuses'

import {
  mobileExecutionHostTargetStatus,
  mobileFolderResumeTargetStatus
} from '../model/mobile-resume-target'
import type { ResolvedWorktree } from '../model/worktree-resolution'
import { RuntimeTerminalWaitForTerminal } from './wait-for-terminal'

export abstract class RuntimeTerminalBuildWorktreeSummaries extends RuntimeTerminalWaitForTerminal {
  protected buildWorktreeSummaries(
    resolvedWorktrees: ResolvedWorktree[],
    platformByRepoId: ReadonlyMap<string, NodeJS.Platform>,
    allRepos: Repo[]
  ): Map<string, RuntimeWorktreePsSummary> {
    const repoById = new Map(
      allRepos
        .filter((repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID)
        .map((repo) => [repo.id, repo])
    )
    const summaries = new Map<string, RuntimeWorktreePsSummary>()
    const ghCache = this.store?.getGitHubCache?.()
    for (const worktree of resolvedWorktrees) {
      const meta =
        this.store?.getWorktreeMeta?.(worktree.id) ?? this.store?.getAllWorktreeMeta()[worktree.id]
      const repo = repoById.get(worktree.repoId)
      let linkedPR: { number: number; state: string } | null = null
      const branch = worktree.branch.replace(/^refs\/heads\//, '')
      if (branch && ghCache) {
        // Why: the renderer keys the PR cache by repo id, with path retained
        // only for legacy entries created before ids became authoritative.
        const cached =
          (repo?.id ? ghCache.pr[`${repo.id}::${branch}`] : undefined) ??
          (repo?.path ? ghCache.pr[`${repo.path}::${branch}`] : undefined)
        if (cached?.data) {
          linkedPR = { number: cached.data.number, state: cached.data.state }
        }
      }
      if (!linkedPR && meta?.linkedPR != null) {
        linkedPR = { number: meta.linkedPR, state: 'unknown' }
      }
      const resumeRepo = allRepos.find((candidate) => candidate.id === worktree.repoId)
      const resumeHostId =
        worktree.hostId ?? meta?.hostId ?? (resumeRepo ? getRepoExecutionHostId(resumeRepo) : null)
      const lineage = worktree.lineage
      summaries.set(worktree.id, {
        workspaceKind: 'git',
        worktreeId: worktree.id,
        repoId: worktree.repoId,
        ...((worktree.hostId ?? meta?.hostId) ? { hostId: worktree.hostId ?? meta?.hostId } : {}),
        resumeTargetStatus: resumeHostId
          ? mobileExecutionHostTargetStatus(normalizeExecutionHostId(resumeHostId))
          : 'unknown',
        terminalPlatform: platformByRepoId.get(worktree.repoId) ?? process.platform,
        ...(meta?.priorWorktreeIds !== undefined
          ? { priorWorktreeIds: meta.priorWorktreeIds }
          : {}),
        repo: repo?.displayName ?? worktree.repoId,
        path: worktree.path,
        branch: worktree.branch,
        isArchived: worktree.isArchived,
        isMainWorktree: worktree.isMainWorktree,
        hasHostSidebarActivity: false,
        ...(worktree.instanceId !== undefined ? { worktreeInstanceId: worktree.instanceId } : {}),
        ...(lineage?.worktreeInstanceId !== undefined
          ? { lineageWorktreeInstanceId: lineage.worktreeInstanceId }
          : {}),
        ...(lineage?.parentWorktreeInstanceId !== undefined
          ? { parentWorktreeInstanceId: lineage.parentWorktreeInstanceId }
          : {}),
        parentWorktreeId: worktree.parentWorktreeId,
        childWorktreeIds: worktree.childWorktreeIds,
        displayName: worktree.displayName,
        workspaceStatus: meta?.workspaceStatus ?? DEFAULT_WORKSPACE_STATUS_ID,
        sortOrder: meta?.sortOrder ?? 0,
        ...(meta?.manualOrder !== undefined ? { manualOrder: meta.manualOrder } : {}),
        lastActivityAt: worktree.lastActivityAt,
        ...(worktree.createdAt !== undefined ? { createdAt: worktree.createdAt } : {}),
        linkedPR,
        linkedGitLabMR: meta?.linkedGitLabMR ?? null,
        comment: meta?.comment ?? '',
        isPinned: meta?.isPinned ?? false,
        isActive: false,
        unread: meta?.isUnread ?? false,
        liveTerminalCount: 0,
        hasAttachedPty: false,
        lastOutputAt: null,
        preview: '',
        status: 'inactive',
        agents: []
      })
    }

    const projectGroups = this.store?.getProjectGroups?.() ?? []
    const projectGroupById = new Map(projectGroups.map((group) => [group.id, group]))
    for (const folderWorkspace of this.store?.getFolderWorkspaces?.() ?? []) {
      const projectGroup = projectGroupById.get(folderWorkspace.projectGroupId)
      if (!projectGroup?.parentPath) {
        continue
      }
      const worktree = folderWorkspaceToWorktree(folderWorkspace)
      summaries.set(worktree.id, {
        workspaceKind: 'folder-workspace',
        worktreeId: worktree.id,
        repoId: worktree.repoId,
        resumeTargetStatus: mobileFolderResumeTargetStatus({
          folderWorkspace,
          projectGroup,
          projectGroups,
          repos: allRepos
        }),
        repo: projectGroup.name,
        path: worktree.path,
        branch: worktree.branch,
        isArchived: worktree.isArchived,
        isMainWorktree: worktree.isMainWorktree,
        hasHostSidebarActivity: false,
        ...(worktree.instanceId !== undefined ? { worktreeInstanceId: worktree.instanceId } : {}),
        parentWorktreeId: null,
        childWorktreeIds: [],
        displayName: worktree.displayName,
        workspaceStatus: worktree.workspaceStatus ?? DEFAULT_WORKSPACE_STATUS_ID,
        sortOrder: worktree.sortOrder ?? 0,
        ...(worktree.manualOrder !== undefined ? { manualOrder: worktree.manualOrder } : {}),
        lastActivityAt: worktree.lastActivityAt,
        ...(worktree.createdAt !== undefined ? { createdAt: worktree.createdAt } : {}),
        linkedPR: null,
        linkedGitLabMR: worktree.linkedGitLabMR ?? null,
        comment: worktree.comment,
        isPinned: worktree.isPinned,
        isActive: false,
        unread: worktree.isUnread,
        liveTerminalCount: 0,
        hasAttachedPty: false,
        lastOutputAt: null,
        preview: '',
        status: 'inactive',
        agents: []
      })
    }
    return summaries
  }
}
