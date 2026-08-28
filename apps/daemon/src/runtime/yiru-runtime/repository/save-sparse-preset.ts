import { randomUUID } from 'node:crypto'

import { isPathInsideOrEqual } from '@yiru/runtime-protocol/model/platform'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '@yiru/runtime-protocol/model/workspace'
import { mergeExternalWorktreeInboxPaths } from '@yiru/runtime-protocol/workbench/external-worktree-inbox'
import { isFolderRepo } from '@yiru/runtime-protocol/workbench/repo-kind'
import type { RuntimeWorkspaceOpenPathResult } from '@yiru/runtime-protocol/workbench/runtime-types'
import { getGitRepoRoot, isGitRepo } from '~main/git/repo/repo'
import {
  findWorkspaceOpenWorktree,
  resolveWorkspaceOpenDirectoryPath,
  WorkspacePathOpenError
} from '~main/workspace/path-opening'

import {
  normalizeSparsePresetDirectoriesForSave,
  normalizeSparsePresetName
} from '../model/runtime-store'
import type { ResolvedWorktree } from '../model/worktree-resolution'
import { findLocalRepoById } from '../model/worktree-storage'
import type { RepositoryServiceContext } from './service-context'

export const saveSparsePresetMethods = {
  async saveSparsePreset(
    repoSelector: string,
    args: { id?: string; name: string; directories: string[] }
  ) {
    const repo = await this.resolveRepoSelector(repoSelector)
    const name = normalizeSparsePresetName(args.name)
    const directories = normalizeSparsePresetDirectoriesForSave(args.directories)
    const now = Date.now()
    const existing = args.id
      ? this.store.getSparsePresets(repo.id).find((preset) => preset.id === args.id)
      : undefined
    const saved = this.store.saveSparsePreset({
      id: existing?.id ?? randomUUID(),
      repoId: repo.id,
      name,
      directories,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    })
    return saved
  },

  async removeSparsePreset(repoSelector: string, presetId: string): Promise<void> {
    const repo = await this.resolveRepoSelector(repoSelector)
    this.store.removeSparsePreset(repo.id, presetId)
  },

  async openWorkspacePath(
    path: string,
    contextWorktree?: string
  ): Promise<RuntimeWorkspaceOpenPathResult> {
    const previous = this.workspacePathOpenTail
    let release!: () => void
    this.workspacePathOpenTail = new Promise((resolveTail) => {
      release = resolveTail
    })
    await previous
    try {
      return await this.openWorkspacePathNow(path, contextWorktree)
    } finally {
      release()
    }
  },

  async openWorkspacePathNow(
    path: string,
    contextWorktree?: string
  ): Promise<RuntimeWorkspaceOpenPathResult> {
    this.assertGraphReady()
    if (contextWorktree) {
      const worktree = await this.resolveWorktreeSelector(contextWorktree)
      if (!isPathInsideOrEqual(worktree.path, path)) {
        // Why: `yiru .` is authorized by its managed-worktree context; a shell
        // that changed directories must not escape the owning workspace.
        throw new WorkspacePathOpenError(
          'context_path_mismatch',
          path,
          'The current directory is outside the Yiru-managed workspace. Opening arbitrary directories is not supported.'
        )
      }
      return await this.activateWorkspacePathTarget(path, worktree, 'activated')
    }

    const targetPath = await resolveWorkspaceOpenDirectoryPath(path)
    const existingWorktree = await findWorkspaceOpenWorktree(
      await this.listResolvedWorktrees(),
      targetPath
    )
    if (existingWorktree) {
      return await this.activateWorkspacePathTarget(path, existingWorktree, 'activated')
    }

    const kind = isGitRepo(targetPath) ? 'git' : 'folder'
    const repoPath = kind === 'git' ? getGitRepoRoot(targetPath) : targetPath
    const store = this.store
    const repoIdsBeforeOpen = new Set(
      store
        .getRepos()
        .filter((repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID)
        .map((repo) => repo.id)
    )
    const repo = await this.addRepo(repoPath, kind)
    const worktree = await findWorkspaceOpenWorktree(
      (await this.listResolvedWorktrees()).filter((candidate) => candidate.repoId === repo.id),
      targetPath
    )
    if (!worktree) {
      throw new Error(`Workspace was registered but could not be resolved: ${repoPath}`)
    }
    return await this.activateWorkspacePathTarget(
      path,
      worktree,
      repoIdsBeforeOpen.has(repo.id) ? 'activated' : 'added'
    )
  },

  async activateWorkspacePathTarget(
    requestedPath: string,
    worktree: ResolvedWorktree,
    disposition: RuntimeWorkspaceOpenPathResult['disposition']
  ): Promise<RuntimeWorkspaceOpenPathResult> {
    const store = this.store
    let repo = findLocalRepoById(store, worktree.repoId)
    if (!repo) {
      throw new Error('repo_not_found')
    }

    if (!this.toRuntimeDetectedWorktree(repo, worktree).visible) {
      const importedExternalWorktreePaths = mergeExternalWorktreeInboxPaths(
        repo.importedExternalWorktreePaths,
        [worktree.path]
      )
      const updated = store.updateRepo(repo.id, { importedExternalWorktreePaths })
      if (!updated) {
        throw new Error('repo_not_found')
      }
      repo = updated
      this.invalidateResolvedWorktreeCache()
      this.notifyReposChanged()
      this.notifyWorktreesChanged(repo.id)
    }

    await this.activateManagedWorktree(`id:${worktree.id}`)
    return {
      requestedPath,
      resolvedPath: worktree.path,
      repoId: repo.id,
      worktreeId: worktree.id,
      kind: isFolderRepo(repo) ? 'folder' : 'git',
      disposition
    }
  }
} satisfies ThisType<RepositoryServiceContext>
