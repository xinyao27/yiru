import {
  handleGitLabAddMRComment,
  handleGitLabAddMRInlineComment,
  handleGitLabDiagnoseAuth,
  handleGitLabJobTrace,
  handleGitLabListAssignableUsers,
  handleGitLabListLabels,
  handleGitLabListMRs,
  handleGitLabMergeMR,
  handleGitLabMr,
  handleGitLabMrForBranch,
  handleGitLabProjectSlug,
  handleGitLabRateLimit,
  handleGitLabResolveMRDiscussion,
  handleGitLabRetryJob,
  handleGitLabUpdateMR,
  handleGitLabUpdateMRReviewers,
  handleGitLabUpdateMRState,
  handleGitLabViewer,
  handleGitLabWorkItemByPath,
  handleGitLabWorkItemDetails
} from '~main/runtime/rpc/methods/gitlab'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: GitLab's hosted-review surface — kept apart from github.ts even though
// the two providers mirror each other, because each domain alone is already
// large enough to earn its own file.
export const gitlabRuntimeHandlers = {
  gitlab: {
    viewer: runtimeImplementation.gitlab.viewer.handler(
      wireRuntimeMethod('gitlab.viewer', handleGitLabViewer)
    ),
    projectSlug: runtimeImplementation.gitlab.projectSlug.handler(
      wireRuntimeMethod('gitlab.projectSlug', handleGitLabProjectSlug)
    ),
    mrForBranch: runtimeImplementation.gitlab.mrForBranch.handler(
      wireRuntimeMethod('gitlab.mrForBranch', handleGitLabMrForBranch)
    ),
    mr: runtimeImplementation.gitlab.mr.handler(wireRuntimeMethod('gitlab.mr', handleGitLabMr)),
    listAssignableUsers: runtimeImplementation.gitlab.listAssignableUsers.handler(
      wireRuntimeMethod('gitlab.listAssignableUsers', handleGitLabListAssignableUsers)
    ),
    listMRs: runtimeImplementation.gitlab.listMRs.handler(
      wireRuntimeMethod('gitlab.listMRs', handleGitLabListMRs)
    ),
    diagnoseAuth: runtimeImplementation.gitlab.diagnoseAuth.handler(
      wireRuntimeMethod('gitlab.diagnoseAuth', handleGitLabDiagnoseAuth)
    ),
    rateLimit: runtimeImplementation.gitlab.rateLimit.handler(
      wireRuntimeMethod('gitlab.rateLimit', handleGitLabRateLimit)
    ),
    listLabels: runtimeImplementation.gitlab.listLabels.handler(
      wireRuntimeMethod('gitlab.listLabels', handleGitLabListLabels)
    ),
    addMRComment: runtimeImplementation.gitlab.addMRComment.handler(
      wireRuntimeMethod('gitlab.addMRComment', handleGitLabAddMRComment)
    ),
    addMRInlineComment: runtimeImplementation.gitlab.addMRInlineComment.handler(
      wireRuntimeMethod('gitlab.addMRInlineComment', handleGitLabAddMRInlineComment)
    ),
    resolveMRDiscussion: runtimeImplementation.gitlab.resolveMRDiscussion.handler(
      wireRuntimeMethod('gitlab.resolveMRDiscussion', handleGitLabResolveMRDiscussion)
    ),
    jobTrace: runtimeImplementation.gitlab.jobTrace.handler(
      wireRuntimeMethod('gitlab.jobTrace', handleGitLabJobTrace)
    ),
    retryJob: runtimeImplementation.gitlab.retryJob.handler(
      wireRuntimeMethod('gitlab.retryJob', handleGitLabRetryJob)
    ),
    mergeMR: runtimeImplementation.gitlab.mergeMR.handler(
      wireRuntimeMethod('gitlab.mergeMR', handleGitLabMergeMR)
    ),
    updateMRState: runtimeImplementation.gitlab.updateMRState.handler(
      wireRuntimeMethod('gitlab.updateMRState', handleGitLabUpdateMRState)
    ),
    updateMR: runtimeImplementation.gitlab.updateMR.handler(
      wireRuntimeMethod('gitlab.updateMR', handleGitLabUpdateMR)
    ),
    updateMRReviewers: runtimeImplementation.gitlab.updateMRReviewers.handler(
      wireRuntimeMethod('gitlab.updateMRReviewers', handleGitLabUpdateMRReviewers)
    ),
    workItemDetails: runtimeImplementation.gitlab.workItemDetails.handler(
      wireRuntimeMethod('gitlab.workItemDetails', handleGitLabWorkItemDetails)
    ),
    workItemByPath: runtimeImplementation.gitlab.workItemByPath.handler(
      wireRuntimeMethod('gitlab.workItemByPath', handleGitLabWorkItemByPath)
    )
  }
} as const
