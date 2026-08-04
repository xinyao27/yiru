import { defineMethod, type RpcMethod } from '../core'
import {
  MergePr,
  PRReviewComment,
  PRReviewCommentReply,
  PullRequestComment,
  PullRequestFileViewed,
  RemovePrReviewers,
  RequestPrReviewers,
  RerunPullRequestChecks,
  ReviewThread,
  SetPrAutoMerge,
  UpdatePr,
  UpdatePrState,
  UpdatePrTitle
} from './github-rpc-schemas'

// Why: split out of github.ts to stay under the 300-line ceiling once every
// method carries an `access` declaration. The seam is real — these are the
// calls that mutate state on GitHub under the owner's identity, which is why
// they all sit at the `host` tier while the read half does not.
export const GITHUB_PULL_REQUEST_WRITE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'github.rerunPRChecks',
    mobile: true,
    params: RerunPullRequestChecks,
    access: { scope: 'project', tier: 'host' },
    handler: async (params, { runtime }) =>
      runtime.rerunRepoPRChecks(params.repo, params.prNumber, {
        headSha: params.headSha,
        failedOnly: params.failedOnly
      })
  }),
  defineMethod({
    name: 'github.resolveReviewThread',
    mobile: true,
    params: ReviewThread,
    access: { scope: 'project', tier: 'host' },
    handler: async (params, { runtime }) =>
      runtime.resolveRepoReviewThread(params.repo, params.threadId, params.resolve)
  }),
  defineMethod({
    name: 'github.setPRFileViewed',
    mobile: true,
    params: PullRequestFileViewed,
    access: { scope: 'project', tier: 'host' },
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
    access: { scope: 'project', tier: 'host' },
    handler: async (params, { runtime }) =>
      runtime.updateRepoPRTitle(params.repo, params.prNumber, params.title, params.prRepo ?? null)
  }),
  defineMethod({
    name: 'github.updatePR',
    mobile: true,
    params: UpdatePr,
    access: { scope: 'project', tier: 'host' },
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
    access: { scope: 'project', tier: 'host' },
    handler: async (params, { runtime }) =>
      runtime.mergeRepoPR(params.repo, params.prNumber, params.method, params.prRepo ?? null)
  }),
  defineMethod({
    name: 'github.setPRAutoMerge',
    mobile: true,
    params: SetPrAutoMerge,
    access: { scope: 'project', tier: 'host' },
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
    access: { scope: 'project', tier: 'host' },
    handler: async (params, { runtime }) =>
      runtime.updateRepoPRState(params.repo, params.prNumber, params.updates)
  }),
  defineMethod({
    name: 'github.requestPRReviewers',
    mobile: true,
    params: RequestPrReviewers,
    access: { scope: 'project', tier: 'host' },
    handler: async (params, { runtime }) =>
      runtime.requestRepoPRReviewers(params.repo, params.prNumber, params.reviewers)
  }),
  defineMethod({
    name: 'github.removePRReviewers',
    mobile: true,
    params: RemovePrReviewers,
    access: { scope: 'project', tier: 'host' },
    handler: async (params, { runtime }) =>
      runtime.removeRepoPRReviewers(params.repo, params.prNumber, params.reviewers)
  }),
  defineMethod({
    name: 'github.addPRComment',
    mobile: true,
    params: PullRequestComment,
    access: { scope: 'project', tier: 'host' },
    handler: async (params, { runtime }) =>
      runtime.addRepoPRComment(params.repo, params.number, params.body, params.prRepo ?? null)
  }),
  defineMethod({
    name: 'github.addPRReviewComment',
    mobile: true,
    params: PRReviewComment,
    access: { scope: 'project', tier: 'host' },
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
    access: { scope: 'project', tier: 'host' },
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
