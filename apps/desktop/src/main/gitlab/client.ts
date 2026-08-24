export { diagnoseAuth, getAuthenticatedViewer, getRateLimit } from './auth'
export { addMRComment, closeMR, mergeMR, reopenMR } from './merge-request-actions'
export { addMRInlineComment, resolveMRDiscussion } from './merge-request-discussions'
export { getWorkItemByProjectRef, listMergeRequests } from './merge-request-list'
export { getMergeRequest, getMergeRequestForBranch } from './merge-request-lookup'
export { listAssignableUsers, listLabels, updateMR } from './merge-request-update'
export { getJobTrace, retryJob, updateMRReviewers } from './pipeline-jobs'
export { getProjectSlug } from './project-context'

// Why: callers resolving pasted URLs need the remote-aware project lookup,
// while its CLI implementation remains internal to this feature.
export { getProjectRefForRemote } from './gitlab-cli'
