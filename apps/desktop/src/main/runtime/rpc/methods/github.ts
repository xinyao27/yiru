import { defineMethod, type RpcMethod } from '../core'
import { GITHUB_PULL_REQUEST_WRITE_METHODS } from './github-pull-request-writes'
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
  PullRequestFileContents
} from './github-rpc-schemas'

export const GITHUB_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'github.repoSlug',
    mobile: true,
    params: RepoSelector,
    access: { scope: 'project', tier: 'read' },
    handler: async (params, { runtime }) => runtime.getRepoSlug(params.repo)
  }),
  defineMethod({
    name: 'github.repoUpstream',
    params: RepoSelector,
    access: { scope: 'project', tier: 'read' },
    handler: async (params, { runtime }) => runtime.getRepoUpstream(params.repo)
  }),
  defineMethod({
    name: 'github.rateLimit',
    params: RateLimit,
    access: { scope: 'host', tier: 'read' },
    handler: async (params, { runtime }) => runtime.getGitHubRateLimit(params)
  }),
  defineMethod({
    name: 'github.listWorkItems',
    mobile: true,
    params: WorkItemsList,
    access: { scope: 'project', tier: 'read' },
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
    access: { scope: 'project', tier: 'read' },
    handler: async (params, { runtime }) => runtime.listRepoLabels(params.repo)
  }),
  defineMethod({
    name: 'github.listAssignableUsers',
    mobile: true,
    params: RepoSelector,
    access: { scope: 'project', tier: 'read' },
    handler: async (params, { runtime }) => runtime.listRepoAssignableUsers(params.repo)
  }),
  defineMethod({
    name: 'github.workItem',
    mobile: true,
    params: WorkItem,
    access: { scope: 'project', tier: 'read' },
    handler: async (params, { runtime }) =>
      runtime.getRepoWorkItem(params.repo, params.number, params.type)
  }),
  defineMethod({
    name: 'github.workItemByOwnerRepo',
    mobile: true,
    params: WorkItemByOwnerRepo,
    access: { scope: 'host', tier: 'read' },
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
    access: { scope: 'project', tier: 'read' },
    handler: async (params, { runtime }) =>
      runtime.getRepoWorkItemDetails(params.repo, params.number, params.type)
  }),
  defineMethod({
    name: 'github.prForBranch',
    mobile: true,
    params: PrForBranch,
    access: { scope: 'project', tier: 'read' },
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
    access: { scope: 'project', tier: 'read' },
    handler: async (params, { runtime }) =>
      runtime.getRepoPRChecks(params.repo, params.prNumber, params.headSha, params.prRepo ?? null, {
        noCache: params.noCache
      })
  }),
  defineMethod({
    name: 'github.prCheckDetails',
    mobile: true,
    params: PullRequestCheckDetails,
    access: { scope: 'project', tier: 'read' },
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
    name: 'github.prComments',
    params: PullRequest,
    access: { scope: 'project', tier: 'read' },
    handler: async (params, { runtime }) =>
      runtime.getRepoPRComments(params.repo, params.prNumber, params.prRepo ?? null, {
        noCache: params.noCache
      })
  }),
  defineMethod({
    name: 'github.prFileContents',
    mobile: true,
    params: PullRequestFileContents,
    access: { scope: 'project', tier: 'read' },
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
  ...GITHUB_PULL_REQUEST_WRITE_METHODS
]
