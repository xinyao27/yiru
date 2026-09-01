import { shouldApplyWorkspaceSourceAutoName } from '@yiru/runtime-protocol/model/workspace'
import type {
  GitHubWorkItem,
  GitLabWorkItem,
  GitPushTarget
} from '@yiru/runtime-protocol/workbench/types'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { WorkspaceCreateErrorDisplay } from '~renderer/new-workspace-composer-card/workspace-create-error-format'

import { resolveComposerManualBranchNameChange } from './composer-branch-selection'
import type { SmartGitHubPrStartPointSelection } from './resolve-smart-github-submit'
import {
  getLinkedWorkItemSuggestedName,
  getLinkedWorkItemWorkspaceName,
  type LinkedWorkItemSummary
} from './workspace-creation'

type ComposerLinkedSourceOptions = {
  branchAutoNameRef: RefObject<string>
  branchNameOverride: string | undefined
  branchNameOverridePreservesNameEdits: boolean
  forkPushWarning: string | null
  lastAutoNameRef: RefObject<string>
  linkedWorkItem: LinkedWorkItemSummary | null
  name: string
  pushTarget: GitPushTarget | undefined
  setBranchNameOverride: Dispatch<SetStateAction<string | undefined>>
  setBranchNameOverridePreservesNameEdits: Dispatch<SetStateAction<boolean>>
  setCreateError: Dispatch<SetStateAction<WorkspaceCreateErrorDisplay | null>>
  setForkPushWarning: Dispatch<SetStateAction<string | null>>
  setLinkPopoverOpen: (open: boolean) => void
  setLinkedGitLabMR: Dispatch<SetStateAction<number | null>>
  setLinkedPR: Dispatch<SetStateAction<number | null>>
  setLinkedWorkItem: Dispatch<SetStateAction<LinkedWorkItemSummary | null>>
  setName: Dispatch<SetStateAction<string>>
  setPushTarget: Dispatch<SetStateAction<GitPushTarget | undefined>>
  setReuseEligibleBranch: Dispatch<SetStateAction<string | null>>
  setReuseSelectedBranch: Dispatch<SetStateAction<boolean>>
  startPointSelectionRef: RefObject<SmartGitHubPrStartPointSelection | null>
}

export type ComposerLinkedSourceActions = ReturnType<typeof createComposerLinkedSourceActions>

export function createComposerLinkedSourceActions(options: ComposerLinkedSourceOptions) {
  const applyLinkedWorkItem = (
    item: GitHubWorkItem,
    applyOptions: { preserveBranchNameOverride?: boolean } = {}
  ): void => {
    options.setLinkedPR(item.number)
    options.setLinkedGitLabMR(null)
    options.setLinkedWorkItem({
      type: 'pr',
      provider: 'github',
      number: item.number,
      title: item.title,
      url: item.url
    })
    const suggestedName =
      getLinkedWorkItemWorkspaceName(item)?.seedName ?? getLinkedWorkItemSuggestedName(item)
    // Why: a pasted URL/#123 is a lookup query, not a deliberate workspace name.
    if (
      suggestedName &&
      shouldApplyWorkspaceSourceAutoName({
        currentName: options.name,
        lastAutoName: options.lastAutoNameRef.current
      })
    ) {
      options.setName(suggestedName)
      options.lastAutoNameRef.current = suggestedName
    }
    if (!applyOptions.preserveBranchNameOverride) {
      options.setBranchNameOverride(undefined)
      options.setBranchNameOverridePreservesNameEdits(false)
      options.branchAutoNameRef.current = ''
    }
  }

  const applyLinkedGitLabWorkItem = (item: GitLabWorkItem): void => {
    options.startPointSelectionRef.current = null
    options.setLinkedGitLabMR(item.number)
    options.setLinkedPR(null)
    options.setLinkedWorkItem({
      type: item.type,
      number: item.number,
      title: item.title,
      url: item.url
    })
    // Why: the GitHub naming heuristic consumes the same branch/title shape.
    const suggestedName = getLinkedWorkItemSuggestedName({
      type: 'pr',
      number: item.number,
      title: item.title,
      branchName: item.branchName
    } as unknown as GitHubWorkItem)
    const titleName = getLinkedWorkItemWorkspaceName({
      type: item.type,
      number: item.number,
      title: item.title
    })
    const nextName = titleName?.seedName ?? suggestedName
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
    options.setBranchNameOverride(undefined)
    options.setBranchNameOverridePreservesNameEdits(false)
    options.branchAutoNameRef.current = ''
  }

  const handleSelectLinkedItem = (item: GitHubWorkItem): void => {
    options.startPointSelectionRef.current = null
    applyLinkedWorkItem(item)
    options.setLinkPopoverOpen(false)
  }

  const handleRemoveLinkedWorkItem = (): void => {
    options.startPointSelectionRef.current = null
    options.setLinkedWorkItem(null)
    options.setLinkedPR(null)
    options.setForkPushWarning(null)
    if (options.name === options.lastAutoNameRef.current) {
      options.lastAutoNameRef.current = ''
    }
  }

  const handleNameValueChange = (nextName: string): void => {
    if (!nextName.trim() || options.name !== options.lastAutoNameRef.current) {
      options.lastAutoNameRef.current = ''
    }
    if (
      options.branchNameOverride &&
      !options.branchNameOverridePreservesNameEdits &&
      nextName !== options.branchAutoNameRef.current
    ) {
      options.setBranchNameOverride(undefined)
      options.branchAutoNameRef.current = ''
    }
    options.setName(nextName)
    options.setCreateError(null)
  }

  const handleBranchNameOverrideChange = (value: string | undefined): void => {
    const next = resolveComposerManualBranchNameChange({
      value,
      pushTarget: options.pushTarget,
      forkPushWarning: options.forkPushWarning
    })
    options.setBranchNameOverride(next.branchNameOverride)
    options.setBranchNameOverridePreservesNameEdits(Boolean(next.branchNameOverride))
    options.setPushTarget(next.pushTarget)
    options.setForkPushWarning(next.forkPushWarning)
    options.setReuseEligibleBranch(null)
    options.setReuseSelectedBranch(false)
    options.branchAutoNameRef.current = ''
  }

  return {
    applyLinkedGitLabWorkItem,
    applyLinkedWorkItem,
    handleBranchNameOverrideChange,
    handleNameValueChange,
    handleRemoveLinkedWorkItem,
    handleSelectLinkedItem
  }
}
