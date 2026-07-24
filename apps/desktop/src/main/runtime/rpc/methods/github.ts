import { defineMethod, type RpcMethod } from '../core'
import {
  RepoSelector,
  WorkItemsList,
  WorkItem,
  WorkItemByOwnerRepo,
  WorkItemDetails,
  RateLimit,
  PrForBranch,
  PullRequest,
  PullRequestChecks,
  PullRequestCheckDetails,
  RerunPullRequestChecks,
  PullRequestFileContents,
  PullRequestFileViewed,
  ReviewThread,
  UpdatePrTitle,
  UpdatePr,
  MergePr,
  SetPrAutoMerge,
  UpdatePrState,
  RequestPrReviewers,
  RemovePrReviewers,
  PullRequestComment,
  PRReviewComment,
  PRReviewCommentReply
} from './github-rpc-schemas'

export const GITHUB_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'github.repoSlug',
    mobile: true,
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.getRepoSlug(params.repo)
  }),
  defineMethod({
    name: 'github.repoUpstream',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.getRepoUpstream(params.repo)
  }),
  defineMethod({
    name: 'github.rateLimit',
    params: RateLimit,
    handler: async (params, { runtime }) => runtime.getGitHubRateLimit(params)
  }),
  defineMethod({
    name: 'github.listWorkItems',
    mobile: true,
    params: WorkItemsList,
    handler: async (params, { runtime }) =>
      runtime.listRepoWorkItems(
        params.repo,
        params.limit,
        params.query,
        params.page,
        params.noCache
      )
  }),
  defineMethod({
    name: 'github.listLabels',
    mobile: true,
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.listRepoLabels(params.repo)
  }),
  defineMethod({
    name: 'github.listAssignableUsers',
    mobile: true,
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.listRepoAssignableUsers(params.repo)
  }),
  defineMethod({
    name: 'github.workItem',
    mobile: true,
    params: WorkItem,
    handler: async (params, { runtime }) =>
      runtime.getRepoWorkItem(params.repo, params.number, params.type)
  }),
  defineMethod({
    name: 'github.workItemByOwnerRepo',
    mobile: true,
    params: WorkItemByOwnerRepo,
    handler: async (params, { runtime }) =>
      runtime.getRepoWorkItemByOwnerRepo(
        params.repo,
        { owner: params.owner, repo: params.ownerRepo },
        params.number,
        params.type
      )
  }),
  defineMethod({
    name: 'github.workItemDetails',
    mobile: true,
    params: WorkItemDetails,
    handler: async (params, { runtime }) =>
      runtime.getRepoWorkItemDetails(params.repo, params.number, params.type)
  }),
  defineMethod({
    name: 'github.prForBranch',
    mobile: true,
    params: PrForBranch,
    handler: async (params, { runtime }) =>
      runtime.getRepoPRForBranch(
        params.repo,
        params.branch,
        params.linkedPRNumber,
        params.fallbackPRNumber,
        params.acceptMergedFallbackPR,
        params.currentHeadOid
      )
  }),
  defineMethod({
    name: 'github.prChecks',
    mobile: true,
    params: PullRequestChecks,
    handler: async (params, { runtime }) =>
      runtime.getRepoPRChecks(params.repo, params.prNumber, params.headSha, params.prRepo ?? null, {
        noCache: params.noCache
      })
  }),
  defineMethod({
    name: 'github.prCheckDetails',
    mobile: true,
    params: PullRequestCheckDetails,
    handler: async (params, { runtime }) =>
      runtime.getRepoPRCheckDetails(params.repo, {
        checkRunId: params.checkRunId,
        workflowRunId: params.workflowRunId,
        checkName: params.checkName,
        url: params.url,
        prRepo: params.prRepo ?? null
      })
  }),
  defineMethod({
    name: 'github.rerunPRChecks',
    mobile: true,
    params: RerunPullRequestChecks,
    handler: async (params, { runtime }) =>
      runtime.rerunRepoPRChecks(params.repo, params.prNumber, {
        headSha: params.headSha,
        failedOnly: params.failedOnly
      })
  }),
  defineMethod({
    name: 'github.prComments',
    params: PullRequest,
    handler: async (params, { runtime }) =>
      runtime.getRepoPRComments(params.repo, params.prNumber, params.prRepo ?? null, {
        noCache: params.noCache
      })
  }),
  defineMethod({
    name: 'github.prFileContents',
    mobile: true,
    params: PullRequestFileContents,
    handler: async (params, { runtime }) =>
      runtime.getRepoPRFileContents(params.repo, {
        prNumber: params.prNumber,
        path: params.path,
        oldPath: params.oldPath,
        status: params.status,
        headSha: params.headSha,
        baseSha: params.baseSha
      })
  }),
  defineMethod({
    name: 'github.resolveReviewThread',
    mobile: true,
    params: ReviewThread,
    handler: async (params, { runtime }) =>
      runtime.resolveRepoReviewThread(params.repo, params.threadId, params.resolve)
  }),
  defineMethod({
    name: 'github.setPRFileViewed',
    mobile: true,
    params: PullRequestFileViewed,
    handler: async (params, { runtime }) =>
      runtime.setRepoPRFileViewed(params.repo, {
        pullRequestId: params.pullRequestId,
        path: params.path,
        viewed: params.viewed
      })
  }),
  defineMethod({
    name: 'github.updatePRTitle',
    mobile: true,
    params: UpdatePrTitle,
    handler: async (params, { runtime }) =>
      runtime.updateRepoPRTitle(params.repo, params.prNumber, params.title, params.prRepo ?? null)
  }),
  defineMethod({
    name: 'github.updatePR',
    mobile: true,
    params: UpdatePr,
    handler: async (params, { runtime }) =>
      runtime.updateRepoPRDetails(
        params.repo,
        params.prNumber,
        params.updates,
        params.prRepo ?? null
      )
  }),
  defineMethod({
    name: 'github.mergePR',
    mobile: true,
    params: MergePr,
    handler: async (params, { runtime }) =>
      runtime.mergeRepoPR(params.repo, params.prNumber, params.method, params.prRepo ?? null)
  }),
  defineMethod({
    name: 'github.setPRAutoMerge',
    mobile: true,
    params: SetPrAutoMerge,
    handler: async (params, { runtime }) =>
      runtime.setRepoPRAutoMerge(
        params.repo,
        params.prNumber,
        params.enabled,
        params.method,
        params.prRepo ?? null
      )
  }),
  defineMethod({
    name: 'github.updatePRState',
    mobile: true,
    params: UpdatePrState,
    handler: async (params, { runtime }) =>
      runtime.updateRepoPRState(params.repo, params.prNumber, params.updates)
  }),
  defineMethod({
    name: 'github.requestPRReviewers',
    mobile: true,
    params: RequestPrReviewers,
    handler: async (params, { runtime }) =>
      runtime.requestRepoPRReviewers(params.repo, params.prNumber, params.reviewers)
  }),
  defineMethod({
    name: 'github.removePRReviewers',
    mobile: true,
    params: RemovePrReviewers,
    handler: async (params, { runtime }) =>
      runtime.removeRepoPRReviewers(params.repo, params.prNumber, params.reviewers)
  }),
  defineMethod({
    name: 'github.addPRComment',
    mobile: true,
    params: PullRequestComment,
    handler: async (params, { runtime }) =>
      runtime.addRepoPRComment(params.repo, params.number, params.body, params.prRepo ?? null)
  }),
  defineMethod({
    name: 'github.addPRReviewComment',
    mobile: true,
    params: PRReviewComment,
    handler: async (params, { runtime }) =>
      runtime.addRepoPRReviewComment(params.repo, {
        prNumber: params.prNumber,
        commitId: params.commitId,
        path: params.path,
        line: params.line,
        startLine: params.startLine,
        body: params.body
      })
  }),
  defineMethod({
    name: 'github.addPRReviewCommentReply',
    mobile: true,
    params: PRReviewCommentReply,
    handler: async (params, { runtime }) =>
      runtime.addRepoPRReviewCommentReply(params.repo, {
        prNumber: params.prNumber,
        commentId: params.commentId,
        body: params.body,
        threadId: params.threadId,
        path: params.path,
        line: params.line,
        prRepo: params.prRepo ?? null
      })
  })
]
