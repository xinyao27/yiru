import type {
  GitLabAddMrCommentInputSchema as AddMRComment,
  GitLabAddMrInlineCommentInputSchema as AddMRInlineComment,
  GitLabEmptyInputSchema as EmptyParams,
  GitLabJobInputSchema as JobTrace,
  GitLabJobInputSchema as RetryJob,
  GitLabListMrsInputSchema as WorkItemsList,
  GitLabMergeMrInputSchema as MergeMr,
  GitLabMrForBranchInputSchema as MrForBranch,
  GitLabMrInputSchema as Mr,
  GitLabRateLimitInputSchema as GitLabRateLimit,
  GitLabRepoSelectorInputSchema as RepoSelector,
  GitLabResolveMrDiscussionInputSchema as ResolveMRDiscussion,
  GitLabUpdateMrInputSchema as UpdateMr,
  GitLabUpdateMrReviewersInputSchema as UpdateMrReviewers,
  GitLabUpdateMrStateInputSchema as UpdateMrState,
  GitLabWorkItemByPathInputSchema as WorkItemByPath,
  GitLabWorkItemDetailsInputSchema as WorkItemDetails
} from '@yiru/runtime-protocol/contract'
import type { z } from 'zod'

import type { RpcContext } from '../core'

export const handleGitLabViewer = (_params: z.infer<typeof EmptyParams>, { runtime }: RpcContext) =>
  runtime.getGitLabViewer()

export const handleGitLabProjectSlug = (
  params: z.infer<typeof RepoSelector>,
  { runtime }: RpcContext
) => runtime.getGitLabRepoProjectSlug(params.repo)

export const handleGitLabMrForBranch = (
  params: z.infer<typeof MrForBranch>,
  { runtime }: RpcContext
) => runtime.getGitLabRepoMRForBranch(params.repo, params.branch, params.linkedMRIid)

export const handleGitLabMr = (params: z.infer<typeof Mr>, { runtime }: RpcContext) =>
  runtime.getGitLabRepoMR(params.repo, params.iid)

export const handleGitLabListAssignableUsers = (
  params: z.infer<typeof RepoSelector>,
  { runtime }: RpcContext
) => runtime.listGitLabRepoAssignableUsers(params.repo)

export const handleGitLabListMRs = (
  params: z.infer<typeof WorkItemsList>,
  { runtime }: RpcContext
) => runtime.listGitLabRepoMRs(params.repo, params.state, params.page, params.perPage, params.query)

export const handleGitLabDiagnoseAuth = (
  _params: z.infer<typeof EmptyParams>,
  { runtime }: RpcContext
) => runtime.diagnoseGitLabAuth()

export const handleGitLabRateLimit = (
  params: z.infer<typeof GitLabRateLimit>,
  { runtime }: RpcContext
) => runtime.getGitLabRateLimit(params)

export const handleGitLabListLabels = (
  params: z.infer<typeof RepoSelector>,
  { runtime }: RpcContext
) => runtime.listGitLabRepoLabels(params.repo)

export const handleGitLabAddMRComment = (
  params: z.infer<typeof AddMRComment>,
  { runtime }: RpcContext
) => runtime.addGitLabRepoMRComment(params.repo, params.iid, params.body, params.projectRef)

export const handleGitLabAddMRInlineComment = (
  params: z.infer<typeof AddMRInlineComment>,
  { runtime }: RpcContext
) => runtime.addGitLabRepoMRInlineComment(params.repo, params.iid, params.input, params.projectRef)

export const handleGitLabResolveMRDiscussion = (
  params: z.infer<typeof ResolveMRDiscussion>,
  { runtime }: RpcContext
) =>
  runtime.resolveGitLabRepoMRDiscussion(
    params.repo,
    params.iid,
    params.discussionId,
    params.resolved,
    params.projectRef
  )

export const handleGitLabJobTrace = (params: z.infer<typeof JobTrace>, { runtime }: RpcContext) =>
  runtime.getGitLabRepoJobTrace(params.repo, params.jobId, params.projectRef)

export const handleGitLabRetryJob = (params: z.infer<typeof RetryJob>, { runtime }: RpcContext) =>
  runtime.retryGitLabRepoJob(params.repo, params.jobId, params.projectRef)

export const handleGitLabMergeMR = (params: z.infer<typeof MergeMr>, { runtime }: RpcContext) =>
  runtime.mergeGitLabRepoMR(params.repo, params.iid, params.method, params.projectRef)

export const handleGitLabUpdateMRState = (
  params: z.infer<typeof UpdateMrState>,
  { runtime }: RpcContext
) => runtime.updateGitLabRepoMRState(params.repo, params.iid, params.state, params.projectRef)

export const handleGitLabUpdateMR = (params: z.infer<typeof UpdateMr>, { runtime }: RpcContext) =>
  runtime.updateGitLabRepoMR(params.repo, params.iid, params.updates, params.projectRef)

export const handleGitLabUpdateMRReviewers = (
  params: z.infer<typeof UpdateMrReviewers>,
  { runtime }: RpcContext
) =>
  runtime.updateGitLabRepoMRReviewers(
    params.repo,
    params.iid,
    params.reviewerIds,
    params.projectRef
  )

export const handleGitLabWorkItemDetails = (
  params: z.infer<typeof WorkItemDetails>,
  { runtime }: RpcContext
) => runtime.getGitLabRepoWorkItemDetails(params.repo, params.iid, params.type, params.projectRef)

export const handleGitLabWorkItemByPath = (
  params: z.infer<typeof WorkItemByPath>,
  { runtime }: RpcContext
) =>
  runtime.getGitLabRepoWorkItemByPath(
    params.repo,
    { host: params.host, path: params.path },
    params.iid,
    params.type
  )
