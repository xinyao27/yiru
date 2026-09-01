import { shouldApplyWorkspaceSourceAutoName } from '@yiru/runtime-protocol/model/workspace'
import type {
  GitLabWorkItem,
  GitPushTarget,
  GlobalSettings,
  Repo
} from '@yiru/runtime-protocol/workbench/types'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { getSettingsForRepoRuntimeOwner } from '~renderer/repo/runtime-owner'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import {
  getLinkedItemDisplayName,
  toGitLabLinkedWorkItem
} from '~renderer/sidebar/folder-workspace-composer-model'

import type { ComposerLinkedSourceActions } from './composer-linked-source'
import type { LinkedWorkItemSummary } from './workspace-creation'

type ComposerGitLabSourceOptions = {
  applyLinkedGitLabWorkItem: ComposerLinkedSourceActions['applyLinkedGitLabWorkItem']
  branchAutoNameRef: RefObject<string>
  eligibleRepos: Repo[]
  handleBaseBranchMrSelect: (
    baseBranch: string,
    item: GitLabWorkItem,
    pushTarget?: GitPushTarget,
    compareBaseRef?: string
  ) => void
  isProjectGroupTarget: boolean
  lastAutoNameRef: RefObject<string>
  name: string
  selectedRepo: Repo | undefined
  setBaseBranch: Dispatch<SetStateAction<string | undefined>>
  setBranchNameOverride: Dispatch<SetStateAction<string | undefined>>
  setBranchNameOverridePreservesNameEdits: Dispatch<SetStateAction<boolean>>
  setCompareBaseRef: Dispatch<SetStateAction<string | undefined>>
  setForkPushWarning: Dispatch<SetStateAction<string | null>>
  setLinkedGitLabMR: Dispatch<SetStateAction<number | null>>
  setLinkedPR: Dispatch<SetStateAction<number | null>>
  setLinkedWorkItem: Dispatch<SetStateAction<LinkedWorkItemSummary | null>>
  setName: Dispatch<SetStateAction<string>>
  setPushTarget: Dispatch<SetStateAction<GitPushTarget | undefined>>
  setStartFromResetHint: Dispatch<SetStateAction<string | null>>
  settings: GlobalSettings | null
}

export function createComposerGitLabItemSelect(options: ComposerGitLabSourceOptions) {
  return (item: GitLabWorkItem): void => {
    if (options.isProjectGroupTarget) {
      const linkedItem = toGitLabLinkedWorkItem(item)
      options.setLinkedGitLabMR(item.number)
      options.setLinkedPR(null)
      options.setLinkedWorkItem(linkedItem)
      const nextName = getLinkedItemDisplayName(linkedItem)
      if (
        nextName &&
        shouldApplyWorkspaceSourceAutoName({
          currentName: options.name,
          lastAutoName: options.lastAutoNameRef.current
        })
      ) {
        options.setName(nextName)
        options.lastAutoNameRef.current = nextName
      }
      return
    }
    options.applyLinkedGitLabWorkItem(item)
    options.setStartFromResetHint(null)
    options.setBranchNameOverride(undefined)
    options.setBranchNameOverridePreservesNameEdits(false)
    options.setForkPushWarning(null)
    options.branchAutoNameRef.current = ''
    const runRepo =
      options.selectedRepo ?? options.eligibleRepos.find((repo) => repo.id === item.repoId)
    options.setCompareBaseRef(undefined)
    if (!runRepo) {
      return
    }
    const repoSettings = getSettingsForRepoRuntimeOwner(
      { repos: [runRepo], settings: options.settings },
      runRepo.id
    )
    const target = getActiveRuntimeTarget(repoSettings)
    const request = {
      mrIid: item.number,
      ...(item.branchName ? { sourceBranch: item.branchName } : {}),
      ...(item.baseRefName ? { targetBranch: item.baseRefName } : {}),
      ...(item.isCrossRepository !== undefined ? { isCrossRepository: item.isCrossRepository } : {})
    }
    const resolveMrBase =
      target.kind === 'local'
        ? workspaceHostClient.worktrees.resolveMrBase({ repoId: runRepo.id, ...request })
        : callRuntimeOrpc(
            target,
            (client) => client.worktree.resolveMrBase,
            { repo: runRepo.id, ...request },
            { timeoutMs: 30_000 }
          )
    void resolveMrBase
      .then((result) => {
        if ('error' in result) {
          options.setBaseBranch(undefined)
          options.setCompareBaseRef(undefined)
          options.setPushTarget(undefined)
          toast.error(result.error)
          return
        }
        options.handleBaseBranchMrSelect(
          result.baseBranch,
          item,
          result.pushTarget,
          result.compareBaseRef
        )
      })
      .catch((error: unknown) => {
        options.setBaseBranch(undefined)
        options.setCompareBaseRef(undefined)
        options.setPushTarget(undefined)
        toast.error(
          error instanceof Error
            ? error.message
            : translate('auto.hooks.useComposerState.5f3d2c8a1b', 'Failed to resolve MR base.')
        )
      })
  }
}
