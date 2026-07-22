import { GitBranch } from '@phosphor-icons/react'
import React from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { getWorktreeStatusLabel, type WorktreeStatus } from '@/lib/worktree-status'

import StatusIndicator from './status-indicator'
import { useWorktreeActivityStatus } from './use-worktree-activity-status'
import type { WorktreeCardPrDisplay } from './worktree-card-pr-display'
import { getReviewLabel, ReviewIcon } from './worktree-review-helpers'

type WorktreeCardStatusSlotProps = {
  worktreeId: string
  showStatus: boolean
  isUnread: boolean
  prDisplay?: WorktreeCardPrDisplay | null
  hasBranchIdentity?: boolean
  branchIdentityLabel?: string
  className?: string
}

const QUIET_REVIEW_REPLACEABLE_STATUSES = new Set<WorktreeStatus>(['active', 'done', 'inactive'])

// Why: a missing review display can also mean provider state is unavailable,
// so the passive label names the identity cue without claiming no review exists.
function getDefaultBranchIdentityLabel(): string {
  return translate('auto.components.sidebar.WorktreeCardStatusSlot.branchIdentity', 'Branch')
}

// Why: branch-style SVGs are optically left-heavy; this keeps them aligned with
// the centered activity dots in the shared status column.
const reviewAndBranchStatusIconClassName = 'size-[13px] translate-x-px'
const branchStatusIconClassName = cn(reviewAndBranchStatusIconClassName, 'text-muted-foreground/70')

// Why: a left-edge badge overlays unread on the status glyph without widening
// the lane or indenting the title.
const unreadAlertClassName =
  'pointer-events-none absolute left-0 top-1/2 size-[6px] -translate-y-1/2 rounded-full bg-amber-500'

function overlayUnreadStatus(
  status: React.JSX.Element,
  showUnreadAlert: boolean
): React.JSX.Element {
  if (!showUnreadAlert) {
    return status
  }

  return (
    <span
      data-worktree-status-lane-unread=""
      className="relative inline-flex size-5 shrink-0 items-center justify-center"
    >
      {status}
      <span data-worktree-unread-alert="" className={unreadAlertClassName} aria-hidden="true" />
    </span>
  )
}

function getReviewStatusTooltip(review: WorktreeCardPrDisplay): string {
  const label = getReviewLabel(review)
  if (review.state === 'merged') {
    return `${label}: Merged`
  }
  if (review.state === 'closed') {
    return `${label}: Closed`
  }
  if (review.state === 'draft') {
    return `${label}: Draft`
  }
  if (review.status === 'failure') {
    return `${label} checks: Failed`
  }
  if (review.status === 'pending') {
    return `${label} checks: Pending`
  }
  if (review.status === 'success') {
    return `${label} checks: Passing`
  }
  return `${label}: Open`
}

export function WorktreeCardStatusSlot({
  worktreeId,
  showStatus,
  isUnread,
  prDisplay = null,
  hasBranchIdentity = false,
  branchIdentityLabel,
  className
}: WorktreeCardStatusSlotProps): React.JSX.Element | null {
  const status = useWorktreeActivityStatus(worktreeId)
  const statusLabel = getWorktreeStatusLabel(status) || status
  const canShowReviewStatus =
    showStatus && prDisplay !== null && QUIET_REVIEW_REPLACEABLE_STATUSES.has(status)
  const canShowBranchStatus =
    showStatus &&
    hasBranchIdentity &&
    prDisplay === null &&
    QUIET_REVIEW_REPLACEABLE_STATUSES.has(status)
  const passiveStatusLabel =
    canShowReviewStatus && prDisplay
      ? getReviewStatusTooltip(prDisplay)
      : canShowBranchStatus
        ? (branchIdentityLabel ?? getDefaultBranchIdentityLabel())
        : statusLabel
  const passiveStatusTooltip = isUnread ? `${passiveStatusLabel} · Unread` : passiveStatusLabel
  // Why: review or branch identity can own the visible glyph while activity
  // still changes underneath; keep that computed state observable on the slot.
  const activityStatusAttribute = { 'data-worktree-activity-status': status }
  // Why: working and permission own the status lane, but unread state remains
  // available in assistive copy and reappears visually afterward.
  const showUnreadAlert = isUnread && showStatus && status !== 'working' && status !== 'permission'
  const branchStatusIcon = <GitBranch className={branchStatusIconClassName} aria-hidden="true" />
  const passiveStatus =
    canShowReviewStatus && prDisplay ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn('inline-flex size-5 items-center justify-center p-0.5', className)}
              {...activityStatusAttribute}
            >
              <ReviewIcon
                review={prDisplay}
                className={reviewAndBranchStatusIconClassName}
                variant="generic"
              />
              <span className="sr-only">{passiveStatusTooltip}</span>
            </span>
          }
        />
        <TooltipContent side="right" sideOffset={8}>
          <span>{passiveStatusTooltip}</span>
        </TooltipContent>
      </Tooltip>
    ) : canShowBranchStatus ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn('inline-flex size-5 items-center justify-center p-0.5', className)}
              {...activityStatusAttribute}
            >
              {branchStatusIcon}
              <span className="sr-only">{passiveStatusTooltip}</span>
            </span>
          }
        />
        <TooltipContent side="right" sideOffset={8}>
          <span>{passiveStatusTooltip}</span>
        </TooltipContent>
      </Tooltip>
    ) : (
      <>
        <span className={cn('inline-flex size-5 items-center justify-center', className)}>
          <StatusIndicator status={status} aria-hidden="true" {...activityStatusAttribute} />
        </span>
        <span className="sr-only">{passiveStatusTooltip}</span>
      </>
    )

  if (!showStatus) {
    return null
  }

  return overlayUnreadStatus(passiveStatus, showUnreadAlert)
}
