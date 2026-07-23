import { resolveComposerBranchPick as resolveSharedComposerBranchPick } from '@yiru/workbench-model/review'
import type { GitLabWorkItem } from '@yiru/workbench-model/review'
import type { GitHubWorkItem } from '@yiru/workbench-model/review'
import {
  buildGitHubWorkspaceSource,
  buildGitLabWorkspaceSource,
  buildWorkspaceSourceSelection,
  getWorkspaceSourceName,
  shouldApplyWorkspaceSourceAutoName
} from '@yiru/workbench-model/workspace'

import type {
  MobileComposerCreateSelection,
  MobileLinkedWorkItem,
  SmartNameSelection
} from './mobile-composer-source-types'
import type { WorkspaceCreateGitPushTarget } from './workspace-create-params'

export function buildGitHubLinkedWorkItem(item: {
  type: 'pr'
  number: number
  title: string
  url: string
  repoId: string
}): MobileLinkedWorkItem {
  return buildGitHubWorkspaceSource(item)
}

export function buildGitLabLinkedWorkItem(item: {
  type: 'mr'
  number: number
  title: string
  url: string
  repoId: string
}): MobileLinkedWorkItem {
  return buildGitLabWorkspaceSource(item)
}

export function shouldApplyAutoName(args: { currentName: string; lastAutoName: string }): boolean {
  return shouldApplyWorkspaceSourceAutoName(args)
}

export function resolveWorkItemAutoName(item: {
  type: 'pr' | 'mr'
  number: number
  title: string
  provider: 'github' | 'gitlab'
}): string {
  return getWorkspaceSourceName({ ...item, url: '' }).seedName
}

export function buildSmartNameSelection(args: {
  linkedWorkItem: MobileLinkedWorkItem | null
  baseBranch: string | undefined
}): SmartNameSelection | null {
  return buildWorkspaceSourceSelection(args)
}

export function resolveComposerCreateSelection(args: {
  linkedWorkItem: MobileLinkedWorkItem | null
  base: {
    baseBranch?: string
    compareBaseRef?: string
    pushTarget?: WorkspaceCreateGitPushTarget
    branchNameOverride?: string
  }
  branch: { refName: string; localBranchName: string } | null
  reuseEligibleBranch: string | null
  reuseSelectedBranch: boolean
  branchCreateIntent: boolean
  name: string
}): MobileComposerCreateSelection | null {
  const { linkedWorkItem, base, branch, reuseEligibleBranch, reuseSelectedBranch } = args
  if (linkedWorkItem) {
    return { kind: 'work-item', item: linkedWorkItem, ...base }
  }
  if (branch && base.baseBranch) {
    return {
      kind: 'branch',
      baseBranch: base.baseBranch,
      refName: branch.refName,
      localBranchName: branch.localBranchName,
      reuse: reuseSelectedBranch && reuseEligibleBranch === branch.localBranchName,
      branchNameOverride: base.branchNameOverride
    }
  }
  if (args.branchCreateIntent && args.name.trim()) {
    return { kind: 'new-branch', branchName: args.name.trim() }
  }
  return null
}

export type ComposerBranchPick = {
  base: { baseBranch: string; branchNameOverride?: string }
  reuseEligibleBranch: string | null
  reuseSelectedBranch: boolean
  name?: string
  lastAutoName?: string
}

export function resolveComposerBranchPick(args: {
  refName: string
  localBranchName: string
  currentName: string
  lastAutoName: string
  worktreeBranches: readonly string[]
}): ComposerBranchPick {
  const selection = resolveSharedComposerBranchPick(args)
  return {
    base: {
      baseBranch: selection.baseBranch,
      branchNameOverride: selection.branchNameOverride
    },
    reuseEligibleBranch: selection.reuseEligibleBranch,
    reuseSelectedBranch: selection.defaultReuse,
    ...(selection.name !== undefined && selection.lastAutoName !== undefined
      ? { name: selection.name, lastAutoName: selection.lastAutoName }
      : {})
  }
}

export type { GitHubWorkItem, GitLabWorkItem }
