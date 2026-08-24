import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import type { RuntimeRepoHooksCheckResult } from '@yiru/runtime-protocol/contract'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import { isENOENT } from '~main/filesystem/auth'
import {
  getDefaultTabCommandTrustContent,
  getEffectiveHooks,
  getEffectiveSetupRunPolicy,
  hasUnrecognizedYiruYamlKeys,
  hasHooksFile,
  loadHooks
} from '~main/hooks'
import { joinWorktreeRelativePath } from '~main/runtime/relative-paths'
import { mergeWorktree } from '~main/worktree/logic'
import { isFolderRepo } from '~shared/repo-kind'
import type { RuntimeWorktreeListResult } from '~shared/runtime-types'
import { inspectSetupScriptImportCandidates } from '~shared/setup/script-imports'
import type { DetectedWorktree, DetectedWorktreeListResult, Repo, Worktree } from '~shared/types'
import {
  buildKnownYiruWorkspaceLayouts,
  isLegacyRepoForExternalWorktreeVisibility,
  toDetectedWorktree
} from '~shared/workspace/worktree-ownership'

import { DEFAULT_WORKTREE_LIST_LIMIT } from '../model/runtime-limits'
import type { RuntimeWorktreeScanResult } from '../model/worktree-resolution'
import { findLocalRepoById, listRuntimeFolderWorkspaces } from '../model/worktree-storage'
import { RuntimeRepositoryMergeRepoPr } from '../repository/merge-repo-pr'

export abstract class RuntimeWorktreeGetSetupHookTrustPayload extends RuntimeRepositoryMergeRepoPr {
  protected getSetupHookTrustPayload(
    repo: Repo,
    scriptContentValue: string | undefined
  ): { contentHash: string; scriptContent: string } | undefined {
    const scriptContent = scriptContentValue?.trim()
    if (!scriptContent || repo.hookSettings?.commandSourcePolicy === 'local-only') {
      return undefined
    }
    return {
      contentHash: createHash('sha256').update(scriptContent).digest('hex'),
      scriptContent
    }
  }

  protected getSharedSetupHookTrustPayload(
    repo: Repo,
    sharedSetupScript: string | undefined
  ): { contentHash: string; scriptContent: string } | undefined {
    if (repo.hookSettings?.commandSourcePolicy === 'local-only') {
      return undefined
    }
    return this.getSetupHookTrustPayload(repo, sharedSetupScript)
  }

  async getRepoHooks(repoSelector: string) {
    const repo = await this.resolveRepoSelector(repoSelector)
    const hasFile = hasHooksFile(repo.path)
    const hooks = getEffectiveHooks(repo)
    const sharedHooks = hasFile ? loadHooks(repo.path) : null
    const setupRunPolicy = getEffectiveSetupRunPolicy(repo)
    return {
      hasHooksFile: hasFile,
      hooks,
      setupRunPolicy,
      source: hasFile ? ('yiru.yaml' as const) : hooks ? ('legacy' as const) : null,
      setupTrust: this.getSharedSetupHookTrustPayload(
        repo,
        getDefaultTabCommandTrustContent(sharedHooks)
      )
    }
  }

  async checkRepoHooks(
    repoSelector: string,
    hostId?: ExecutionHostId
  ): Promise<RuntimeRepoHooksCheckResult> {
    let repo: Repo
    try {
      repo = await this.resolveRepoSelector(repoSelector, hostId)
    } catch {
      // Why: callers treat inspection failures as "skip", which keeps hook
      // execution fail closed — an unresolved or ambiguous selector must be
      // reported as status: 'error', not silently look like a confirmed
      // hook-free repo (which would look identical with hasHooks: false alone).
      return { status: 'error', hasHooks: false, hooks: null, mayNeedUpdate: false }
    }
    if (isFolderRepo(repo)) {
      return { status: 'ok', hasHooks: false, hooks: null, mayNeedUpdate: false }
    }

    const has = hasHooksFile(repo.path)
    const hooks = has ? loadHooks(repo.path) : null
    return {
      status: 'ok',
      hasHooks: has,
      hooks,
      mayNeedUpdate: has && !hooks && hasUnrecognizedYiruYamlKeys(repo.path)
    }
  }

  async inspectRepoSetupScriptImports(repoSelector: string) {
    const repo = await this.resolveRepoSelector(repoSelector)
    if (isFolderRepo(repo)) {
      return []
    }

    return inspectSetupScriptImportCandidates(async (relativePath) => {
      const filePath = joinWorktreeRelativePath(repo.path, relativePath)
      try {
        return await readFile(filePath, 'utf-8')
      } catch (error) {
        if (!isENOENT(error)) {
          console.warn('[runtime] Failed to inspect setup script import candidate:', error)
        }
        return null
      }
    })
  }

  async listManagedWorktrees(
    repoSelector?: string,
    limit = DEFAULT_WORKTREE_LIST_LIMIT
  ): Promise<RuntimeWorktreeListResult> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('invalid_limit')
    }
    const resolved = await this.listResolvedWorktrees()
    const repoId = repoSelector ? (await this.resolveRepoSelector(repoSelector)).id : null
    const worktrees = resolved.filter((worktree) => {
      if (repoId && worktree.repoId !== repoId) {
        return false
      }
      return this.isRuntimeWorktreeVisible(worktree)
    })
    return {
      worktrees: worktrees.slice(0, limit),
      totalCount: worktrees.length,
      truncated: worktrees.length > limit
    }
  }

  async listDetectedManagedWorktrees(repoSelector: string): Promise<DetectedWorktreeListResult> {
    const repo = await this.resolveRepoSelector(repoSelector)
    if (isFolderRepo(repo)) {
      const worktrees = listRuntimeFolderWorkspaces(this.requireStore(), repo)
      return {
        repoId: repo.id,
        authoritative: true,
        source: 'git',
        worktrees: worktrees.map((worktree) => this.toRuntimeDetectedWorktree(repo, worktree))
      }
    }
    let scan: RuntimeWorktreeScanResult
    try {
      scan = await this.listRepoWorktreesForResolution(repo)
    } catch {
      scan = { ok: false, worktrees: [] }
    }
    if (scan.ok) {
      this.pruneLineageForMissingRepoWorktrees(repo, scan.worktrees)
    }
    const detected = scan.worktrees.map((gitWorktree) => {
      const worktreeId = `${repo.id}::${gitWorktree.path}`
      const meta = this.store?.getWorktreeMeta(worktreeId)
      const worktree = mergeWorktree(repo.id, gitWorktree, meta, repo.displayName)
      const detectedWorktree = this.toRuntimeDetectedWorktree(repo, worktree)
      if (scan.ok) {
        return detectedWorktree
      }
      return {
        ...detectedWorktree,
        visible: true,
        ownership: detectedWorktree.ownership === 'yiru-managed' ? 'yiru-managed' : 'unknown-legacy'
      } satisfies DetectedWorktree
    })
    return {
      repoId: repo.id,
      authoritative: scan.ok,
      source: scan.ok ? 'git' : 'metadata-fallback',
      worktrees: detected
    }
  }

  protected isRuntimeWorktreeVisible(worktree: Worktree): boolean {
    const store = this.store
    const repo = store ? findLocalRepoById(store, worktree.repoId) : undefined
    if (!repo || !store) {
      return true
    }
    return this.toRuntimeDetectedWorktree(repo, worktree).visible
  }

  protected toRuntimeDetectedWorktree(repo: Repo, worktree: Worktree): DetectedWorktree {
    const settings = this.store?.getSettings()
    if (!settings) {
      return {
        ...worktree,
        ownership: 'unknown-legacy',
        selectedCheckout: false,
        visible: true
      }
    }
    return toDetectedWorktree({
      repo,
      worktree,
      meta: this.store?.getWorktreeMeta(worktree.id),
      settings,
      knownYiruLayouts: buildKnownYiruWorkspaceLayouts(settings, repo),
      isLegacyRepoForVisibility: isLegacyRepoForExternalWorktreeVisibility(repo)
    })
  }

  async showManagedWorktree(worktreeSelector: string) {
    return await this.resolveWorktreeSelector(worktreeSelector)
  }
}
