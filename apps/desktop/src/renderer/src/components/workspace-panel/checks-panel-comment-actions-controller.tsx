import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import { mergePRCommentIntoList } from '@/store/slices/github'

import type { PRComment } from '../../../../shared/types'
import { checksPanelAsyncResultKey } from './checks-panel-async-result-key'
import type { useChecksPanelEntryAndEditState } from './checks-panel-entry-and-edit'
import { resolveGitLabMRDiscussionForChecks } from './checks-panel-gitlab-review'
import {
  markPRCommentThreadResolved,
  restorePRCommentThreadSnapshot
} from './pr-comment-thread-resolution'
import { pickDefaultSourceControlAgent } from './source-control'

export function useChecksPanelCommentActions(context: useChecksPanelEntryAndEditState) {
  const {
    activeConnectionId,
    activeGitLabReview,
    activeReview,
    activeWorktreeId,
    addPRConversationComment,
    addPRReviewCommentReply,
    branch,
    commentsLoading,
    detectedAgentIds,
    isCurrentAsyncResult,
    pr,
    prCacheKey,
    prNumber,
    remoteDetectedAgentIds,
    repo,
    resolveReviewThread,
    setAgentComposerState,
    setComments,
    settings,
    sourceControlAiActionsVisible
  } = context

  const handleResolve = useCallback(
    async (
      threadId: string,
      resolve: boolean,
      options: { notifyOnFailure?: boolean } = {}
    ): Promise<boolean> => {
      const notifyOnFailure = options.notifyOnFailure !== false
      const rollbackThread = (previousThreadComments: PRComment[]): void => {
        setComments((prev) => restorePRCommentThreadSnapshot(prev, previousThreadComments))
      }
      if (repo && activeGitLabReview) {
        let previousThreadComments: PRComment[] = []
        setComments((prev) => {
          previousThreadComments = prev.filter((comment) => comment.threadId === threadId)
          return markPRCommentThreadResolved(prev, threadId, resolve)
        })
        const result = await resolveGitLabMRDiscussionForChecks({
          repoPath: repo.path,
          repoId: repo.id,
          settings,
          iid: activeGitLabReview.number,
          discussionId: threadId,
          resolved: resolve
        })
        if (!result.ok) {
          rollbackThread(previousThreadComments)
          if (notifyOnFailure) {
            toast.error(result.error)
          }
          return false
        }
        return true
      }
      if (!repo || !prNumber) {
        return false
      }
      const requestKey = checksPanelAsyncResultKey(
        prCacheKey,
        branch,
        prNumber,
        pr?.prRepo,
        pr?.headSha
      )
      let previousThreadComments: PRComment[] = []
      setComments((prev) => {
        previousThreadComments = prev.filter((comment) => comment.threadId === threadId)
        return markPRCommentThreadResolved(prev, threadId, resolve)
      })
      const ok = await resolveReviewThread(repo.path, prNumber, threadId, resolve, {
        repoId: repo.id,
        prRepo: pr?.prRepo
      })
      if (!isCurrentAsyncResult(requestKey)) {
        return ok
      }
      if (!ok) {
        rollbackThread(previousThreadComments)
        if (notifyOnFailure) {
          toast.error(
            translate(
              'auto.components.right.sidebar.ChecksPanel.5788d1059d',
              'Could not update review thread. Check the GitHub API budget.'
            )
          )
        }
      }
      return ok
    },
    [
      activeGitLabReview,
      branch,
      isCurrentAsyncResult,
      pr?.headSha,
      pr?.prRepo,
      prCacheKey,
      prNumber,
      repo,
      resolveReviewThread,
      settings,
      setComments
    ]
  )

  const canTargetPRComments = Boolean(repo && prNumber && pr?.prRepo)
  const commentsDisabledReason = canTargetPRComments
    ? undefined
    : 'Commenting requires a GitHub PR repository target.'
  const detectedAgentsForAI =
    typeof activeConnectionId === 'string' ? remoteDetectedAgentIds : detectedAgentIds
  const noEnabledAgentKnown =
    detectedAgentsForAI != null &&
    pickDefaultSourceControlAgent(
      settings?.defaultTuiAgent,
      detectedAgentsForAI,
      settings?.disabledTuiAgents
    ) == null
  const aiActionDisabledReason = !activeWorktreeId
    ? 'Select a workspace before launching an AI action.'
    : noEnabledAgentKnown
      ? 'No enabled AI agents. Configure agents in Settings.'
      : undefined
  useEffect(() => {
    if (!sourceControlAiActionsVisible) {
      setAgentComposerState(null)
    }
  }, [sourceControlAiActionsVisible, setAgentComposerState])
  const resolveCommentsWithAIDisabledReason = commentsLoading
    ? 'Comments are still loading.'
    : aiActionDisabledReason
      ? aiActionDisabledReason
      : !activeReview
        ? 'Open a PR or MR before launching an AI action.'
        : !repo
          ? 'Select a repository before launching an AI action.'
          : activeReview.provider === 'github' && !prNumber
            ? 'Open a GitHub PR before resolving comments.'
            : activeReview.provider === 'gitlab' && !activeGitLabReview
              ? 'Open a GitLab MR before resolving comments.'
              : undefined

  const handleAddPRComment = useCallback(
    async (body: string) => {
      if (!repo || !prNumber || !pr?.prRepo) {
        return { ok: false as const, error: commentsDisabledReason ?? 'Commenting unavailable.' }
      }
      const requestKey = checksPanelAsyncResultKey(
        prCacheKey,
        branch,
        prNumber,
        pr.prRepo,
        pr.headSha
      )
      const result = await addPRConversationComment(repo.path, prNumber, body, {
        repoId: repo.id,
        prRepo: pr.prRepo
      })
      if (!isCurrentAsyncResult(requestKey)) {
        return result.ok ? { ok: true as const } : result
      }
      if (!result.ok) {
        toast.error(result.error)
        return result
      }
      setComments((prev) => mergePRCommentIntoList(prev, result.comment))
      return { ok: true as const }
    },
    [
      addPRConversationComment,
      branch,
      commentsDisabledReason,
      isCurrentAsyncResult,
      pr,
      prCacheKey,
      prNumber,
      repo,
      setComments
    ]
  )

  const handleReplyToComment = useCallback(
    async (comment: PRComment, body: string) => {
      if (!repo || !prNumber || !pr?.prRepo) {
        return { ok: false as const, error: commentsDisabledReason ?? 'Commenting unavailable.' }
      }
      const requestKey = checksPanelAsyncResultKey(
        prCacheKey,
        branch,
        prNumber,
        pr.prRepo,
        pr.headSha
      )
      const canReplyToReviewThread =
        Boolean(comment.threadId) && Number.isSafeInteger(comment.id) && comment.id > 0
      const result = canReplyToReviewThread
        ? await addPRReviewCommentReply(repo.path, prNumber, comment.id, body, {
            repoId: repo.id,
            prRepo: pr.prRepo,
            threadId: comment.threadId,
            path: comment.path,
            line: comment.line
          })
        : await addPRConversationComment(repo.path, prNumber, `@${comment.author} ${body}`, {
            repoId: repo.id,
            prRepo: pr.prRepo
          })
      if (!isCurrentAsyncResult(requestKey)) {
        return result.ok ? { ok: true as const } : result
      }
      if (!result.ok) {
        toast.error(result.error)
        return result
      }
      setComments((prev) => mergePRCommentIntoList(prev, result.comment))
      return { ok: true as const }
    },
    [
      addPRConversationComment,
      addPRReviewCommentReply,
      branch,
      commentsDisabledReason,
      isCurrentAsyncResult,
      pr,
      prCacheKey,
      prNumber,
      repo,
      setComments
    ]
  )

  return {
    ...context,
    handleResolve,
    canTargetPRComments,
    commentsDisabledReason,
    detectedAgentsForAI,
    noEnabledAgentKnown,
    aiActionDisabledReason,
    resolveCommentsWithAIDisabledReason,
    handleAddPRComment,
    handleReplyToComment
  }
}

export type useChecksPanelCommentActionsState = ReturnType<typeof useChecksPanelCommentActions>
