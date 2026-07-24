import React, { useCallback, useEffect, useRef, useState } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { usePRBotAuthorOverrides } from '@/lib/pr-bot-author-overrides'
import {
  getPRCommentGroupActionState,
  isPRCommentGroupQueueableForAI,
  partitionPRCommentGroupsForTriage,
  sortPRCommentGroupsForTimeline
} from '@/lib/pr-comment-action-state'
import {
  filterPRCommentsByAudience,
  getPRCommentAudienceCounts,
  getPRCommentAudienceEmptyLabel,
  type PRCommentAudienceFilter
} from '@/lib/pr-comment-audience'
import { getPRCommentGroupId, groupPRComments, type PRCommentGroup } from '@/lib/pr-comment-groups'

import type { PRComment } from '../../../../shared/types'
import { PRCommentGroupView, ResolvedCommentGroupsSection } from './checks-panel-comment-groups'
import { scrollElementBottomIntoView } from './checks-panel-comment-scroll'
import { PRCommentsHeader, type PRCommentsListDisplayMode } from './checks-panel-comments-header'
import { getPRCommentPresentationClasses } from './pr-comment-presentation'
import {
  usePRCommentsListSelection,
  type PRCommentsListSelectionClearRequest
} from './pr-comments-list-selection'
import {
  RightPanelCommentComposer,
  type RightPanelCommentSubmitResult
} from './right-panel-comment-composer'

export function PRCommentsList({
  comments,
  commentsLoading,
  reviewKind = 'PR',
  commentsDisabled,
  commentsDisabledReason,
  selectionContextKey,
  selectionClearRequest,
  resolveCommentsWithAIDisabled,
  resolveCommentsWithAIDisabledReason,
  onAddComment,
  onResolveSelectedCommentsWithAI,
  onReply,
  onResolve,
  onEditComment,
  onDeleteComment
}: {
  comments: PRComment[]
  commentsLoading: boolean
  reviewKind?: 'PR' | 'MR'
  commentsDisabled?: boolean
  commentsDisabledReason?: string
  selectionContextKey?: string
  selectionClearRequest?: PRCommentsListSelectionClearRequest | null
  resolveCommentsWithAIDisabled?: boolean
  resolveCommentsWithAIDisabledReason?: string
  onAddComment?: (body: string) => Promise<RightPanelCommentSubmitResult>
  onResolveSelectedCommentsWithAI?: (groups: PRCommentGroup[]) => void
  onReply?: (comment: PRComment, body: string) => Promise<RightPanelCommentSubmitResult>
  onResolve?: (threadId: string, resolve: boolean) => boolean | Promise<boolean>
  onEditComment?: (comment: PRComment, body: string) => Promise<boolean>
  onDeleteComment?: (comment: PRComment) => void | Promise<void>
}): React.JSX.Element {
  const presentation = React.useMemo(() => getPRCommentPresentationClasses(), [])
  const [commentFilter, setCommentFilter] = useState<PRCommentAudienceFilter>('all')
  const [displayMode, setDisplayMode] = useState<PRCommentsListDisplayMode>('triage')
  const [replyingCommentId, setReplyingCommentId] = useState<number | null>(null)
  const [isAddingComment, setIsAddingComment] = useState(false)
  const addCommentSurfaceRef = useRef<HTMLDivElement>(null)
  const shouldScrollAddCommentRef = useRef(false)
  const botAuthorOverrides = usePRBotAuthorOverrides()
  const commentCounts = React.useMemo(
    () => getPRCommentAudienceCounts(comments, botAuthorOverrides),
    [botAuthorOverrides, comments]
  )
  const {
    isSelectingForAI,
    selectedGroupIds,
    selectableGroups,
    selectableGroupsById,
    selectedGroups,
    addGroupToSelection,
    clearSelection,
    toggleGroupSelection
  } = usePRCommentsListSelection(comments, selectionContextKey, selectionClearRequest)
  const visibleComments = React.useMemo(
    () => filterPRCommentsByAudience(comments, commentFilter, botAuthorOverrides),
    [botAuthorOverrides, commentFilter, comments]
  )
  const groups = React.useMemo(() => groupPRComments(visibleComments), [visibleComments])
  const triageGroups = React.useMemo(() => partitionPRCommentGroupsForTriage(groups), [groups])
  // Why: triage mode prioritizes actionability; timeline restores the host discussion history.
  const timelineGroups = React.useMemo(() => sortPRCommentGroupsForTimeline(groups), [groups])
  const canShowResolveWithAI = Boolean(
    onResolveSelectedCommentsWithAI && selectableGroups.length > 0
  )
  useEffect(() => {
    if (!isAddingComment || !shouldScrollAddCommentRef.current) {
      return
    }
    shouldScrollAddCommentRef.current = false
    let secondFrame: number | null = null
    const scrollComposerIntoView = (): void => {
      const surface = addCommentSurfaceRef.current
      if (surface) {
        scrollElementBottomIntoView(surface)
      }
    }
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(scrollComposerIntoView)
    })
    // Why: the composer expands and focuses in separate layout passes; the
    // timeout catches the final height so the footer is visible in short panels.
    const settledTimer = window.setTimeout(scrollComposerIntoView, 120)
    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) {
        window.cancelAnimationFrame(secondFrame)
      }
      window.clearTimeout(settledTimer)
    }
  }, [isAddingComment])

  const startAddComment = useCallback(() => {
    shouldScrollAddCommentRef.current = true
    setIsAddingComment(true)
  }, [])

  const cancelAddComment = useCallback(() => {
    shouldScrollAddCommentRef.current = false
    setIsAddingComment(false)
  }, [])

  const renderSelectionControl = (group: PRCommentGroup): React.ReactNode => {
    if (!isSelectingForAI || !selectableGroupsById.has(getPRCommentGroupId(group))) {
      return null
    }
    const groupId = getPRCommentGroupId(group)
    const checked = selectedGroupIds.has(groupId)
    return (
      <Checkbox
        aria-label={translate(
          'auto.components.right.sidebar.checks.panel.content.5dc3af25c0',
          'Select comment'
        )}
        checked={checked}
        onCheckedChange={(value) => toggleGroupSelection(groupId, value === true)}
        className="shrink-0"
      />
    )
  }

  const renderCommentGroup = (group: PRCommentGroup): React.JSX.Element => {
    const groupId = getPRCommentGroupId(group)
    const actionState = getPRCommentGroupActionState(group)
    const isQueued = selectedGroupIds.has(groupId)
    const canQueue =
      canShowResolveWithAI &&
      !isQueued &&
      isPRCommentGroupQueueableForAI(group) &&
      selectableGroupsById.has(groupId) &&
      !isSelectingForAI
    return (
      <PRCommentGroupView
        key={groupId}
        group={group}
        botAuthorOverrides={botAuthorOverrides}
        replyingCommentId={replyingCommentId}
        selectionControl={renderSelectionControl(group)}
        actionState={actionState}
        isQueued={isQueued}
        replyDisabled={commentsDisabled}
        replyDisabledReason={commentsDisabledReason}
        presentation={presentation}
        onResolve={onResolve}
        onStartReply={setReplyingCommentId}
        onCancelReply={(commentId) =>
          setReplyingCommentId((current) => (current === commentId ? null : current))
        }
        onReply={onReply}
        onEditComment={onEditComment}
        onDeleteComment={onDeleteComment}
        onQueueForAgent={canQueue ? () => addGroupToSelection(groupId) : undefined}
      />
    )
  }

  const renderAddCommentComposer = (empty: boolean): React.JSX.Element => (
    <div
      ref={addCommentSurfaceRef}
      className={cn(empty ? 'px-3 py-2' : 'border-t border-border px-3 py-2')}
    >
      <RightPanelCommentComposer
        placeholder={
          empty
            ? translate(
                'auto.components.right.sidebar.checks.panel.content.ea9fd5ed6a',
                'Start conversation...'
              )
            : translate(
                'auto.components.right.sidebar.checks.panel.content.3fff651d32',
                'Add a PR comment'
              )
        }
        submitLabel="Send"
        autoFocus
        disabled={commentsDisabled}
        disabledReason={commentsDisabledReason}
        onCancel={cancelAddComment}
        onSubmit={
          onAddComment ??
          (async () => ({
            ok: false,
            error: translate(
              'auto.components.right.sidebar.checks.panel.content.b37ebdc51c',
              'Commenting unavailable.'
            )
          }))
        }
      />
    </div>
  )

  return (
    <div className="border-border border-t">
      {/* Header */}
      <PRCommentsHeader
        presentation={presentation}
        commentsCount={comments.length}
        commentCounts={commentCounts}
        commentFilter={commentFilter}
        displayMode={displayMode}
        reviewKind={reviewKind}
        commentsLoading={commentsLoading}
        commentsDisabled={commentsDisabled}
        commentsDisabledReason={commentsDisabledReason}
        resolveCommentsWithAIDisabled={resolveCommentsWithAIDisabled}
        resolveCommentsWithAIDisabledReason={resolveCommentsWithAIDisabledReason}
        canShowResolveWithAI={canShowResolveWithAI}
        isSelectingForAI={isSelectingForAI}
        selectableGroups={selectableGroups}
        selectedGroups={selectedGroups}
        clearSelection={clearSelection}
        onResolveSelectedCommentsWithAI={onResolveSelectedCommentsWithAI}
        onCommentFilterChange={setCommentFilter}
        onDisplayModeChange={setDisplayMode}
        onStartAddComment={onAddComment && !isAddingComment ? startAddComment : undefined}
      />
      {/* List */}
      {commentsLoading && comments.length === 0 ? (
        <div className="flex items-center justify-center py-6">
          <LoadingIndicator className="text-muted-foreground size-4" />
        </div>
      ) : comments.length === 0 && isAddingComment && onAddComment ? (
        renderAddCommentComposer(true)
      ) : comments.length === 0 ? (
        !onAddComment && (
          <div className="text-muted-foreground flex items-center justify-center py-5 text-[11px]">
            {translate(
              'auto.components.right.sidebar.checks.panel.content.755be805f6',
              'No comments'
            )}
          </div>
        )
      ) : visibleComments.length === 0 ? (
        <div className="text-muted-foreground flex items-center justify-center py-5 text-[11px]">
          {getPRCommentAudienceEmptyLabel(commentFilter)}
        </div>
      ) : (
        <div className={presentation.list}>
          {displayMode === 'timeline' ? (
            timelineGroups.map(renderCommentGroup)
          ) : (
            <>
              {triageGroups.open.length > 0 ? (
                <>
                  <div className={presentation.sectionTriageLabel}>
                    {translate(
                      'auto.components.right.sidebar.checks.panel.content.c3a8e5d710',
                      'Needs review · {{value0}}',
                      { value0: triageGroups.open.length }
                    )}
                  </div>
                  {triageGroups.open.map(renderCommentGroup)}
                </>
              ) : null}
              {triageGroups.conversation.map(renderCommentGroup)}
              <ResolvedCommentGroupsSection
                groups={triageGroups.resolved}
                botAuthorOverrides={botAuthorOverrides}
                replyingCommentId={replyingCommentId}
                replyDisabled={commentsDisabled}
                replyDisabledReason={commentsDisabledReason}
                presentation={presentation}
                onResolve={onResolve}
                onStartReply={setReplyingCommentId}
                onCancelReply={(commentId) =>
                  setReplyingCommentId((current) => (current === commentId ? null : current))
                }
                onReply={onReply}
                onEditComment={onEditComment}
                onDeleteComment={onDeleteComment}
              />
            </>
          )}
        </div>
      )}
      {onAddComment && comments.length > 0 && isAddingComment && renderAddCommentComposer(false)}
    </div>
  )
}
