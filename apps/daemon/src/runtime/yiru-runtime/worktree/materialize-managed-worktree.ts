import type { GitPushTarget } from '@yiru/runtime-protocol/workbench/types'
import { addSparseWorktree, addWorktree, listWorktrees } from '~main/git/worktree/worktree'
import type { AddWorktreeOptions, AddWorktreeResult } from '~main/git/worktree/worktree'
import { normalizeSparseDirectories } from '~main/sparse-checkout-directories'
import { areWorktreePathsEqual } from '~main/worktree/logic'
import {
  configureCreatedWorktreePushTarget,
  prepareWorktreePushTarget
} from '~main/worktree/remote'

import type {
  ManagedWorktreeBranchContext,
  ManagedWorktreeMaterializedContext
} from '../model/managed-worktree-create'
import { hasLocalGitOptions } from '../model/review-branch'
import { hasLocalWorktreeBaseRef } from '../model/worktree-resolution'
import { RuntimeWorktreeResolveWorktreeCreateTarget } from './resolve-worktree-create-target'

export abstract class RuntimeWorktreeMaterializeManagedWorktree extends RuntimeWorktreeResolveWorktreeCreateTarget {
  protected async materializeManagedWorktree(
    context: ManagedWorktreeBranchContext
  ): Promise<ManagedWorktreeMaterializedContext> {
    const {
      args,
      baseBranch,
      branchName,
      checkoutExistingBranch,
      localWorktreeGitOptions,
      repo,
      settings,
      worktreePath
    } = context
    const hasLocalWorktreeGitOptions = hasLocalGitOptions(localWorktreeGitOptions)
    const localWorktreeGitOptionArgs: [] | [{ wslDistro?: string }] = hasLocalWorktreeGitOptions
      ? [localWorktreeGitOptions]
      : []
    const addProjectGitOptions = (options?: AddWorktreeOptions): AddWorktreeOptions | undefined =>
      hasLocalWorktreeGitOptions ? { ...options, ...localWorktreeGitOptions } : options
    args.onProgress?.({ phase: 'fetching' })
    let remoteTrackingBase = await this.resolveRemoteTrackingBase(
      repo.path,
      baseBranch,
      ...localWorktreeGitOptionArgs
    )
    if (remoteTrackingBase) {
      const hadRemoteTrackingBaseRef = await this.hasRemoteTrackingRef(
        repo.path,
        remoteTrackingBase,
        ...localWorktreeGitOptionArgs
      )
      const hasLocalBaseRef =
        hadRemoteTrackingBaseRef ||
        (await hasLocalWorktreeBaseRef(
          repo.path,
          baseBranch,
          hasLocalWorktreeGitOptions ? localWorktreeGitOptions : {}
        ))
      if (!hadRemoteTrackingBaseRef && hasLocalBaseRef) {
        remoteTrackingBase = null
      } else {
        const refresh = await this.getOrStartRemoteTrackingBaseRefresh(
          repo.path,
          remoteTrackingBase,
          ...localWorktreeGitOptionArgs
        )
        if (!refresh.ok && !hadRemoteTrackingBaseRef) {
          throw new Error(
            `Could not refresh base ref "${baseBranch}" from "${remoteTrackingBase.remote}". Check your network and try again.`
          )
        }
        if (
          !hadRemoteTrackingBaseRef &&
          !(await this.hasRemoteTrackingRef(
            repo.path,
            remoteTrackingBase,
            ...localWorktreeGitOptionArgs
          ))
        ) {
          throw new Error(`Base ref "${baseBranch}" was not found after fetching.`)
        }
      }
    } else if (
      !(await hasLocalWorktreeBaseRef(
        repo.path,
        baseBranch,
        hasLocalWorktreeGitOptions ? localWorktreeGitOptions : {}
      ))
    ) {
      await this.fetchRemoteWithCache(repo.path, 'origin', ...localWorktreeGitOptionArgs).catch(
        () => undefined
      )
    }

    const sparseDirectories = args.sparseCheckout
      ? normalizeSparseDirectories(args.sparseCheckout.directories)
      : []
    if (args.sparseCheckout && sparseDirectories.length === 0) {
      throw new Error('Sparse checkout requires at least one repo-relative directory.')
    }
    let preparedPushTarget: GitPushTarget | undefined
    if (args.pushTarget) {
      preparedPushTarget = await prepareWorktreePushTarget(
        repo.path,
        args.pushTarget,
        this.requireStore(),
        repo.id,
        localWorktreeGitOptions
      )
    }
    const suggestLocalBaseRefUpdate =
      !settings.refreshLocalBaseRefOnWorktreeCreate &&
      !settings.localBaseRefSuggestionDismissed &&
      Boolean(remoteTrackingBase)
    const remoteTrackingBaseOption = remoteTrackingBase ? { remoteTrackingBase } : undefined
    const existingBranchOption = {
      checkoutExistingBranch,
      ...remoteTrackingBaseOption,
      ...(suggestLocalBaseRefUpdate ? { suggestLocalBaseRefUpdate } : {})
    }
    const defaultAddWorktreeOption = addProjectGitOptions()
    args.onProgress?.({ phase: 'creating' })
    const addResult: AddWorktreeResult =
      (await (sparseDirectories.length > 0
        ? checkoutExistingBranch
          ? addSparseWorktree(
              repo.path,
              worktreePath,
              branchName,
              sparseDirectories,
              baseBranch,
              settings.refreshLocalBaseRefOnWorktreeCreate,
              addProjectGitOptions(existingBranchOption)
            )
          : suggestLocalBaseRefUpdate
            ? addSparseWorktree(
                repo.path,
                worktreePath,
                branchName,
                sparseDirectories,
                baseBranch,
                settings.refreshLocalBaseRefOnWorktreeCreate,
                addProjectGitOptions({ ...remoteTrackingBaseOption, suggestLocalBaseRefUpdate })
              )
            : remoteTrackingBaseOption
              ? addSparseWorktree(
                  repo.path,
                  worktreePath,
                  branchName,
                  sparseDirectories,
                  baseBranch,
                  settings.refreshLocalBaseRefOnWorktreeCreate,
                  addProjectGitOptions(remoteTrackingBaseOption)
                )
              : defaultAddWorktreeOption
                ? addSparseWorktree(
                    repo.path,
                    worktreePath,
                    branchName,
                    sparseDirectories,
                    baseBranch,
                    settings.refreshLocalBaseRefOnWorktreeCreate,
                    defaultAddWorktreeOption
                  )
                : addSparseWorktree(
                    repo.path,
                    worktreePath,
                    branchName,
                    sparseDirectories,
                    baseBranch,
                    settings.refreshLocalBaseRefOnWorktreeCreate
                  )
        : checkoutExistingBranch
          ? addWorktree(
              repo.path,
              worktreePath,
              branchName,
              baseBranch,
              settings.refreshLocalBaseRefOnWorktreeCreate,
              false,
              addProjectGitOptions(existingBranchOption)
            )
          : suggestLocalBaseRefUpdate
            ? addWorktree(
                repo.path,
                worktreePath,
                branchName,
                baseBranch,
                settings.refreshLocalBaseRefOnWorktreeCreate,
                false,
                addProjectGitOptions({ ...remoteTrackingBaseOption, suggestLocalBaseRefUpdate })
              )
            : remoteTrackingBaseOption
              ? addWorktree(
                  repo.path,
                  worktreePath,
                  branchName,
                  baseBranch,
                  settings.refreshLocalBaseRefOnWorktreeCreate,
                  false,
                  addProjectGitOptions(remoteTrackingBaseOption)
                )
              : defaultAddWorktreeOption
                ? addWorktree(
                    repo.path,
                    worktreePath,
                    branchName,
                    baseBranch,
                    settings.refreshLocalBaseRefOnWorktreeCreate,
                    false,
                    defaultAddWorktreeOption
                  )
                : addWorktree(
                    repo.path,
                    worktreePath,
                    branchName,
                    baseBranch,
                    settings.refreshLocalBaseRefOnWorktreeCreate
                  ))) ?? {}
    const configuredPushTarget = preparedPushTarget
      ? await configureCreatedWorktreePushTarget(
          worktreePath,
          branchName,
          preparedPushTarget,
          localWorktreeGitOptions
        )
      : undefined
    const gitWorktrees = hasLocalWorktreeGitOptions
      ? await listWorktrees(repo.path, localWorktreeGitOptions)
      : await listWorktrees(repo.path)
    const created = gitWorktrees.find((worktree) =>
      areWorktreePathsEqual(worktree.path, worktreePath)
    )
    if (!created) {
      throw new Error('Worktree created but not found in listing')
    }
    return {
      ...context,
      remoteTrackingBase,
      sparseDirectories,
      addResult,
      created,
      configuredPushTarget
    }
  }
}
