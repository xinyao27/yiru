import { normalizeGitHubPRMergeMethodSettings } from '@yiru/runtime-protocol/workbench/github-pr-merge-methods'

import { getPRByNumber } from './branch-lookup'
import type { PullRequestLookupData, RestPullRequest } from './branch-metadata'
import {
  PR_BRANCH_LIST_JSON_FIELDS,
  mapRestPullRequest,
  normalizePullRequestLookupData,
  cacheRepositoryMergeMetadata
} from './branch-metadata'
import type { GhExecOptions, GitHubRepositoryMergeMetadata } from './client-foundation'
import {
  MERGE_QUEUE_CACHE_TTL_MS,
  MERGE_QUEUE_UNKNOWN_CACHE_TTL_MS,
  repositoryMergeMetadataCache,
  pruneRepositoryMergeMetadataCache
} from './client-foundation'
import type { ghRepoExecOptions } from './github-cli'
import { ghExecFileAsync, type OwnerRepo } from './github-cli'
import { noteRateLimitSpend, rateLimitGuard } from './rate-limit'

export async function detectRepositoryMergeMetadata(
  ownerRepo: OwnerRepo,
  branchName: string | undefined,
  ghOptions: GhExecOptions
): Promise<GitHubRepositoryMergeMetadata> {
  const cacheKey = `${ownerRepo.owner.toLowerCase()}/${ownerRepo.repo.toLowerCase()}:${
    branchName ?? '__repo__'
  }`
  pruneRepositoryMergeMetadataCache()
  const cached = repositoryMergeMetadataCache.get(cacheKey)
  if (cached) {
    return cached.value
  }
  const guard = rateLimitGuard('graphql')
  if (guard.blocked) {
    return { mergeQueueRequired: null, autoMergeAllowed: null }
  }
  const query = branchName
    ? `query($owner: String!, $repo: String!, $branch: String!) {
    repository(owner: $owner, name: $repo) {
      viewerDefaultMergeMethod
      mergeCommitAllowed
      rebaseMergeAllowed
      squashMergeAllowed
      autoMergeAllowed
      mergeQueue(branch: $branch) { id }
    }
  }`
    : `query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      viewerDefaultMergeMethod
      mergeCommitAllowed
      rebaseMergeAllowed
      squashMergeAllowed
      autoMergeAllowed
    }
  }`
  try {
    noteRateLimitSpend('graphql')
    const args = [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-f',
      `owner=${ownerRepo.owner}`,
      '-f',
      `repo=${ownerRepo.repo}`
    ]
    if (branchName) {
      args.push('-f', `branch=${branchName}`)
    }
    const { stdout } = await ghExecFileAsync(args, ghOptions)
    const parsed = JSON.parse(stdout) as {
      data?: {
        repository?: {
          viewerDefaultMergeMethod?: unknown
          mergeCommitAllowed?: unknown
          rebaseMergeAllowed?: unknown
          squashMergeAllowed?: unknown
          autoMergeAllowed?: unknown
          mergeQueue?: { id?: unknown } | null
        } | null
      }
    }
    const repository = parsed.data?.repository
    const mergeMethodSettings = repository
      ? normalizeGitHubPRMergeMethodSettings({
          defaultMethod: repository.viewerDefaultMergeMethod,
          mergeCommitAllowed: repository.mergeCommitAllowed,
          rebaseMergeAllowed: repository.rebaseMergeAllowed,
          squashMergeAllowed: repository.squashMergeAllowed
        })
      : undefined
    const value: GitHubRepositoryMergeMetadata = {
      mergeQueueRequired: branchName ? Boolean(repository?.mergeQueue) : null,
      autoMergeAllowed:
        typeof repository?.autoMergeAllowed === 'boolean' ? repository.autoMergeAllowed : null,
      ...(mergeMethodSettings ? { mergeMethodSettings } : {})
    }
    cacheRepositoryMergeMetadata(cacheKey, value, MERGE_QUEUE_CACHE_TTL_MS)
    return value
  } catch {
    // Why: failed merge-queue probes should stay conservative without
    // retrying GraphQL on every status poll while GitHub/network is unhappy.
    const value: GitHubRepositoryMergeMetadata = {
      mergeQueueRequired: null,
      autoMergeAllowed: null
    }
    cacheRepositoryMergeMetadata(cacheKey, value, MERGE_QUEUE_UNKNOWN_CACHE_TTL_MS)
    return value
  }
}

export async function hydratePullRequestLookupData(
  ownerRepo: OwnerRepo,
  data: PullRequestLookupData,
  ghOptions: GhExecOptions
): Promise<PullRequestLookupData> {
  const normalized = normalizePullRequestLookupData(data)
  const hasRichMergeFields =
    'reviewDecision' in data || 'mergeStateStatus' in data || 'autoMergeRequest' in data
  const mergeMetadata = hasRichMergeFields
    ? await detectRepositoryMergeMetadata(ownerRepo, normalized.baseRefName, ghOptions)
    : undefined
  return {
    ...normalized,
    ...(mergeMetadata ? { mergeQueueRequired: mergeMetadata.mergeQueueRequired } : {}),
    ...(mergeMetadata ? { autoMergeAllowed: mergeMetadata.autoMergeAllowed } : {}),
    ...(mergeMetadata?.mergeMethodSettings
      ? { mergeMethodSettings: mergeMetadata.mergeMethodSettings }
      : {})
  }
}

export async function hydrateBranchLookupWithExactPR(
  ownerRepo: OwnerRepo,
  branchData: PullRequestLookupData | null,
  ghOptions: GhExecOptions
): Promise<PullRequestLookupData | null> {
  if (!branchData) {
    return null
  }
  try {
    return (await getPRByNumber(ownerRepo, branchData.number, ghOptions)) ?? branchData
  } catch {
    return branchData
  }
}

export async function getRestPRForBranch(
  prRepo: OwnerRepo,
  headOwner: string,
  branchName: string,
  ghOptions: ReturnType<typeof ghRepoExecOptions>
): Promise<PullRequestLookupData | null> {
  const head = encodeURIComponent(`${headOwner}:${branchName}`)
  const { stdout } = await ghExecFileAsync(
    ['api', `repos/${prRepo.owner}/${prRepo.repo}/pulls?head=${head}&state=all&per_page=1`],
    ghOptions
  )
  const list = JSON.parse(stdout) as RestPullRequest[]
  const pr = list[0]
  return pr ? mapRestPullRequest(pr) : null
}

export async function getFallbackPRListForBranch(
  prRepo: OwnerRepo,
  branchName: string,
  ghOptions: ReturnType<typeof ghRepoExecOptions>
): Promise<PullRequestLookupData | null> {
  const { stdout } = await ghExecFileAsync(
    [
      'pr',
      'list',
      '--repo',
      `${prRepo.owner}/${prRepo.repo}`,
      '--head',
      branchName,
      '--state',
      'all',
      '--limit',
      '1',
      '--json',
      PR_BRANCH_LIST_JSON_FIELDS
    ],
    ghOptions
  )
  const list = JSON.parse(stdout) as PullRequestLookupData[]
  return list[0] ?? null
}
