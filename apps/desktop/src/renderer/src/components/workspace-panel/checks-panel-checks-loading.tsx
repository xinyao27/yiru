import { useCallback, useEffect } from 'react'

import { installWindowVisibilityTimeoutPoller } from '@/lib/window-visibility-timeout-poller'

import { gitLabPipelineJobsToPRChecks } from '../../../../shared/gitlab-pipeline-checks'
import {
  checksPanelAsyncResultKey,
  checksPanelHostedReviewAsyncResultKey
} from './checks-panel-async-result-key'
import {
  gitLabMRCommentsToPRComments,
  fetchGitLabMRDetailsForChecks
} from './checks-panel-gitlab-review'
import type { useChecksPanelPollingEffectsState } from './checks-panel-polling-effects'

export function useChecksPanelChecksLoading(context: useChecksPanelPollingEffectsState) {
  const {
    activeGitLabReview,
    asyncResultKeyRef,
    branch,
    fetchPRChecks,
    hostedReviewCacheKey,
    isCurrentAsyncResult,
    isPanelVisible,
    pollIntervalRef,
    pr,
    prCacheKey,
    prNumber,
    prevChecksRef,
    repo,
    setChecks,
    setChecksLoading,
    setComments,
    setCommentsLoading,
    settings
  } = context

  const fetchChecks = useCallback(
    async ({
      force = false,
      prNumberOverride
    }: { force?: boolean; prNumberOverride?: number | null } = {}) => {
      const targetPRNumber = prNumberOverride ?? prNumber
      if (!repo || !targetPRNumber) {
        return
      }
      setChecksLoading(true)
      try {
        const requestKey = checksPanelAsyncResultKey(
          prCacheKey,
          branch,
          targetPRNumber,
          pr?.prRepo,
          pr?.headSha
        )
        const result = await fetchPRChecks(
          repo.path,
          targetPRNumber,
          branch,
          pr?.headSha,
          pr?.prRepo,
          {
            force,
            repoId: repo.id
          }
        )
        if (!isCurrentAsyncResult(requestKey)) {
          return
        }
        setChecks(result)

        // Exponential backoff: if checks haven't changed, double the interval (cap 120s).
        // If they changed, reset to 30s.
        const signature = JSON.stringify(result.map((c) => `${c.name}:${c.status}:${c.conclusion}`))
        pollIntervalRef.current =
          signature === prevChecksRef.current
            ? Math.min(pollIntervalRef.current * 2, 120_000)
            : 30_000
        prevChecksRef.current = signature
      } catch (err) {
        if (
          !isCurrentAsyncResult(
            checksPanelAsyncResultKey(prCacheKey, branch, targetPRNumber, pr?.prRepo, pr?.headSha)
          )
        ) {
          return
        }
        console.warn('Failed to fetch PR checks:', err)
        setChecks([])
      } finally {
        if (
          isCurrentAsyncResult(
            checksPanelAsyncResultKey(prCacheKey, branch, targetPRNumber, pr?.prRepo, pr?.headSha)
          )
        ) {
          setChecksLoading(false)
        }
      }
    },
    [
      repo,
      prNumber,
      branch,
      pr?.headSha,
      pr?.prRepo,
      prCacheKey,
      fetchPRChecks,
      isCurrentAsyncResult,
      setChecksLoading,
      prevChecksRef,
      setChecks,
      pollIntervalRef
    ]
  )

  const fetchGitLabDetails = useCallback(
    async ({
      mrNumberOverride,
      headShaOverride,
      commitAsCurrent = false
    }: {
      mrNumberOverride?: number | null
      headShaOverride?: string | null
      commitAsCurrent?: boolean
    } = {}) => {
      const targetMRNumber = mrNumberOverride ?? activeGitLabReview?.number ?? null
      const targetHeadSha = headShaOverride ?? activeGitLabReview?.headSha ?? null
      if (!repo || !targetMRNumber) {
        return
      }
      const requestKey = checksPanelHostedReviewAsyncResultKey(
        hostedReviewCacheKey,
        branch,
        'gitlab',
        targetMRNumber,
        targetHeadSha
      )
      if (commitAsCurrent) {
        asyncResultKeyRef.current = requestKey
      }
      setChecksLoading(true)
      setCommentsLoading(true)
      try {
        const details = await fetchGitLabMRDetailsForChecks({
          repoPath: repo.path,
          repoId: repo.id,
          settings,
          iid: targetMRNumber
        })
        if (!isCurrentAsyncResult(requestKey)) {
          return
        }
        const result = gitLabPipelineJobsToPRChecks(details?.pipelineJobs ?? [])
        setChecks(result)
        setComments(gitLabMRCommentsToPRComments(details?.comments))
        const signature = JSON.stringify(result.map((c) => `${c.name}:${c.status}:${c.conclusion}`))
        pollIntervalRef.current =
          signature === prevChecksRef.current
            ? Math.min(pollIntervalRef.current * 2, 120_000)
            : 30_000
        prevChecksRef.current = signature
      } catch (err) {
        if (!isCurrentAsyncResult(requestKey)) {
          return
        }
        console.warn('Failed to fetch GitLab MR checks:', err)
        setChecks([])
        setComments([])
      } finally {
        if (isCurrentAsyncResult(requestKey)) {
          setChecksLoading(false)
          setCommentsLoading(false)
        }
      }
    },
    [
      activeGitLabReview?.headSha,
      activeGitLabReview?.number,
      branch,
      hostedReviewCacheKey,
      isCurrentAsyncResult,
      repo,
      settings,
      setChecksLoading,
      setCommentsLoading,
      setChecks,
      prevChecksRef,
      asyncResultKeyRef,
      setComments,
      pollIntervalRef
    ]
  )

  // Fetch checks on mount + poll with exponential backoff
  useEffect(() => {
    if (activeGitLabReview) {
      return
    }
    if (!prNumber || !isPanelVisible) {
      setChecks([])
      return
    }

    // Reset backoff state on PR change
    pollIntervalRef.current = 30_000
    prevChecksRef.current = ''
    // Why: PR check status is user-visible when the panel is open. Keep visible
    // unfocused windows fresh, but stop timers and API work while hidden.
    return installWindowVisibilityTimeoutPoller({
      run: () => fetchChecks(),
      getDelayMs: () => pollIntervalRef.current
    })
  }, [
    activeGitLabReview,
    fetchChecks,
    isPanelVisible,
    prNumber,
    prevChecksRef,
    pollIntervalRef,
    setChecks
  ])

  useEffect(() => {
    if (!activeGitLabReview || !isPanelVisible) {
      return
    }

    pollIntervalRef.current = 30_000
    prevChecksRef.current = ''
    return installWindowVisibilityTimeoutPoller({
      run: () => fetchGitLabDetails(),
      getDelayMs: () => pollIntervalRef.current
    })
  }, [activeGitLabReview, fetchGitLabDetails, isPanelVisible, prevChecksRef, pollIntervalRef])

  return { ...context, fetchChecks, fetchGitLabDetails }
}

export type useChecksPanelChecksLoadingState = ReturnType<typeof useChecksPanelChecksLoading>
