import type { ExecutionHostScope } from '@yiru/runtime-protocol/model/workspace'
import type { Repo } from '@yiru/runtime-protocol/workbench/types'
import {
  getNewWorkspaceDialogEligibleRepos,
  resolveNewWorkspaceDialogGitRepoId,
  resolveNewWorkspaceDialogRepoId
} from '~renderer/new-workspace-dialog-repo'

export function getComposerEligibleRepos(repos: readonly Repo[]): Repo[] {
  return getNewWorkspaceDialogEligibleRepos(repos)
}

export function resolveComposerRepoId(input: {
  eligibleRepos: readonly Repo[]
  draftRepoId?: string | null
  initialRepoId?: string | null
  activeRepoId?: string | null
  focusedHostScope?: ExecutionHostScope | null
}): string {
  return resolveNewWorkspaceDialogRepoId(input)
}

export function resolveComposerGitRepoId(input: {
  eligibleRepos: readonly Repo[]
  draftRepoId?: string | null
  initialRepoId?: string | null
  activeRepoId?: string | null
  focusedHostScope?: ExecutionHostScope | null
}): string | null {
  return resolveNewWorkspaceDialogGitRepoId(input)
}
