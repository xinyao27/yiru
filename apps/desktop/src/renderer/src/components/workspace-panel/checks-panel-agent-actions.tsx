import { useCallback } from 'react'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import { startFixChecksAgent } from '@/lib/fix-checks-agent-launch'
import { groupPRComments, type PRCommentGroup } from '@/lib/pr-comment-groups'

import type { PRCheckRunDetails } from '../../../../shared/types'
import {
  buildFixBrokenChecksPrompt,
  getBrokenChecks,
  getCheckDetailsPromptKey
} from '../pr-checks-fix-prompt'
import {
  buildPRCommentsResolutionPrompt,
  isResolvablePRCommentGroup
} from '../pr-comments-resolution-prompt'
import type { useChecksPanelCommentActionsState } from './checks-panel-comment-actions-controller'
import type { ChecksAgentComposerState } from './checks-panel-controller-types'
import type { ChecksPanelReview } from './checks-panel-review'
import { clearPRCommentsListSelection } from './pr-comments-list-selection'
import { buildResolvePullRequestConflictsPrompt } from './source-control'

export function useChecksPanelAgentActions(context: useChecksPanelCommentActionsState) {
  const {
    activeConflictReview,
    activeReview,
    activeWorktreeId,
    activeWorktreePath,
    asyncResultKeyRef,
    checks,
    commentsRef,
    commentsSelectionClearTokenRef,
    fetchComments,
    fetchGitLabDetails,
    fetchPRCheckDetails,
    handleResolve,
    isCurrentAsyncResult,
    isFixingChecksWithAI,
    pr,
    repo,
    resolveCommentsWithAIDisabledReason,
    setAgentComposerState,
    setCommentsSelectionClearRequest,
    setIsFixingChecksWithAI,
    sourceControlAiActionsVisible,
    stateRequestKey
  } = context

  const handleResolveConflictsWithAI = useCallback(async (): Promise<void> => {
    if (!sourceControlAiActionsVisible || !activeWorktreeId || !activeConflictReview) {
      return
    }
    const conflictFiles = activeConflictReview.conflictSummary?.files ?? []
    setAgentComposerState({
      actionId: 'resolveConflicts',
      title: translate(
        'auto.components.right.sidebar.ChecksPanel.4ede779461',
        'Resolve Review Conflicts With AI'
      ),
      description: translate(
        'auto.components.right.sidebar.ChecksPanel.abf59262fb',
        'Review and edit the full command input before starting an agent.'
      ),
      prompt: buildResolvePullRequestConflictsPrompt({
        reviewKind: activeConflictReview.provider === 'gitlab' ? 'MR' : 'PR',
        baseRef: activeConflictReview.conflictSummary?.baseRef,
        entries: conflictFiles.map((path) => ({ path })),
        worktreePath: activeWorktreePath ?? null
      }),
      launchSource: 'conflict_resolution'
    })
  }, [
    activeConflictReview,
    activeWorktreeId,
    activeWorktreePath,
    sourceControlAiActionsVisible,
    setAgentComposerState
  ])

  const handleResolveCommentsWithAI = useCallback(
    (selectedGroups: PRCommentGroup[]): void => {
      if (
        !sourceControlAiActionsVisible ||
        !activeWorktreeId ||
        !activeReview ||
        !repo ||
        resolveCommentsWithAIDisabledReason
      ) {
        return
      }
      const selectedThreadIds = selectedGroups.flatMap((group) =>
        group.kind === 'thread' && isResolvablePRCommentGroup(group) ? [group.threadId] : []
      )
      if (selectedGroups.length === 0) {
        toast.message(
          translate(
            'auto.components.right.sidebar.ChecksPanel.f316a8ca2b',
            'No unresolved comments selected.'
          )
        )
        return
      }
      setAgentComposerState({
        actionId: 'resolveComments',
        title: translate(
          'auto.components.right.sidebar.ChecksPanel.d00ebdc402',
          'Resolve {{value0}} Comments With AI',
          { value0: activeReview.provider === 'gitlab' ? 'MR' : 'PR' }
        ),
        description: translate(
          'auto.components.right.sidebar.ChecksPanel.ed3f79c031',
          'Review the prompt before starting an agent. Selected threads are marked resolved after launch.'
        ),
        prompt: buildPRCommentsResolutionPrompt({
          reviewKind: activeReview.provider === 'gitlab' ? 'MR' : 'PR',
          reviewNumber: activeReview.number,
          reviewTitle: activeReview.title,
          reviewUrl: activeReview.url,
          groups: selectedGroups,
          worktreePath: activeWorktreePath
        }),
        launchSource: 'task_page',
        commentResolution: {
          reviewContextKey: stateRequestKey,
          provider: activeReview.provider,
          selectedThreadIds,
          selectedGroups
        }
      })
    },
    [
      activeReview,
      activeWorktreeId,
      activeWorktreePath,
      repo,
      resolveCommentsWithAIDisabledReason,
      sourceControlAiActionsVisible,
      stateRequestKey,
      setAgentComposerState
    ]
  )

  const clearSentCommentSelection = useCallback(
    (reviewContextKey: string): void => {
      clearPRCommentsListSelection(reviewContextKey)
      commentsSelectionClearTokenRef.current += 1
      setCommentsSelectionClearRequest({
        contextKey: reviewContextKey,
        token: commentsSelectionClearTokenRef.current
      })
    },
    [commentsSelectionClearTokenRef, setCommentsSelectionClearRequest]
  )

  const refreshCommentsAfterBulkResolve = useCallback(
    async (provider: ChecksPanelReview['provider']): Promise<void> => {
      if (provider === 'gitlab') {
        await fetchGitLabDetails({ commitAsCurrent: true })
        return
      }
      await fetchComments({ force: true })
    },
    [fetchComments, fetchGitLabDetails]
  )

  const resolveSelectedThreadsAfterLaunch = useCallback(
    async (resolution: NonNullable<ChecksAgentComposerState['commentResolution']>) => {
      clearSentCommentSelection(resolution.reviewContextKey)
      let resolved = 0
      let skipped = Math.max(
        0,
        resolution.selectedGroups.length - resolution.selectedThreadIds.length
      )
      let failed = 0
      let attemptedThreadCount = 0
      if (resolution.selectedThreadIds.length === 0) {
        toast.success(
          translate(
            'auto.components.right.sidebar.ChecksPanel.3c3ad3a1d2',
            'Started the agent. No selected comments can be marked resolved on the host.'
          )
        )
        return
      }
      for (const threadId of resolution.selectedThreadIds) {
        if (asyncResultKeyRef.current !== resolution.reviewContextKey) {
          skipped += resolution.selectedThreadIds.length - attemptedThreadCount
          break
        }
        attemptedThreadCount += 1
        const currentGroup = groupPRComments(commentsRef.current).find(
          (group) => group.kind === 'thread' && group.threadId === threadId
        )
        if (!currentGroup || !isResolvablePRCommentGroup(currentGroup)) {
          skipped += 1
          continue
        }
        const ok = await handleResolve(threadId, true, { notifyOnFailure: false })
        if (ok) {
          resolved += 1
        } else {
          failed += 1
        }
      }

      if (asyncResultKeyRef.current === resolution.reviewContextKey) {
        await refreshCommentsAfterBulkResolve(resolution.provider)
      }

      if (failed > 0) {
        toast.error(
          translate(
            'auto.components.right.sidebar.ChecksPanel.f273f2271c',
            'Started the agent. Marked {{value0}} resolved, skipped {{value1}}, failed {{value2}}.',
            { value0: resolved, value1: skipped, value2: failed }
          )
        )
        return
      }
      toast.success(
        translate(
          'auto.components.right.sidebar.ChecksPanel.aa95b81a3a',
          'Started the agent. Marked {{value0}} resolved, skipped {{value1}}, failed {{value2}}.',
          { value0: resolved, value1: skipped, value2: failed }
        )
      )
    },
    [
      clearSentCommentSelection,
      handleResolve,
      refreshCommentsAfterBulkResolve,
      commentsRef,
      asyncResultKeyRef
    ]
  )

  const handleFixChecksWithAI = useCallback(async (): Promise<void> => {
    if (
      !sourceControlAiActionsVisible ||
      isFixingChecksWithAI ||
      !activeWorktreeId ||
      !activeReview ||
      !repo
    ) {
      return
    }
    const broken = getBrokenChecks(checks)
    if (broken.length === 0) {
      toast.message(
        translate(
          'auto.components.right.sidebar.ChecksPanel.5594400d73',
          'No broken checks to fix.'
        )
      )
      return
    }
    const requestKey = stateRequestKey
    setIsFixingChecksWithAI(true)
    try {
      const checkRunDetailsByCheckKey: Record<string, PRCheckRunDetails> = {}
      if (activeReview.provider !== 'gitlab' && repo) {
        await Promise.all(
          broken.slice(0, 5).map(async (check, index) => {
            if (!check.checkRunId && !check.workflowRunId && !check.url) {
              return
            }
            try {
              const details = await fetchPRCheckDetails(
                repo.path,
                {
                  checkRunId: check.checkRunId,
                  workflowRunId: check.workflowRunId,
                  checkName: check.name,
                  url: check.url,
                  prRepo: pr?.prRepo ?? null
                },
                { repoId: repo.id }
              )
              if (details) {
                checkRunDetailsByCheckKey[getCheckDetailsPromptKey(check, index)] = details
              }
            } catch (error) {
              console.warn('[ChecksPanel] failed to load check details for AI fix prompt', error)
            }
          })
        )
      }
      if (!isCurrentAsyncResult(requestKey)) {
        return
      }
      const basePrompt = buildFixBrokenChecksPrompt({
        reviewKind: activeReview.provider === 'gitlab' ? 'MR' : 'PR',
        reviewNumber: activeReview.number,
        reviewTitle: activeReview.title,
        reviewUrl: activeReview.url,
        checks,
        checkRunDetailsByCheckKey
      })
      const started = await startFixChecksAgent({
        repoId: repo.id,
        basePrompt,
        worktreeId: activeWorktreeId,
        groupId: activeWorktreeId,
        launchSource: 'task_page'
      })
      if (started) {
        toast.success(
          translate(
            'auto.components.right.sidebar.ChecksPanel.2ef90c9819',
            'Started an AI agent for the broken checks.'
          )
        )
      }
    } finally {
      setIsFixingChecksWithAI(false)
    }
  }, [
    activeReview,
    activeWorktreeId,
    checks,
    fetchPRCheckDetails,
    isCurrentAsyncResult,
    isFixingChecksWithAI,
    pr?.prRepo,
    repo,
    sourceControlAiActionsVisible,
    stateRequestKey,
    setIsFixingChecksWithAI
  ])

  return {
    ...context,
    handleResolveConflictsWithAI,
    handleResolveCommentsWithAI,
    clearSentCommentSelection,
    refreshCommentsAfterBulkResolve,
    resolveSelectedThreadsAfterLaunch,
    handleFixChecksWithAI
  }
}

export type useChecksPanelAgentActionsState = ReturnType<typeof useChecksPanelAgentActions>
