import { addRepoMethods } from './add-repo'
import { analyzeWorkspaceSpaceMethods } from './analyze-workspace-space'
import { cloneRepoAfterPathLockMethods } from './clone-repo-after-path-lock'
import { createRepoMethods } from './create-repo'
import { getGitLabRepoMrforBranchMethods } from './get-git-lab-repo-mrfor-branch'
import { getHostedReviewForBranchMethods } from './get-hosted-review-for-branch'
import { getRepoUpstreamMethods } from './get-repo-upstream'
import { listReposMethods } from './list-repos'
import { mergeRepoPrMethods } from './merge-repo-pr'
import { moveProjectToGroupMethods } from './move-project-to-group'
import { resolveGitLabRepoMrdiscussionMethods } from './resolve-git-lab-repo-mrdiscussion'
import { saveSparsePresetMethods } from './save-sparse-preset'
import type { RepositoryServiceContext, RepositoryServiceDeps } from './service-context'
import { updateRepoMethods } from './update-repo'

export function createRepositoryService(deps: RepositoryServiceDeps) {
  const context = Object.assign(
    {
      ...deps,
      activeRepoClone: null,
      cloneInFlightByPath: new Map<string, Promise<void>>(),
      workspacePathOpenTail: Promise.resolve()
    },
    repositoryServiceMethods
  ) satisfies RepositoryServiceContext
  return context
}

export type RepositoryService = ReturnType<typeof createRepositoryService>

export const repositoryServiceMethods = {
  ...listReposMethods,
  ...moveProjectToGroupMethods,
  ...analyzeWorkspaceSpaceMethods,
  ...saveSparsePresetMethods,
  ...addRepoMethods,
  ...createRepoMethods,
  ...cloneRepoAfterPathLockMethods,
  ...updateRepoMethods,
  ...getRepoUpstreamMethods,
  ...getHostedReviewForBranchMethods,
  ...resolveGitLabRepoMrdiscussionMethods,
  ...getGitLabRepoMrforBranchMethods,
  ...mergeRepoPrMethods
}

export type RepositoryServiceMethods = typeof repositoryServiceMethods
