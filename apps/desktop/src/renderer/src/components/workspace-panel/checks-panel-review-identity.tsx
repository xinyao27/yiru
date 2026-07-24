import { useEffect, useState } from 'react'

import { useAppStore } from '@/store'
import {
  buildGitHubPRRefreshStateClearToken,
  getGitHubPRRefreshStateExpiryAt
} from '@/store/slices/github'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import { getHostedReviewCacheKey } from '@/store/slices/hosted-review'

import { isFolderRepo } from '../../../../shared/repo-kind'
import type { PRInfo } from '../../../../shared/types'
import { hasAmbiguousGitHubHostedReviewForChecksPanel } from './checks-panel-ambiguous-github-review'
import { isGitLabChecksPanelReview } from './checks-panel-gitlab-review'
import { recordChecksPanelPRRefreshBreadcrumb } from './checks-panel-pr-refresh-breadcrumb'
import { type ChecksPanelReview, selectChecksPanelReview } from './checks-panel-review'
import type { useChecksPanelStateCoreState } from './checks-panel-state-core'
import { selectReviewCacheEntry } from './review-cache-entry-selection'

export function useChecksPanelReviewIdentity(context: useChecksPanelStateCoreState) {
  const {
    activeWorktree,
    activeWorktreeId,
    branch,
    clearTitleInputFocusTimer,
    conflictSummaryRefreshKeyRef,
    createPrInFlightRef,
    gitStatusSnapshotRetryTimerRef,
    isPanelVisible,
    panelContextKey,
    panelVisibleSinceRef,
    pollIntervalRef,
    prevChecksRef,
    refreshContextKeyRef,
    refreshInFlightRef,
    refreshRequestKeyRef,
    repo,
    setAgentComposerState,
    setChecks,
    setChecksLoading,
    setComments,
    setCommentsLoading,
    setConflictDetailsRefreshing,
    setCreatePrError,
    setEditingTitle,
    setEmptyRefreshing,
    setGitStatusRefreshNonce,
    setGitStatusSnapshot,
    setHostedReviewCreationSnapshot,
    setIsCreatingPr,
    setIsPublishingBranch,
    setIsRefreshing,
    setTitleDraft,
    setTitleSaving,
    settings
  } = context

  const [prevPanelContextKey, setPrevPanelContextKey] = useState(panelContextKey)
  const [prRefreshStateNow, setPrRefreshStateNow] = useState(() => Date.now())
  if (panelContextKey !== prevPanelContextKey) {
    setPrevPanelContextKey(panelContextKey)
    setEditingTitle(false)
    setTitleDraft('')
    setTitleSaving(false)
    clearTitleInputFocusTimer()
    setChecks([])
    setChecksLoading(false)
    setComments([])
    setCommentsLoading(false)
    setIsRefreshing(false)
    setEmptyRefreshing(false)
    setConflictDetailsRefreshing(false)
    setPrRefreshStateNow(Date.now())
    createPrInFlightRef.current = null
    setIsCreatingPr(false)
    setCreatePrError(null)
    setIsPublishingBranch(false)
    setAgentComposerState(null)
    setHostedReviewCreationSnapshot(null)
    setGitStatusSnapshot(null)
    setGitStatusRefreshNonce((value) => value + 1)
    pollIntervalRef.current = 30_000
    prevChecksRef.current = ''
    conflictSummaryRefreshKeyRef.current = null
    refreshInFlightRef.current = false
    refreshRequestKeyRef.current = null
    if (gitStatusSnapshotRetryTimerRef.current) {
      clearTimeout(gitStatusSnapshotRetryTimerRef.current)
      gitStatusSnapshotRetryTimerRef.current = null
    }
  }

  // Find active worktree and repo
  const isFolder = repo ? isFolderRepo(repo) : false
  const prCacheKey =
    repo && branch
      ? getGitHubPRCacheKey(
          repo.path,
          repo.id,
          branch,
          settings,
          repo.connectionId,
          repo.executionHostId,
          true
        )
      : ''
  const hostedReviewCacheKey =
    repo && branch
      ? getHostedReviewCacheKey(
          repo.path,
          branch,
          settings,
          repo.id,
          repo.connectionId,
          repo.executionHostId,
          true
        )
      : ''
  const refreshContextKey = `${activeWorktreeId ?? ''}::${prCacheKey}::${branch}`
  if (refreshContextKey !== refreshContextKeyRef.current) {
    refreshContextKeyRef.current = refreshContextKey
    refreshRequestKeyRef.current = null
  }
  // Why: background PR refreshes replace the cache map; Checks only renders
  // the entry for the active repo and branch.
  const prCacheEntry = useAppStore((s) => selectReviewCacheEntry(s.prCache, prCacheKey || null))
  const pr: PRInfo | null = prCacheEntry?.data ?? null
  const prCachedHasPR = prCacheEntry ? prCacheEntry.data !== null : null
  const hostedReview = useAppStore((s) =>
    hostedReviewCacheKey ? (s.hostedReviewCache[hostedReviewCacheKey]?.data ?? null) : null
  )
  const hasAmbiguousGitHubHostedReview = hasAmbiguousGitHubHostedReviewForChecksPanel({
    hostedReview,
    prCacheEntry,
    prCacheKey
  })
  // Why: branch lookup is lossy for fork or deleted-head reviews, so prefer a
  // known review number from metadata or the visible cache.
  const linkedPR = activeWorktree?.linkedPR ?? null
  const fallbackGitHubPRNumber = linkedPR == null ? (pr?.number ?? null) : null
  const linkedGitLabMR = activeWorktree?.linkedGitLabMR ?? null
  const linkedBitbucketPR = activeWorktree?.linkedBitbucketPR ?? null
  const linkedAzureDevOpsPR = activeWorktree?.linkedAzureDevOpsPR ?? null
  const linkedGiteaPR = activeWorktree?.linkedGiteaPR ?? null
  const activeReview: ChecksPanelReview | null = selectChecksPanelReview({
    hostedReview,
    pr,
    linkedGitLabMR,
    linkedBitbucketPR,
    linkedAzureDevOpsPR,
    linkedGiteaPR
  })
  const activeGitLabReview = isGitLabChecksPanelReview(activeReview) ? activeReview : null
  const isGitLabReviewContext = Boolean(activeGitLabReview || linkedGitLabMR !== null)
  const activeConflictReview = activeReview?.mergeable === 'CONFLICTING' ? activeReview : null
  const prRefreshState = useAppStore((s) =>
    prCacheKey ? s.getEffectiveGitHubPRRefreshState(prCacheKey, prRefreshStateNow) : undefined
  )
  const rawPRRefreshState = useAppStore((s) =>
    prCacheKey ? s.prRefreshStates[prCacheKey] : undefined
  )
  const prNumber = pr?.number ?? null

  useEffect(() => {
    const expiryAt = getGitHubPRRefreshStateExpiryAt(rawPRRefreshState)
    if (!prCacheKey || expiryAt === null) {
      return
    }
    const timeout = window.setTimeout(
      () => {
        setPrRefreshStateNow(Date.now())
        const storeState = useAppStore.getState()
        const rawState = storeState.prRefreshStates[prCacheKey]
        const token = buildGitHubPRRefreshStateClearToken(
          rawState,
          storeState.prRefreshSequences,
          prCacheKey
        )
        if (!token) {
          return
        }
        // Why: time alone does not publish Zustand updates; this timeout clears
        // abandoned active refresh UI without treating expiry as no-PR evidence.
        recordChecksPanelPRRefreshBreadcrumb({
          event: 'stale_cleared',
          provider: 'github',
          repoId: repo?.id,
          worktreeId: activeWorktreeId,
          branch,
          prCacheKey,
          prNumber,
          prState: pr?.state,
          prChecksStatus: pr?.checksStatus,
          refreshState: rawState
        })
        storeState.expireGitHubPRRefreshState(prCacheKey, token)
      },
      Math.max(0, expiryAt - Date.now() + 1)
    )
    return () => window.clearTimeout(timeout)
  }, [
    activeWorktreeId,
    branch,
    pr?.checksStatus,
    pr?.state,
    prCacheKey,
    prNumber,
    rawPRRefreshState,
    repo?.id
  ])

  useEffect(() => {
    if (!isPanelVisible) {
      panelVisibleSinceRef.current = null
      return
    }
    panelVisibleSinceRef.current = Date.now()
  }, [isPanelVisible, panelContextKey, panelVisibleSinceRef])

  return {
    ...context,
    prevPanelContextKey,
    setPrevPanelContextKey,
    prRefreshStateNow,
    setPrRefreshStateNow,
    isFolder,
    prCacheKey,
    hostedReviewCacheKey,
    refreshContextKey,
    prCacheEntry,
    pr,
    prCachedHasPR,
    hostedReview,
    hasAmbiguousGitHubHostedReview,
    linkedPR,
    fallbackGitHubPRNumber,
    linkedGitLabMR,
    linkedBitbucketPR,
    linkedAzureDevOpsPR,
    linkedGiteaPR,
    activeReview,
    activeGitLabReview,
    isGitLabReviewContext,
    activeConflictReview,
    prRefreshState,
    rawPRRefreshState,
    prNumber
  }
}

export type useChecksPanelReviewIdentityState = ReturnType<typeof useChecksPanelReviewIdentity>
