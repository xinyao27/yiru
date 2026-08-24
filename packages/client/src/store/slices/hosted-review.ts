import type {
  CreateHostedReviewInput,
  CreateHostedReviewResult,
  HostedReviewCreationEligibility,
  HostedReviewCreationEligibilityArgs,
  HostedReviewInfo
} from '@yiru/workbench-model/review'
import { getRepoExecutionHostId, type ExecutionHostId } from '@yiru/workbench-model/workspace'
import type { StateCreator } from 'zustand'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

import type { AppState } from '../types'
import { getGitHubPRCacheKey, getLegacyGitHubPRCacheKey } from './github-cache-key'
import {
  finishHostedReviewRequest,
  getInflightHostedReviewRequest,
  hasNewerHostedReviewCacheEntry,
  isCurrentHostedReviewRequest,
  isHostedReviewCacheFresh,
  isStaleMergedGitHubReviewForHead,
  nextHostedReviewRequestGeneration,
  setInflightHostedReviewRequest,
  shouldRefetchGitHubScopedResultForNoHint,
  shouldRefetchHostedReviewForLinkedHint,
  withHostedReviewCacheEntry,
  type HostedReviewCache
} from './hosted-review-cache'
import {
  getHostedReviewCacheKey,
  linkedReviewHintKey,
  type LinkedReviewHints
} from './hosted-review-cache-identity'
import {
  findHostedReviewRepoByPath,
  settingsForHostedReviewActionOwner,
  settingsForHostedReviewRepoOwner
} from './hosted-review-owner'

export { getHostedReviewCacheKey, linkedReviewHintKey } from './hosted-review-cache-identity'

type FetchOptions = {
  force?: boolean
  repoId?: string
  executionHostId?: ExecutionHostId
  staleWhileRevalidate?: boolean
  currentHeadOid?: string | null
}
type CreateHostedReviewStoreInput = CreateHostedReviewInput & { repoId?: string | null }

export type HostedReviewSlice = {
  hostedReviewCache: HostedReviewCache
  getHostedReviewCreationEligibility: (
    args: HostedReviewCreationEligibilityArgs
  ) => Promise<HostedReviewCreationEligibility>
  createHostedReview: (
    repoPath: string,
    input: CreateHostedReviewStoreInput
  ) => Promise<CreateHostedReviewResult>
  fetchHostedReviewForBranch: (
    repoPath: string,
    branch: string,
    options?: FetchOptions & LinkedReviewHints
  ) => Promise<HostedReviewInfo | null>
}

type RefreshHostedReviewCardArgs = {
  repoPath: string
  repoId: string
  branch: string
  linkedGitHubPR?: number | null
  fallbackGitHubPR?: number | null
  linkedGitLabMR?: number | null
  linkedBitbucketPR?: number | null
  linkedAzureDevOpsPR?: number | null
  linkedGiteaPR?: number | null
}

export function refreshHostedReviewCard(
  fetchHostedReviewForBranch: HostedReviewSlice['fetchHostedReviewForBranch'],
  args: RefreshHostedReviewCardArgs
): Promise<HostedReviewInfo | null> {
  const fallbackGitHubPR = args.linkedGitHubPR == null ? (args.fallbackGitHubPR ?? null) : null
  return fetchHostedReviewForBranch(args.repoPath, args.branch, {
    force: true,
    repoId: args.repoId,
    linkedGitHubPR: args.linkedGitHubPR ?? null,
    ...(fallbackGitHubPR !== null ? { fallbackGitHubPR } : {}),
    linkedGitLabMR: args.linkedGitLabMR ?? null,
    linkedBitbucketPR: args.linkedBitbucketPR ?? null,
    linkedAzureDevOpsPR: args.linkedAzureDevOpsPR ?? null,
    linkedGiteaPR: args.linkedGiteaPR ?? null
  })
}

export const createHostedReviewSlice: StateCreator<AppState, [], [], HostedReviewSlice> = (
  set,
  get
) => ({
  hostedReviewCache: {},

  getHostedReviewCreationEligibility: async (args) => {
    const settings = get().settings
    const repo = findHostedReviewRepoByPath(get().repos, args.repoPath, args.repoId)
    const ownerSettings = settingsForHostedReviewActionOwner(settings, repo)
    const target = getActiveRuntimeTarget(ownerSettings)
    const { repoPath: _repoPath, worktreePath, ...runtimeArgs } = args
    void _repoPath
    return callRuntimeOrpc(
      target,
      (client) => client.hostedReview.getCreationEligibility,
      {
        repo: repo?.id ?? args.repoPath,
        ...(worktreePath ? { worktree: `path:${worktreePath}` } : {}),
        ...runtimeArgs
      },
      { timeoutMs: 30_000 }
    )
  },

  createHostedReview: async (repoPath, input) => {
    const settings = get().settings
    const repo = findHostedReviewRepoByPath(get().repos, repoPath, input.repoId)
    const ownerSettings = settingsForHostedReviewActionOwner(settings, repo)
    const target = getActiveRuntimeTarget(ownerSettings)
    const { repoId: _inputRepoId, ...hostedReviewInput } = input
    void _inputRepoId
    const { worktreePath, ...runtimeInput } = hostedReviewInput
    return callRuntimeOrpc(
      target,
      (client) => client.hostedReview.create,
      {
        repo: repo?.id ?? repoPath,
        ...(worktreePath ? { worktree: `path:${worktreePath}` } : {}),
        ...runtimeInput
      },
      { timeoutMs: 60_000 }
    )
  },

  fetchHostedReviewForBranch: async (
    repoPath,
    branch,
    options
  ): Promise<HostedReviewInfo | null> => {
    const settings = get().settings
    const repo = get().repos?.find((candidate) => {
      const matchesRepo = options?.repoId
        ? candidate.id === options.repoId
        : candidate.path === repoPath
      return (
        matchesRepo &&
        (!options?.executionHostId || getRepoExecutionHostId(candidate) === options.executionHostId)
      )
    })
    const ownerSettings = settingsForHostedReviewRepoOwner(settings, repo)
    const target = getActiveRuntimeTarget(ownerSettings)
    const repoId = options?.repoId ?? repo?.id
    const cacheKey = getHostedReviewCacheKey(
      repoPath,
      branch,
      ownerSettings,
      repoId,
      repo?.executionHostId,
      repo !== undefined
    )
    const cached = get().hostedReviewCache[cacheKey]
    const hintKey = linkedReviewHintKey(options)
    const linkedRefetch = shouldRefetchHostedReviewForLinkedHint(cached, hintKey)
    const scopedResultRefetch = shouldRefetchGitHubScopedResultForNoHint(cached, hintKey)
    const staleMergedHeadRefetch = isStaleMergedGitHubReviewForHead(cached, options?.currentHeadOid)
    if (
      !options?.force &&
      !linkedRefetch &&
      !scopedResultRefetch &&
      !staleMergedHeadRefetch &&
      isHostedReviewCacheFresh(cached)
    ) {
      return cached.data
    }

    const inflightRequest = getInflightHostedReviewRequest(cacheKey)
    const inflightHasRequestedHint = inflightRequest?.linkedReviewHintKey === hintKey
    const startRequest = (): Promise<HostedReviewInfo | null> => {
      const generation = nextHostedReviewRequestGeneration(cacheKey)
      const requestStartedAt = Date.now()
      const requestStartedEntry = get().hostedReviewCache[cacheKey]
      const request = (async () => {
        try {
          const fallbackGitHubPR =
            options?.linkedGitHubPR == null ? (options?.fallbackGitHubPR ?? null) : null
          const args = {
            branch,
            ...(options?.repoId !== undefined ? { repoId: options.repoId } : {}),
            currentHeadOid: options?.currentHeadOid ?? null,
            linkedGitHubPR: options?.linkedGitHubPR ?? null,
            ...(fallbackGitHubPR !== null ? { fallbackGitHubPR } : {}),
            linkedGitLabMR: options?.linkedGitLabMR ?? null,
            linkedBitbucketPR: options?.linkedBitbucketPR ?? null,
            linkedAzureDevOpsPR: options?.linkedAzureDevOpsPR ?? null,
            linkedGiteaPR: options?.linkedGiteaPR ?? null
          }
          const review = await callRuntimeOrpc(
            target,
            (client) => client.hostedReview.forBranch,
            { repo: repo?.id ?? options?.repoId ?? repoPath, repoPath, ...args },
            // Why: remote dev boxes can be slower at `git`/`gh` lookups than
            // local desktop repos, especially on Windows filesystem paths. The
            // main-process queue caps concurrency, so a longer timeout no
            // longer risks a background socket stampede.
            { timeoutMs: 30_000 }
          )
          if (isCurrentHostedReviewRequest(cacheKey, generation)) {
            set((state) => {
              if (
                hasNewerHostedReviewCacheEntry(
                  state.hostedReviewCache,
                  cacheKey,
                  requestStartedAt,
                  requestStartedEntry
                )
              ) {
                return {}
              }
              const prCacheKeys = [
                getGitHubPRCacheKey(
                  repoPath,
                  repoId,
                  branch,
                  ownerSettings,
                  repo?.executionHostId,
                  repo !== undefined
                ),
                getLegacyGitHubPRCacheKey(repoPath, repoId, branch),
                getLegacyGitHubPRCacheKey(repoPath, undefined, branch)
              ]
              const currentPRCache = state.prCache ?? {}
              const prCache =
                review &&
                review.provider !== 'github' &&
                prCacheKeys.some((key) => currentPRCache[key])
                  ? (() => {
                      const next = { ...currentPRCache }
                      for (const key of prCacheKeys) {
                        delete next[key]
                      }
                      return next
                    })()
                  : currentPRCache
              return {
                ...(prCache === currentPRCache ? {} : { prCache }),
                hostedReviewCache: withHostedReviewCacheEntry(state.hostedReviewCache, cacheKey, {
                  data: review,
                  fetchedAt: Date.now(),
                  linkedReviewHintKey: hintKey
                })
              }
            })
          }
          return review
        } catch (error) {
          // Why: a transient lookup failure (timeout, rate limit, gh/git error)
          // must not be cached as a definitive "no review" miss — that blanks
          // the sidebar card to branch-only and suppresses retry for the full
          // cache TTL. Preserve the last known review and let the next visible
          // poll retry instead.
          console.error('Failed to fetch hosted review:', error)
          const preserved = get().hostedReviewCache[cacheKey]
          // Why: don't preserve a merged GitHub review the worktree has moved
          // off of; that PR is only valid while checked out at its head.
          if (isStaleMergedGitHubReviewForHead(preserved, options?.currentHeadOid)) {
            return null
          }
          return preserved?.data ?? null
        } finally {
          finishHostedReviewRequest(cacheKey, generation)
        }
      })()

      setInflightHostedReviewRequest(cacheKey, {
        promise: request,
        force: Boolean(options?.force),
        generation,
        linkedReviewHintKey: hintKey
      })
      return request
    }

    if (
      !options?.force &&
      !linkedRefetch &&
      !scopedResultRefetch &&
      options?.staleWhileRevalidate &&
      cached !== undefined &&
      cached.data !== null
    ) {
      // Why: sidebar PR metadata can stay visible while a quiet refresh updates
      // it; don't block card rendering on a quota-bound GitHub round trip.
      if (!inflightRequest || !inflightHasRequestedHint) {
        void startRequest()
      }
      return cached.data
    }

    if (inflightRequest && (!options?.force || inflightRequest.force) && inflightHasRequestedHint) {
      return inflightRequest.promise
    }

    return startRequest()
  }
})
