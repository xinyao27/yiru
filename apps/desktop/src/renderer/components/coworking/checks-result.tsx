import { GitMerge, GitPullRequest, ArrowSquareOut as ExternalLink } from '@phosphor-icons/react'
import type React from 'react'
import { Button } from '~renderer/components/ui/button'
import {
  CHECK_COLOR,
  CHECK_ICON
} from '~renderer/components/workspace-panel/check-status-presentation'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'
import { shellClient } from '~renderer/runtime/shell-client'
import type {
  CoworkingChecksReadResult,
  CoworkingChecksReview
} from '~shared/coworking/operation-contract'

import { ChecksList } from '../workspace-panel/checks-panel/content'

export function CoworkingChecksResult({
  result
}: {
  result: CoworkingChecksReadResult
}): React.JSX.Element | null {
  const review = result.review
  if (!review) {
    return null
  }
  const reviewUrl = review.url
  const ReviewIcon = review.provider === 'gitlab' ? GitMerge : GitPullRequest
  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
      <div className="border-sidebar-border border-b px-3 py-3">
        <div className="flex min-w-0 items-start gap-2">
          <ReviewIcon aria-hidden="true" className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-foreground line-clamp-2 text-[13px] leading-5 font-medium">
              {review.title}
            </div>
            <div className="text-muted-foreground mt-1 text-[11px]">
              {reviewLabel(review)} · {reviewStateLabel(review.state)} ·{' '}
              {new Date(review.updatedAt).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <ReviewStatus status={review.status} />
          {reviewUrl ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="bg-sidebar text-sidebar-foreground dark:bg-sidebar"
              onClick={() => openOwnerUrl(reviewUrl)}
            >
              <ExternalLink aria-hidden="true" className="size-3" />
              {translate('auto.components.coworking.CoworkingChecksPane.openReview', 'Open review')}
            </Button>
          ) : null}
        </div>
      </div>

      <ChecksList
        checks={[...result.checks]}
        checksLoading={false}
        checkDetailsContextKey={`coworking:${review.provider}:${review.number}:${review.updatedAt}`}
        persistDetails={false}
      />
      <CoworkingCheckDetailNotice result={result} />
    </div>
  )
}

function CoworkingCheckDetailNotice({
  result
}: {
  result: CoworkingChecksReadResult
}): React.JSX.Element | null {
  let message: string | null = null
  if (result.detailStatus === 'unavailable') {
    message = translate(
      'auto.components.coworking.CoworkingChecksPane.detailsUnavailable',
      'Detailed checks could not be loaded.'
    )
  } else if (result.detailStatus === 'unsupported') {
    message = translate(
      'auto.components.coworking.CoworkingChecksPane.detailsUnsupported',
      'Detailed checks are not available for this provider.'
    )
  } else if (result.truncated) {
    message = translate(
      'auto.components.coworking.CoworkingChecksPane.checksTruncated',
      'Showing a partial check list.'
    )
  } else if (result.checks.length === 0) {
    message = translate(
      'auto.components.coworking.CoworkingChecksPane.noChecks',
      'No checks were reported for this review.'
    )
  }
  return message ? (
    <div className="text-muted-foreground px-4 py-8 text-center text-xs">{message}</div>
  ) : null
}

function ReviewStatus({ status }: { status: CoworkingChecksReview['status'] }): React.JSX.Element {
  const StatusIcon = CHECK_ICON[status] ?? CHECK_ICON.neutral
  return (
    <span className={cn('flex items-center gap-1.5 text-[11px]', CHECK_COLOR[status])}>
      <StatusIcon className="size-3.5" />
      {reviewStatusLabel(status)}
    </span>
  )
}

function reviewStatusLabel(status: CoworkingChecksReview['status']): string {
  switch (status) {
    case 'success':
      return translate('auto.components.coworking.CoworkingChecksPane.passing', 'Passing')
    case 'failure':
      return translate('auto.components.coworking.CoworkingChecksPane.failing', 'Failing')
    case 'pending':
      return translate('auto.components.coworking.CoworkingChecksPane.pending', 'Pending')
    case 'neutral':
      return translate('auto.components.coworking.CoworkingChecksPane.neutral', 'Neutral')
  }
}

function reviewLabel(review: CoworkingChecksReview): string {
  const provider = providerLabel(review.provider)
  const prefix = review.provider === 'gitlab' ? '!' : '#'
  return `${provider} ${prefix}${review.number}`
}

function providerLabel(provider: CoworkingChecksReview['provider']): string {
  switch (provider) {
    case 'github':
      return 'GitHub'
    case 'gitlab':
      return 'GitLab'
    case 'bitbucket':
      return 'Bitbucket'
    case 'azure-devops':
      return 'Azure DevOps'
    case 'gitea':
      return 'Gitea'
    case 'unsupported':
      return translate(
        'auto.components.coworking.CoworkingChecksPane.hostedReview',
        'Hosted review'
      )
  }
}

function reviewStateLabel(state: CoworkingChecksReview['state']): string {
  switch (state) {
    case 'open':
      return translate('auto.components.coworking.CoworkingChecksPane.open', 'Open')
    case 'closed':
      return translate('auto.components.coworking.CoworkingChecksPane.closed', 'Closed')
    case 'merged':
      return translate('auto.components.coworking.CoworkingChecksPane.merged', 'Merged')
    case 'draft':
      return translate('auto.components.coworking.CoworkingChecksPane.draft', 'Draft')
  }
}

function openOwnerUrl(url: string): void {
  // Why: the requester parser limits owner URLs to HTTP(S); bypass local worktree URL routing.
  void shellClient.shell.openUrl(url)
}
