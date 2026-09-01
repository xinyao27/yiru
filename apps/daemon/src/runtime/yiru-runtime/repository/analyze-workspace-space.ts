import { randomUUID } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

import { normalizeRuntimePathForComparison } from '@yiru/runtime-protocol/model/platform'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '@yiru/runtime-protocol/model/workspace'
import { DEFAULT_REPO_BADGE_COLOR } from '@yiru/runtime-protocol/workbench/constants'
import type {
  Repo,
  ProjectGroupImportMode,
  ProjectGroupImportResult,
  DirEntry
} from '@yiru/runtime-protocol/workbench/types'
import type { WorkspaceSpaceAnalyzeResult } from '@yiru/runtime-protocol/workbench/workspace/space-types'
import { isGitRepo, getRepoName } from '~main/git/repo/repo'
import { gitExecFileAsync } from '~main/git/runner/runner'
import { scanNestedRepos } from '~main/project-groups/nested-repo-discovery'
import {
  createNestedProjectGroupResolver,
  resolveNestedRepoSelection
} from '~main/project-groups/nested-repo-import'
import { createNestedRepoImportTargetResolver } from '~main/project-groups/nested-repo-import-target'
import {
  cancelTrackedNestedRepoScan,
  getCompletedNestedRepoScan
} from '~main/project-groups/nested-repo-scan-registry'
import { detectRepoIconAndUpstream } from '~main/projects/icon-autodetect'
import {
  cancelInFlightWorkspaceSpaceScan,
  startOrJoinWorkspaceSpaceScan
} from '~main/workspace/space'
import { prepareLocalWorktreeRootForRepo } from '~main/worktree/root-preparation'

import { sanitizeNestedRepoRuntimeImportError } from '../model/mobile-resume-target'
import { resolveServerBrowsePath } from '../model/review-branch'
import type { RepositoryServiceContext } from './service-context'

export const analyzeWorkspaceSpaceMethods = {
  analyzeWorkspaceSpace(): Promise<WorkspaceSpaceAnalyzeResult> {
    return startOrJoinWorkspaceSpaceScan(this.store, (progress) =>
      this.emitWorkspaceSpaceScanProgressEvent(progress)
    )
  },

  cancelWorkspaceSpaceScan(): boolean {
    return cancelInFlightWorkspaceSpaceScan()
  },

  cancelNestedRepoScan(scanId: string): { cancelled: boolean } {
    return { cancelled: cancelTrackedNestedRepoScan(scanId) }
  },

  async browseServerDir(pathValue: string): Promise<{ resolvedPath: string; entries: DirEntry[] }> {
    const dirPath = resolveServerBrowsePath(pathValue)
    const dirStat = await stat(dirPath)
    if (!dirStat.isDirectory()) {
      throw new Error(`${dirPath} is not a directory`)
    }
    const entries = await readdir(dirPath, { withFileTypes: true })
    const mapped = entries
      .filter((entry) => entry.name !== '.' && entry.name !== '..')
      .map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isSymlink: entry.isSymbolicLink()
      }))
    mapped.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
    return { resolvedPath: dirPath, entries: mapped }
  },

  async isGitAvailable(): Promise<boolean> {
    try {
      await gitExecFileAsync(['--version'], { cwd: process.cwd(), timeout: 3000 })
      return true
    } catch {
      return false
    }
  },

  async importNestedRepos(args: {
    parentPath: string
    groupName: string
    projectPaths: string[]
    scanId?: string
    mode: ProjectGroupImportMode
  }): Promise<ProjectGroupImportResult> {
    if (!isAbsolute(args.parentPath)) {
      throw new Error('Project path must be an absolute path')
    }
    // Why: reuse the caller's scanNested result instead of rescanning when
    // it matches, matching the preload `importNested` member this replaces.
    const scan =
      getCompletedNestedRepoScan({ scanId: args.scanId, parentPath: args.parentPath }) ??
      (await scanNestedRepos({ path: args.parentPath, options: { timeoutMs: 15_000 } }))
    const selection = resolveNestedRepoSelection({ scan, projectPaths: args.projectPaths })
    const groupResolver = createNestedProjectGroupResolver({
      parentPath: args.parentPath,
      groupName: args.groupName,
      mode: args.mode,
      connectionId: null,
      repoPaths: selection.selectedPaths,
      createGroup: (input) => this.store!.createProjectGroup!(input)
    })
    const results: ProjectGroupImportResult['projects'] = selection.rejectedPaths.map(
      (repoPath) => ({
        path: repoPath,
        status: 'failed',
        error: 'Repository was not found in the nested repo scan result'
      })
    )
    const importedProjectIdsByRepoPath = new Map<string, string>()
    const importTargetResolver = createNestedRepoImportTargetResolver()
    for (const [projectGroupOrder, repoPath] of selection.selectedPaths.entries()) {
      try {
        if (!isGitRepo(repoPath)) {
          results.push({ path: repoPath, status: 'failed', error: 'Not a valid git repository' })
          continue
        }
        const importRepoPath = await importTargetResolver.resolveLocal(repoPath)
        const normalizedImportRepoPath = normalizeRuntimePathForComparison(importRepoPath)
        const alreadyImportedProjectId = importedProjectIdsByRepoPath.get(normalizedImportRepoPath)
        if (alreadyImportedProjectId) {
          results.push({
            path: repoPath,
            projectId: alreadyImportedProjectId,
            status: 'already-known'
          })
          continue
        }
        const existing = this.store
          .getRepos()
          .find(
            (repo) =>
              getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID &&
              normalizeRuntimePathForComparison(repo.path) === normalizedImportRepoPath
          )
        const group = groupResolver.getGroupForRepo(repoPath)
        if (existing) {
          if (group) {
            this.store.moveProjectToGroup(existing.id, group.id, projectGroupOrder)
          }
          importedProjectIdsByRepoPath.set(normalizedImportRepoPath, existing.id)
          results.push({ path: repoPath, projectId: existing.id, status: 'already-known' })
          continue
        }
        const detected = await detectRepoIconAndUpstream({ repoPath: importRepoPath, kind: 'git' })
        const repo: Repo = {
          id: randomUUID(),
          path: importRepoPath,
          displayName: getRepoName(importRepoPath),
          badgeColor: DEFAULT_REPO_BADGE_COLOR,
          ...detected,
          addedAt: Date.now(),
          kind: 'git',
          externalWorktreeVisibility: 'hide',
          externalWorktreeVisibilityLegacy: false,
          projectHostSetupMethod: 'imported-existing-folder',
          ...(group
            ? {
                projectGroupId: group.id,
                projectGroupOrder
              }
            : {})
        }
        this.store.addRepo(repo)
        await prepareLocalWorktreeRootForRepo(this.store, repo)
        importedProjectIdsByRepoPath.set(normalizedImportRepoPath, repo.id)
        results.push({ path: repoPath, projectId: repo.id, status: 'imported' })
      } catch (error) {
        results.push({
          path: repoPath,
          status: 'failed',
          error: sanitizeNestedRepoRuntimeImportError(
            'Failed to import nested repository in runtime',
            error
          )
        })
      }
    }
    const importedCount = results.filter((entry) => entry.status === 'imported').length
    const alreadyKnownCount = results.filter((entry) => entry.status === 'already-known').length
    const failedCount = results.filter((entry) => entry.status === 'failed').length
    if (importedCount + alreadyKnownCount === 0) {
      for (const group of groupResolver.getCreatedGroups().toReversed()) {
        this.store.deleteProjectGroup?.(group.id)
      }
    }
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    const rootGroup = groupResolver.getRootGroup()
    return {
      ...(rootGroup && importedCount + alreadyKnownCount > 0 ? { group: rootGroup } : {}),
      projects: results,
      importedCount,
      alreadyKnownCount,
      failedCount
    }
  },

  async listSparsePresets(repoSelector: string) {
    const repo = await this.resolveRepoSelector(repoSelector)
    return this.store.getSparsePresets(repo.id)
  }
} satisfies ThisType<RepositoryServiceContext>
