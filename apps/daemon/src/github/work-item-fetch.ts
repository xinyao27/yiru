import { isGitHubWorkItemsQueryTooLarge } from '@yiru/runtime-protocol/workbench/github-work-items-query-bounds'
import type {
  ForgeRemotePreference,
  ListWorkItemsResult
} from '@yiru/runtime-protocol/workbench/types'

import { detectRepositoryMergeMetadata } from './branch-hydration'
import type { GhExecOptions } from './client-foundation'
import {
  ghExecFileAsync,
  getOwnerRepo,
  ghRepoExecOptions,
  githubRepoContext,
  type LocalGitExecOptions,
  type OwnerRepo
} from './github-cli'
import type { MainWorkItem } from './work-item-mapping'
import {
  WORK_ITEM_NUMBER_SORT_QUALIFIER,
  WORK_ITEM_PR_LIST_JSON_FIELDS,
  WORK_ITEM_PR_DETAIL_JSON_FIELDS,
  usersFromUnknown,
  latestReviewsFromUnknown,
  mapPullRequestWorkItem
} from './work-item-mapping'

export async function hydrateWorkItemRepositoryMergeMetadata(
  items: MainWorkItem[],
  ownerRepo: OwnerRepo | null,
  ghOptions: GhExecOptions
): Promise<MainWorkItem[]> {
  const hasPullRequest = items.some((item) => item.type === 'pr')
  if (!ownerRepo || !hasPullRequest) {
    return items
  }
  // Why: merge method settings are repository-level, so one cached metadata
  // probe can keep pull-request rows accurate without per-PR GraphQL fan-out.
  const mergeMetadata = await detectRepositoryMergeMetadata(ownerRepo, undefined, ghOptions)
  if (!mergeMetadata.mergeMethodSettings && mergeMetadata.autoMergeAllowed === null) {
    return items
  }
  return items.map((item) =>
    item.type === 'pr'
      ? {
          ...item,
          ...(mergeMetadata.autoMergeAllowed !== null
            ? { autoMergeAllowed: mergeMetadata.autoMergeAllowed }
            : {}),
          ...(mergeMetadata.mergeMethodSettings
            ? { mergeMethodSettings: mergeMetadata.mergeMethodSettings }
            : {})
        }
      : item
  )
}

// REST /pulls/{n} has requested_reviewers but not latestReviews. When the JSON
// `gh pr view` path fails, still pull review fields from gh so mobile/desktop
// reviewer lists (CodeRabbit COMMENTED, etc.) are not silently empty.
export const WORK_ITEM_PR_REVIEW_JSON_FIELDS = 'reviewRequests,latestReviews'

export async function fetchPullRequestReviewFields(
  number: number,
  ownerRepo: OwnerRepo | null,
  ghOptions: GhExecOptions
): Promise<Pick<MainWorkItem, 'reviewRequests' | 'latestReviews'>> {
  try {
    const args = ownerRepo
      ? [
          'pr',
          'view',
          String(number),
          '--repo',
          `${ownerRepo.owner}/${ownerRepo.repo}`,
          '--json',
          WORK_ITEM_PR_REVIEW_JSON_FIELDS
        ]
      : ['pr', 'view', String(number), '--json', WORK_ITEM_PR_REVIEW_JSON_FIELDS]
    const { stdout } = await ghExecFileAsync(args, ghOptions)
    const item = JSON.parse(stdout) as Record<string, unknown>
    return {
      ...(item.reviewRequests !== undefined
        ? { reviewRequests: usersFromUnknown(item.reviewRequests) }
        : {}),
      ...(item.latestReviews !== undefined
        ? { latestReviews: latestReviewsFromUnknown(item.latestReviews) }
        : {})
    }
  } catch {
    return {}
  }
}

export async function fetchPullRequestWorkItem(
  repoPath: string,
  ownerRepo: OwnerRepo | null,
  number: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<MainWorkItem> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  if (ownerRepo) {
    try {
      const { stdout } = await ghExecFileAsync(
        [
          'pr',
          'view',
          String(number),
          '--repo',
          `${ownerRepo.owner}/${ownerRepo.repo}`,
          '--json',
          WORK_ITEM_PR_DETAIL_JSON_FIELDS
        ],
        ghOptions
      )
      const item = JSON.parse(stdout) as Record<string, unknown>
      const mapped = mapPullRequestWorkItem(item, ownerRepo)
      // Why: merge-metadata GraphQL is best-effort. A failure here must not fall
      // through to the REST path below — that path drops latestReviews and blanks
      // the mobile/desktop reviewer list for bots that only left a review.
      const baseRefName = typeof item.baseRefName === 'string' ? item.baseRefName : undefined
      try {
        const mergeMetadata = await detectRepositoryMergeMetadata(ownerRepo, baseRefName, ghOptions)
        return {
          ...mapped,
          mergeQueueRequired: mergeMetadata.mergeQueueRequired,
          ...(mergeMetadata.autoMergeAllowed !== null
            ? { autoMergeAllowed: mergeMetadata.autoMergeAllowed }
            : {}),
          ...(mergeMetadata.mergeMethodSettings
            ? { mergeMethodSettings: mergeMetadata.mergeMethodSettings }
            : {})
        }
      } catch {
        return mapped
      }
    } catch {
      const { stdout } = await ghExecFileAsync(
        ['api', `repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${number}`],
        ghOptions
      )
      const mapped = mapPullRequestWorkItem(
        JSON.parse(stdout) as Record<string, unknown>,
        ownerRepo
      )
      const reviewFields = await fetchPullRequestReviewFields(number, ownerRepo, ghOptions)
      return { ...mapped, ...reviewFields }
    }
  }

  const { stdout } = await ghExecFileAsync(
    ['pr', 'view', String(number), '--json', WORK_ITEM_PR_DETAIL_JSON_FIELDS],
    ghOptions
  )
  return mapPullRequestWorkItem(JSON.parse(stdout) as Record<string, unknown>)
}

export function normalizeWorkItemPage(page: number | undefined): number {
  return typeof page === 'number' && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
}

export async function listWorkItems(
  repoPath: string,
  limit = 30,
  query?: string,
  page?: number,
  _preference?: ForgeRemotePreference,
  connectionId?: string | null,
  _noCache?: boolean,
  localGitOptions: LocalGitExecOptions = {}
): Promise<ListWorkItemsResult<MainWorkItem>> {
  const normalizedLimit = Math.min(Math.max(1, Math.floor(limit)), 100)
  if (query && isGitHubWorkItemsQueryTooLarge(query)) {
    return { items: [], source: null }
  }
  const normalizedPage = normalizeWorkItemPage(page)
  const ownerRepo = await getOwnerRepo(repoPath, connectionId, localGitOptions)
  const search = [query?.trim(), 'is:pr', WORK_ITEM_NUMBER_SORT_QUALIFIER].filter(Boolean).join(' ')
  const fetchLimit = Math.min(normalizedPage * normalizedLimit, 1000)
  const args = [
    'pr',
    'list',
    '--limit',
    String(fetchLimit),
    '--state',
    'all',
    '--json',
    WORK_ITEM_PR_LIST_JSON_FIELDS,
    '--search',
    search
  ]
  if (ownerRepo) {
    args.push('--repo', `${ownerRepo.owner}/${ownerRepo.repo}`)
  }
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const { stdout } = await ghExecFileAsync(args, ghOptions)
  const offset = (normalizedPage - 1) * normalizedLimit
  const items = (JSON.parse(stdout) as Record<string, unknown>[])
    .map((item) => mapPullRequestWorkItem(item, ownerRepo))
    .slice(offset, offset + normalizedLimit)
  return {
    items: await hydrateWorkItemRepositoryMergeMetadata(items, ownerRepo, ghOptions),
    source: ownerRepo
  }
}
