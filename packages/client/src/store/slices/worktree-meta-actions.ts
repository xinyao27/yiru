import { isPositiveHostedReviewNumber } from '@yiru/workbench-model/review'
import type { StateCreator } from 'zustand'
import { parseWorkspaceKey } from '~shared/workspace/scope'

import type { AppState } from '../types'
import { getGitHubPRCacheKey, getLegacyGitHubPRCacheKey } from './github-cache-key'
import { getHostedReviewCacheKey } from './hosted-review'
import {
  applyDetectedWorktreeUpdates,
  findKnownWorktreeById,
  getFolderWorkspaceMetaUpdates,
  isRuntimeSelectorNotFoundError
} from './worktree-known-model'
import { hostedReviewPushTargetLookupsInFlight } from './worktree-refresh-model'
import {
  persistWorktreeMeta,
  resolveGitHubReviewPushTarget,
  getHostedReviewPushTargetLookup
} from './worktree-review-resolver'
import {
  hasHostedReviewLinkUpdates,
  bumpHostedReviewLinkMutationGeneration,
  clearOlderHostedReviewLinksForReplacement,
  getHostedReviewLinkForMetaRefresh
} from './worktree-review-state'
import { settingsForWorktreeOwner } from './worktree-runtime-list-model'
import { applyWorktreeUpdates, getRepoIdFromWorktreeId, type WorktreeSlice } from './worktree-state'

export function createWorktreeMetaActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<WorktreeSlice, 'updateWorktreeMeta' | 'ensureHostedReviewPushTarget'> {
  return {
    updateWorktreeMeta: async (worktreeId, updates, options) => {
      const shouldApplyUpdate = options?.shouldApply
      const existingWorktree = get().getKnownWorktreeById(worktreeId)
      if (shouldApplyUpdate && !shouldApplyUpdate(existingWorktree)) {
        return
      }
      const workspaceScope = parseWorkspaceKey(worktreeId)
      if (workspaceScope?.type === 'folder') {
        const folderUpdates = getFolderWorkspaceMetaUpdates(updates)
        if (Object.keys(folderUpdates).length > 0) {
          await get().updateFolderWorkspace(workspaceScope.folderWorkspaceId, folderUpdates)
        }
        return
      }
      const normalizedUpdates = existingWorktree
        ? clearOlderHostedReviewLinksForReplacement(updates, existingWorktree)
        : updates
      // Why: manual PR linking only supplies the PR number. Resolve the PR head
      // branch here so Push targets the review branch; re-saving the same PR can
      // also heal older metadata that lost pushTarget.
      const linkedPrForPushTarget = isPositiveHostedReviewNumber(normalizedUpdates.linkedPR)
        ? normalizedUpdates.linkedPR
        : null
      const resolvedPushTarget =
        linkedPrForPushTarget !== null &&
        normalizedUpdates.pushTarget === undefined &&
        existingWorktree &&
        !existingWorktree.pushTarget
          ? await resolveGitHubReviewPushTarget(
              settingsForWorktreeOwner(get(), worktreeId),
              existingWorktree.repoId,
              linkedPrForPushTarget
            )
          : undefined
      const existingHostedReviewPushTargetLookup = existingWorktree
        ? getHostedReviewPushTargetLookup(existingWorktree)
        : null
      const nextHostedReviewPushTargetLookup = existingWorktree
        ? getHostedReviewPushTargetLookup({ ...existingWorktree, ...normalizedUpdates })
        : null
      // Why: a pushTarget derived from one linked review must not keep steering
      // pushes after that review is unlinked or replaced by another provider/id.
      const shouldClearStaleHostedReviewPushTarget =
        Boolean(existingWorktree?.pushTarget) &&
        normalizedUpdates.pushTarget === undefined &&
        resolvedPushTarget === undefined &&
        existingHostedReviewPushTargetLookup !== null &&
        existingHostedReviewPushTargetLookup.key !== nextHostedReviewPushTargetLookup?.key
      const worktreeForUpdate = get().getKnownWorktreeById(worktreeId)
      if (shouldApplyUpdate && !shouldApplyUpdate(worktreeForUpdate)) {
        return
      }
      const shouldRefreshHostedReview =
        (normalizedUpdates.linkedPR === null && worktreeForUpdate?.linkedPR !== null) ||
        (normalizedUpdates.linkedGitLabMR === null &&
          (worktreeForUpdate?.linkedGitLabMR ?? null) !== null) ||
        (normalizedUpdates.linkedBitbucketPR === null &&
          (worktreeForUpdate?.linkedBitbucketPR ?? null) !== null) ||
        (normalizedUpdates.linkedAzureDevOpsPR === null &&
          (worktreeForUpdate?.linkedAzureDevOpsPR ?? null) !== null) ||
        (normalizedUpdates.linkedGiteaPR === null &&
          (worktreeForUpdate?.linkedGiteaPR ?? null) !== null)
      const reviewRepo = shouldRefreshHostedReview
        ? get().repos.find((repo) => repo.id === worktreeForUpdate?.repoId)
        : undefined
      const reviewBranch = worktreeForUpdate?.branch.replace(/^refs\/heads\//, '')

      // Why: editing a comment is meaningful interaction with the worktree.
      // Without refreshing lastActivityAt, the time-decay score has decayed
      // since the previous sort, so a re-sort causes the worktree to drop in
      // ranking even though the user just touched it. Bumping the timestamp
      // keeps the recency signal fresh so the worktree holds its position.
      const targetEnriched = resolvedPushTarget
        ? { ...normalizedUpdates, pushTarget: resolvedPushTarget }
        : shouldClearStaleHostedReviewPushTarget
          ? { ...normalizedUpdates, pushTarget: undefined }
          : normalizedUpdates
      const renameCleared =
        'displayName' in targetEnriched
          ? {
              ...targetEnriched,
              pendingFirstAgentMessageRename: false,
              firstAgentMessageRenameError: null
            }
          : targetEnriched
      const enriched =
        'comment' in renameCleared
          ? { ...renameCleared, lastActivityAt: Date.now() }
          : renameCleared

      let didApply = false
      set((s) => {
        if (shouldApplyUpdate && !shouldApplyUpdate(findKnownWorktreeById(s, worktreeId))) {
          return {}
        }
        didApply = true
        const nextWorktrees = applyWorktreeUpdates(s.worktreesByRepo, worktreeId, enriched)
        const nextDetectedWorktrees = applyDetectedWorktreeUpdates(
          s.detectedWorktreesByRepo,
          worktreeId,
          enriched
        )
        const cacheKey =
          reviewRepo && reviewBranch
            ? getHostedReviewCacheKey(
                reviewRepo.path,
                reviewBranch,
                s.settings,
                reviewRepo.id,
                reviewRepo.executionHostId,
                true
              )
            : null
        const prCacheKey =
          reviewRepo && reviewBranch
            ? getGitHubPRCacheKey(
                reviewRepo.path,
                reviewRepo.id,
                reviewBranch,
                s.settings,
                reviewRepo.executionHostId,
                true
              )
            : null
        const prCacheKeys =
          reviewRepo && reviewBranch
            ? [
                prCacheKey,
                getLegacyGitHubPRCacheKey(reviewRepo.path, reviewRepo.id, reviewBranch),
                getLegacyGitHubPRCacheKey(reviewRepo.path, undefined, reviewBranch)
              ].filter((key): key is string => Boolean(key))
            : []
        const hostedReviewCache = s.hostedReviewCache ?? {}
        const prCache = s.prCache ?? {}
        if (
          nextWorktrees === s.worktreesByRepo &&
          nextDetectedWorktrees === s.detectedWorktreesByRepo &&
          !cacheKey &&
          !prCacheKey
        ) {
          return {}
        }

        const nextHostedReviewCache =
          cacheKey && hostedReviewCache[cacheKey]
            ? (() => {
                const next = { ...hostedReviewCache }
                delete next[cacheKey]
                return next
              })()
            : hostedReviewCache
        const nextPRCache = prCacheKeys.some((key) => prCache[key])
          ? (() => {
              const next = { ...prCache }
              for (const key of prCacheKeys) {
                delete next[key]
              }
              return next
            })()
          : prCache

        return {
          ...(nextWorktrees !== s.worktreesByRepo
            ? { worktreesByRepo: nextWorktrees, sortEpoch: s.sortEpoch + 1 }
            : {}),
          ...(nextDetectedWorktrees !== s.detectedWorktreesByRepo
            ? { detectedWorktreesByRepo: nextDetectedWorktrees }
            : {}),
          ...(nextHostedReviewCache !== hostedReviewCache
            ? { hostedReviewCache: nextHostedReviewCache }
            : {}),
          ...(nextPRCache !== prCache ? { prCache: nextPRCache } : {})
        }
      })
      if (shouldApplyUpdate && !didApply) {
        return
      }
      if (hasHostedReviewLinkUpdates(enriched)) {
        bumpHostedReviewLinkMutationGeneration(worktreeId)
      }

      try {
        await persistWorktreeMeta(settingsForWorktreeOwner(get(), worktreeId), worktreeId, enriched)
        if (
          !options?.suppressHostedReviewRefresh &&
          reviewRepo &&
          reviewBranch &&
          typeof get().fetchHostedReviewForBranch === 'function'
        ) {
          // Why: the old cache entry may have been populated by the previous
          // provider link. Refetch against the post-update links so stale lookups
          // cannot keep showing the removed review.
          void get().fetchHostedReviewForBranch(reviewRepo.path, reviewBranch, {
            repoId: reviewRepo.id,
            linkedGitHubPR: getHostedReviewLinkForMetaRefresh(
              targetEnriched,
              worktreeForUpdate,
              'linkedPR'
            ),
            linkedGitLabMR: getHostedReviewLinkForMetaRefresh(
              targetEnriched,
              worktreeForUpdate,
              'linkedGitLabMR'
            ),
            linkedBitbucketPR: getHostedReviewLinkForMetaRefresh(
              targetEnriched,
              worktreeForUpdate,
              'linkedBitbucketPR'
            ),
            linkedAzureDevOpsPR: getHostedReviewLinkForMetaRefresh(
              targetEnriched,
              worktreeForUpdate,
              'linkedAzureDevOpsPR'
            ),
            linkedGiteaPR: getHostedReviewLinkForMetaRefresh(
              targetEnriched,
              worktreeForUpdate,
              'linkedGiteaPR'
            ),
            force: true
          })
        }
      } catch (err) {
        if (isRuntimeSelectorNotFoundError(err)) {
          void get().fetchWorktrees(getRepoIdFromWorktreeId(worktreeId))
          return
        }
        console.error('Failed to update worktree meta:', err)
        void get().fetchWorktrees(getRepoIdFromWorktreeId(worktreeId))
      }
    },
    ensureHostedReviewPushTarget: async (worktreeId) => {
      const worktree = get().getKnownWorktreeById(worktreeId)
      if (!worktree || worktree.pushTarget) {
        return
      }
      const lookup = getHostedReviewPushTargetLookup(worktree)
      if (!lookup || hostedReviewPushTargetLookupsInFlight.has(lookup.key)) {
        return
      }
      hostedReviewPushTargetLookupsInFlight.add(lookup.key)
      try {
        const resolvedPushTarget = await lookup.resolve(settingsForWorktreeOwner(get(), worktreeId))
        if (!resolvedPushTarget) {
          return
        }
        const current = get().getKnownWorktreeById(worktreeId)
        if (!current || current.pushTarget) {
          return
        }
        const currentLookup = getHostedReviewPushTargetLookup(current)
        if (currentLookup?.key !== lookup.key) {
          return
        }
        // Why: old linked-review worktrees can lose metadata while their branch
        // tracks a helper ref; restoring the review head target keeps push/status aligned.
        await get().updateWorktreeMeta(worktreeId, { pushTarget: resolvedPushTarget })
      } finally {
        hostedReviewPushTargetLookupsInFlight.delete(lookup.key)
      }
    }
  }
}
