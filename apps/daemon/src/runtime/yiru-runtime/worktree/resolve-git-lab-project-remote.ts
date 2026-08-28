import type {
  GitPushTarget,
  Repo,
  RemoveWorktreeResult
} from '@yiru/runtime-protocol/workbench/types'
import { getDefaultRemote } from '~main/git/repo/repo'
import { getProjectRefForRemote as getGitLabProjectRefForRemote } from '~main/gitlab/client'
import { getGlabKnownHosts } from '~main/gitlab/gitlab-cli'
import { advertisedUrlWatcher } from '~main/ports/advertised-url-watcher'
import { deleteWorktreeHistoryDir } from '~main/terminal/history'

import { parseExactWorktreeIdSelector } from '../model/review-branch'
import type { RuntimeStore } from '../model/runtime-store'
import type { RuntimeWorktreeRemovalTarget } from '../model/worktree-storage'
import { RuntimeWorktreeResolveManagedMrBase } from './resolve-managed-mr-base'

export abstract class RuntimeWorktreeResolveGitLabProjectRemote extends RuntimeWorktreeResolveManagedMrBase {
  protected async resolveGitLabProjectRemote(
    repoPath: string,
    preference?: Repo['forgeRemotePreference'],
    localGitOptions: { wslDistro?: string } = {}
  ): Promise<string> {
    const knownHosts = await getGlabKnownHosts(null)
    const localGitOptionArgs =
      Object.keys(localGitOptions).length > 0 ? ([localGitOptions] as const) : []
    if (preference === 'origin') {
      const origin = await getGitLabProjectRefForRemote(
        repoPath,
        'origin',
        knownHosts,
        null,
        ...localGitOptionArgs
      )
      if (origin) {
        return 'origin'
      }
      throw new Error('No GitLab project found for origin.')
    }
    if (preference === 'upstream') {
      const upstream = await getGitLabProjectRefForRemote(
        repoPath,
        'upstream',
        knownHosts,
        null,
        ...localGitOptionArgs
      )
      if (upstream) {
        return 'upstream'
      }
      const origin = await getGitLabProjectRefForRemote(
        repoPath,
        'origin',
        knownHosts,
        null,
        ...localGitOptionArgs
      )
      if (origin) {
        return 'origin'
      }
      throw new Error('No GitLab project found for upstream or origin.')
    }
    const upstream = await getGitLabProjectRefForRemote(
      repoPath,
      'upstream',
      knownHosts,
      null,
      ...localGitOptionArgs
    )
    if (upstream) {
      return 'upstream'
    }
    const origin = await getGitLabProjectRefForRemote(
      repoPath,
      'origin',
      knownHosts,
      null,
      ...localGitOptionArgs
    )
    if (origin) {
      return 'origin'
    }
    return getDefaultRemote(repoPath, localGitOptions)
  }

  protected async resolveWorktreeRemovalTarget(
    worktreeSelector: string
  ): Promise<RuntimeWorktreeRemovalTarget> {
    try {
      const worktree = await this.resolveWorktreeSelector(worktreeSelector)
      const removalTarget = {
        id: worktree.id,
        repoId: worktree.repoId,
        path: worktree.path
      }
      return worktree.pushTarget
        ? { ...removalTarget, pushTarget: worktree.pushTarget }
        : removalTarget
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'selector_not_found') {
        throw error
      }
      const removalTarget = parseExactWorktreeIdSelector(worktreeSelector)
      const meta = removalTarget ? this.store?.getWorktreeMeta(removalTarget.id) : undefined
      if (!removalTarget || !meta) {
        throw error
      }
      // Why: delete requests can arrive after Git no longer lists the worktree.
      // Only exact IDs with persisted Yiru metadata are accepted here so
      // branch/path selectors cannot resolve to an arbitrary missing path.
      return meta.pushTarget ? { ...removalTarget, pushTarget: meta.pushTarget } : removalTarget
    }
  }

  protected removeWorktreeMetadataAndHistory(store: RuntimeStore, worktreeId: string): void {
    // Why: worktree IDs are path-derived and can be recreated, so removal must
    // purge history and process-local caches before the ID points at new state.
    store.removeWorktreeMeta(worktreeId)
    advertisedUrlWatcher.forgetWorktree(worktreeId)
    deleteWorktreeHistoryDir(worktreeId)
  }

  protected rememberPreservedBranchCleanupTarget(
    worktreeId: string,
    result: RemoveWorktreeResult | undefined,
    fallbackHead: string | undefined,
    pushTarget: GitPushTarget | undefined
  ): void {
    if (result?.preservedBranch) {
      const head = result.preservedBranch.head ?? fallbackHead
      if (!head) {
        throw new Error(
          `Cannot safely offer force-delete for preserved branch "${result.preservedBranch.branchName}" without its saved commit.`
        )
      }
      this.preservedBranchCleanupByWorktreeId.set(worktreeId, {
        branchName: result.preservedBranch.branchName,
        head,
        ...(pushTarget ? { pushTarget } : {})
      })
      return
    }
    this.preservedBranchCleanupByWorktreeId.delete(worktreeId)
  }

  protected preserveBranchHeadFallback(
    result: RemoveWorktreeResult | undefined,
    fallbackHead: string | undefined
  ): RemoveWorktreeResult {
    if (!result?.preservedBranch || result.preservedBranch.head || !fallbackHead) {
      return result ?? {}
    }
    return {
      ...result,
      preservedBranch: {
        ...result.preservedBranch,
        head: fallbackHead
      }
    }
  }
}
