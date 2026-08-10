import { type, type ContractRouter } from '@orpc/contract'
import type {
  GetGitLabRateLimitResult,
  GitLabAssignableUser,
  GitLabAuthDiagnostic,
  GitLabCommentResult,
  GitLabDiscussionResolveResult,
  GitLabJobTraceResult,
  GitLabMRReviewersUpdateResult,
  GitLabProjectRef,
  GitLabRetryJobResult,
  GitLabViewer,
  GitLabWorkItem,
  GitLabWorkItemDetails,
  ListMergeRequestsResult,
  MRInfo
} from '@yiru/workbench-model/review'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  GitLabAddMrCommentInputSchema,
  GitLabAddMrInlineCommentInputSchema,
  GitLabEmptyInputSchema,
  GitLabJobInputSchema,
  GitLabListMrsInputSchema,
  GitLabMergeMrInputSchema,
  GitLabMrForBranchInputSchema,
  GitLabMrInputSchema,
  GitLabRateLimitInputSchema,
  GitLabRepoSelectorInputSchema,
  GitLabResolveMrDiscussionInputSchema,
  GitLabUpdateMrInputSchema,
  GitLabUpdateMrReviewersInputSchema,
  GitLabUpdateMrStateInputSchema,
  GitLabWorkItemByPathInputSchema,
  GitLabWorkItemDetailsInputSchema
} from './gitlab-inputs.js'

export type GitLabMutationResult = { ok: true } | { ok: false; error: string }

const GITLAB_READ_ACCESS = { scope: 'project', tier: 'read' } as const
const GITLAB_HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const GITLAB_WRITE_ACCESS = { scope: 'project', tier: 'host' } as const
const MOBILE_CLIENT = { mobile: true } as const

export const gitlabContract = {
  viewer: withAccess(GITLAB_HOST_READ_ACCESS)
    .input(GitLabEmptyInputSchema)
    .output(type<GitLabViewer | null>()),
  listMRs: withAccess(GITLAB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitLabListMrsInputSchema)
    .output(type<ListMergeRequestsResult>()),
  diagnoseAuth: withAccess(GITLAB_HOST_READ_ACCESS)
    .input(GitLabEmptyInputSchema)
    .output(type<GitLabAuthDiagnostic>()),
  rateLimit: withAccess(GITLAB_HOST_READ_ACCESS)
    .input(GitLabRateLimitInputSchema)
    .output(type<GetGitLabRateLimitResult>()),
  projectSlug: withAccess(GITLAB_READ_ACCESS)
    .input(GitLabRepoSelectorInputSchema)
    .output(type<GitLabProjectRef | null>()),
  mrForBranch: withAccess(GITLAB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitLabMrForBranchInputSchema)
    .output(type<MRInfo | null>()),
  mr: withAccess(GITLAB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitLabMrInputSchema)
    .output(type<MRInfo | null>()),
  listLabels: withAccess(GITLAB_READ_ACCESS)
    .input(GitLabRepoSelectorInputSchema)
    .output(type<string[]>()),
  listAssignableUsers: withAccess(GITLAB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitLabRepoSelectorInputSchema)
    .output(type<GitLabAssignableUser[]>()),
  addMRComment: withAccess(GITLAB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitLabAddMrCommentInputSchema)
    .output(type<GitLabCommentResult>()),
  addMRInlineComment: withAccess(GITLAB_WRITE_ACCESS)
    .input(GitLabAddMrInlineCommentInputSchema)
    .output(type<GitLabCommentResult>()),
  resolveMRDiscussion: withAccess(GITLAB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitLabResolveMrDiscussionInputSchema)
    .output(type<GitLabDiscussionResolveResult>()),
  jobTrace: withAccess(GITLAB_READ_ACCESS)
    .input(GitLabJobInputSchema)
    .output(type<GitLabJobTraceResult>()),
  retryJob: withAccess(GITLAB_WRITE_ACCESS)
    .input(GitLabJobInputSchema)
    .output(type<GitLabRetryJobResult>()),
  mergeMR: withAccess(GITLAB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitLabMergeMrInputSchema)
    .output(type<GitLabMutationResult>()),
  updateMRState: withAccess(GITLAB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitLabUpdateMrStateInputSchema)
    .output(type<GitLabMutationResult>()),
  updateMR: withAccess(GITLAB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitLabUpdateMrInputSchema)
    .output(type<GitLabMutationResult>()),
  updateMRReviewers: withAccess(GITLAB_WRITE_ACCESS)
    .input(GitLabUpdateMrReviewersInputSchema)
    .output(type<GitLabMRReviewersUpdateResult>()),
  workItemDetails: withAccess(GITLAB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitLabWorkItemDetailsInputSchema)
    .output(type<GitLabWorkItemDetails | null>()),
  workItemByPath: withAccess(GITLAB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitLabWorkItemByPathInputSchema)
    .output(type<GitLabWorkItem | null>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export {
  GitLabAddMrCommentInputSchema,
  GitLabAddMrInlineCommentInputSchema,
  GitLabEmptyInputSchema,
  GitLabJobInputSchema,
  GitLabListMrsInputSchema,
  GitLabMergeMrInputSchema,
  GitLabMrForBranchInputSchema,
  GitLabMrInputSchema,
  GitLabProjectRefInputSchema,
  GitLabRateLimitInputSchema,
  GitLabRepoSelectorInputSchema,
  GitLabResolveMrDiscussionInputSchema,
  GitLabUpdateMrInputSchema,
  GitLabUpdateMrReviewersInputSchema,
  GitLabUpdateMrStateInputSchema,
  GitLabWorkItemByPathInputSchema,
  GitLabWorkItemDetailsInputSchema
} from './gitlab-inputs.js'
