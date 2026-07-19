import { CalendarDots as CalendarClock, Pencil, Note as StickyNote } from '@phosphor-icons/react'
import React from 'react'
import { toast } from 'sonner'

import { SelectedTextCopyMenu } from '@/components/selected-text-copy-menu'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import CommentMarkdown from './comment-markdown'
import { WorktreeCardAutomationDetailSection } from './worktree-card-automation-detail-section'
import {
  WorktreeCardDetailSection,
  WorktreeCardDetailSectionContent
} from './worktree-card-detail-section'
import { useWorktreeCardDetailsHoverControl } from './worktree-card-details-hover-state'
import { WorktreeCardHoverIdentityHeader } from './worktree-card-hover-identity-header'
import type {
  WorktreeCardMetaBadgesProps,
  WorktreeCardMetaBadgesRootProps,
  WorktreeCardDetailsHoverProps
} from './worktree-card-meta-types'
import { DetailHeader, MetaIconBadge, MetadataActionIcon } from './worktree-card-metadata-controls'
import { WorktreeCardReviewDetailSection } from './worktree-card-review-detail-section'
import { WORKTREE_NATIVE_CONTEXT_MENU_ATTR } from './worktree-context-menu'
import { getReviewLabel, ReviewIcon } from './worktree-review-helpers'

export type {
  WorktreeCardMetaBadgesProps,
  WorktreeCardMetaBadgesRootProps,
  WorktreeCardDetailsHoverProps
}

function hasComment(comment: string | null): boolean {
  return (comment ?? '').trim().length > 0
}

export function hasWorktreeCardDetails({
  review,
  comment,
  automationProvenance
}: WorktreeCardMetaBadgesProps): boolean {
  return Boolean(review || hasComment(comment) || automationProvenance)
}

export const WorktreeCardMetaBadges = React.forwardRef<
  HTMLDivElement,
  WorktreeCardMetaBadgesRootProps
>(function WorktreeCardMetaBadges(
  { review, comment, automationProvenance, className, ...props },
  ref
): React.JSX.Element | null {
  if (!hasWorktreeCardDetails({ review, comment, automationProvenance })) {
    return null
  }

  return (
    // Why: Radix HoverCardTrigger uses `asChild`, so this group must forward
    // trigger props/ref to the actual DOM node for attachment-only hover.
    <div
      ref={ref}
      {...props}
      className={cn('ml-auto flex shrink-0 items-center gap-1 pr-1.5', className)}
      aria-label={translate(
        'auto.components.sidebar.WorktreeCardMeta.3e65e11cc6',
        'Workspace metadata'
      )}
    >
      {hasComment(comment) && (
        <MetaIconBadge
          label={translate(
            'auto.components.sidebar.WorktreeCardMeta.fe075cb851',
            'Workspace notes'
          )}
        >
          <StickyNote className="text-muted-foreground" />
        </MetaIconBadge>
      )}
      {automationProvenance && (
        <MetaIconBadge
          label={translate(
            'auto.components.sidebar.WorktreeCardMeta.automationCreated',
            'Created by automation'
          )}
        >
          <CalendarClock className="text-muted-foreground" />
        </MetaIconBadge>
      )}
      {review && (
        <MetaIconBadge
          label={translate(
            'auto.components.sidebar.WorktreeCardMeta.3ea2702e62',
            'Linked {{value0}} #{{value1}}',
            { value0: getReviewLabel(review), value1: review.number }
          )}
        >
          <ReviewIcon review={review} />
        </MetaIconBadge>
      )}
    </div>
  )
})

export function WorktreeCardDetailsHover({
  review,
  comment,
  automationProvenance,
  children,
  branchName,
  workspaceTitle,
  identityOrder = 'workspace-first',
  workspaceTitleRenameDisabled = false,
  automationHostId,
  detailsAfter,
  openDelay = 250,
  closeDelay = 120,
  onRenameWorkspaceTitle,
  onWorkspaceTitleEditingChange,
  onEditComment,
  onOpenReviewInYiru,
  onUnlinkReview,
  onOpenAutomation,
  onOpenAutomationRun,
  hoverControl
}: WorktreeCardDetailsHoverProps): React.JSX.Element {
  const internalHoverControl = useWorktreeCardDetailsHoverControl()
  const {
    hoverOpen,
    reviewMenuOpen,
    handleHoverOpenChange,
    handleReviewMenuOpenChange,
    closeHover
  } = hoverControl ?? internalHoverControl
  const [workspaceTitleEditing, setWorkspaceTitleEditing] = React.useState(false)
  const pendingWorkspaceTitleCloseRef = React.useRef(false)
  const handleWorkspaceTitleEditingChange = React.useCallback(
    (editing: boolean): void => {
      setWorkspaceTitleEditing(editing)
      onWorkspaceTitleEditingChange?.(editing)
      if (!editing && pendingWorkspaceTitleCloseRef.current) {
        pendingWorkspaceTitleCloseRef.current = false
        handleHoverOpenChange(false)
      }
    },
    [handleHoverOpenChange, onWorkspaceTitleEditingChange]
  )
  const handleEffectiveHoverOpenChange = React.useCallback(
    (next: boolean): void => {
      if (!next && workspaceTitleEditing) {
        pendingWorkspaceTitleCloseRef.current = true
        return
      }
      pendingWorkspaceTitleCloseRef.current = false
      handleHoverOpenChange(next)
    },
    [handleHoverOpenChange, workspaceTitleEditing]
  )
  const dismissAndRun = React.useCallback(
    (handler: ((event: React.MouseEvent) => void) | undefined) => (event: React.MouseEvent) => {
      closeHover()
      handler?.(event)
    },
    [closeHover]
  )
  const copyLinkedWorkItemLink = React.useCallback(async (url: string, label: string) => {
    try {
      // Why: Electron clipboard IPC remains reliable from nested hover/dropdown
      // overlays where browser clipboard activation can be lost.
      await window.api.ui.writeClipboardText(url)
      toast.success(
        translate('auto.components.sidebar.WorktreeCardMeta.copyLinkSuccess', '{{value0}} copied', {
          value0: label
        })
      )
    } catch {
      toast.error(
        translate('auto.components.sidebar.WorktreeCardMeta.copyLinkFailure', 'Failed to copy link')
      )
    }
  }, [])
  const handleCopyReviewLink = React.useCallback((): void => {
    if (!review?.url) {
      return
    }
    void copyLinkedWorkItemLink(
      review.url,
      translate('auto.components.sidebar.WorktreeCardMeta.reviewLinkLabel', '{{value0}} link', {
        value0: getReviewLabel(review)
      })
    )
  }, [copyLinkedWorkItemLink, review])

  const showIdentityHeader = Boolean(branchName || workspaceTitle)

  if (
    !showIdentityHeader &&
    !hasWorktreeCardDetails({ review, comment, automationProvenance }) &&
    !detailsAfter
  ) {
    return children
  }

  return (
    <HoverCard
      open={hoverOpen || workspaceTitleEditing}
      onOpenChange={handleEffectiveHoverOpenChange}
    >
      <HoverCardTrigger delay={openDelay} closeDelay={closeDelay} render={children} />
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={8}
        className="scrollbar-sleek max-h-[28rem] w-80 overflow-y-auto p-3 text-xs"
        {...{ [WORKTREE_NATIVE_CONTEXT_MENU_ATTR]: '' }}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <SelectedTextCopyMenu className="space-y-3">
          {showIdentityHeader && (
            <WorktreeCardHoverIdentityHeader
              branchName={branchName}
              workspaceTitle={workspaceTitle}
              identityOrder={identityOrder}
              workspaceTitleRenameDisabled={workspaceTitleRenameDisabled}
              onRenameWorkspaceTitle={onRenameWorkspaceTitle}
              onWorkspaceTitleEditingChange={handleWorkspaceTitleEditingChange}
            />
          )}

          <WorktreeCardReviewDetailSection
            review={review}
            reviewMenuOpen={reviewMenuOpen}
            onReviewMenuOpenChange={handleReviewMenuOpenChange}
            onOpenReviewInYiru={onOpenReviewInYiru}
            onCopyReviewLink={review?.url ? handleCopyReviewLink : undefined}
            onUnlinkReview={onUnlinkReview}
            closeHover={closeHover}
          />

          {automationProvenance && (
            <WorktreeCardAutomationDetailSection
              provenance={automationProvenance}
              worktreeHostId={automationHostId}
              onOpenAutomation={onOpenAutomation ? dismissAndRun(onOpenAutomation) : undefined}
              onOpenAutomationRun={
                onOpenAutomationRun ? dismissAndRun(onOpenAutomationRun) : undefined
              }
            />
          )}

          {hasComment(comment) && (
            <WorktreeCardDetailSection>
              <DetailHeader
                icon={<StickyNote className="text-muted-foreground size-3" />}
                label={translate('auto.components.sidebar.WorktreeCardMeta.93cbea12c2', 'Notes')}
                actions={
                  onEditComment ? (
                    <MetadataActionIcon
                      label={translate(
                        'auto.components.sidebar.WorktreeCardMeta.c7fa72ead0',
                        'Edit notes'
                      )}
                      onClick={onEditComment}
                    >
                      <Pencil className="size-3" />
                    </MetadataActionIcon>
                  ) : null
                }
              />
              <WorktreeCardDetailSectionContent className="space-y-2">
                <CommentMarkdown
                  content={comment ?? ''}
                  className="text-foreground text-[11.5px] leading-normal break-words [&_.comment-md-p]:block [&_.comment-md-p+.comment-md-p]:mt-1"
                />
              </WorktreeCardDetailSectionContent>
            </WorktreeCardDetailSection>
          )}

          {detailsAfter}
        </SelectedTextCopyMenu>
      </HoverCardContent>
    </HoverCard>
  )
}
