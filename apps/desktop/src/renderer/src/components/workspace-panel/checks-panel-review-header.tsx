import {
  GitMerge,
  DotsThree as Ellipsis,
  Link,
  LinkBreak as Unlink,
  ArrowClockwise as RefreshCw
} from '@phosphor-icons/react'
import React from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { getTerminalUrlSystemBrowserHint } from '../terminal-pane/terminal-link-open-hints'
import { PullRequestIcon, prStateColor } from './checks-panel-content'
import type { ChecksPanelReview } from './checks-panel-review'
import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from './right-sidebar-button-styles'

type ChecksPanelReviewHeaderProps = {
  review: ChecksPanelReview
  isRefreshing: boolean
  canUnlinkPullRequest: boolean
  showSystemBrowserHint: boolean
  onRefresh: () => void
  onOpenReview: (event: React.MouseEvent<HTMLButtonElement>) => void
  onUnlinkPullRequest: () => void
  onLinkAnotherPullRequest: () => void
}

export function ChecksPanelReviewHeader({
  review,
  isRefreshing,
  canUnlinkPullRequest,
  showSystemBrowserHint,
  onRefresh,
  onOpenReview,
  onUnlinkPullRequest,
  onLinkAnotherPullRequest
}: ChecksPanelReviewHeaderProps): React.JSX.Element {
  const reviewNumberLabel = review.provider === 'gitlab' ? `!${review.number}` : `#${review.number}`
  const ReviewIcon = review.provider === 'gitlab' ? GitMerge : PullRequestIcon
  const reviewHostLabel = review.provider === 'gitlab' ? 'GitLab' : 'GitHub'
  const showPullRequestMenu = review.provider === 'github'
  const openTitle = translate(
    'auto.components.right.sidebar.ChecksPanel.5c88c6db07',
    'Open on {{value0}}',
    { value0: reviewHostLabel }
  )
  const title = showSystemBrowserHint
    ? `${openTitle}. ${getTerminalUrlSystemBrowserHint()}`
    : openTitle

  return (
    <div className="flex items-center gap-2">
      <ReviewIcon className="text-muted-foreground size-4 shrink-0" />
      <Button
        variant="outline"
        size="xs"
        type="button"
        className="decoration-border hover:text-foreground hover:decoration-foreground h-auto px-0.5 text-[12px] font-semibold underline underline-offset-2"
        title={title}
        onClick={onOpenReview}
      >
        {reviewNumberLabel}
      </Button>
      <span
        className={cn(
          'text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 border',
          prStateColor(review.state)
        )}
      >
        {review.state}
      </span>
      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              className={RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME}
              aria-label={translate(
                'auto.components.right.sidebar.ChecksPanel.7f4489f370',
                'Refresh'
              )}
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <LoadingIndicator className="size-3.5" />
              ) : (
                <RefreshCw weight="regular" className="size-3.5" />
              )}
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={4}>
          {translate('auto.components.right.sidebar.ChecksPanel.7f4489f370', 'Refresh')}
        </TooltipContent>
      </Tooltip>
      {showPullRequestMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                aria-label={translate(
                  'auto.components.right.sidebar.ChecksPanel.653c105ecc',
                  'More PR actions'
                )}
                title={translate(
                  'auto.components.right.sidebar.ChecksPanel.653c105ecc',
                  'More PR actions'
                )}
                className={RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME}
              >
                <Ellipsis className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem disabled={!canUnlinkPullRequest} onClick={onUnlinkPullRequest}>
              <Unlink className="size-3.5" />
              {translate('auto.components.right.sidebar.ChecksPanel.7202f4a40a', 'unlink PR')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onLinkAnotherPullRequest}>
              <Link className="size-3.5" />
              {translate('auto.components.right.sidebar.ChecksPanel.07871c0589', 'Link another PR')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
