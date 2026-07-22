import { GitMerge, GitPullRequest } from '@phosphor-icons/react'
import type React from 'react'

import { ArrowSquareOut as ExternalLink } from '@/components/regular-icons'
import { CHECK_COLOR, CHECK_ICON } from '@/components/right-sidebar/check-status-presentation'
import { ChecksList } from '@/components/right-sidebar/checks-panel-content'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type {
  SpoolChecksReadResult,
  SpoolChecksReview
} from '../../../../shared/spool/spool-operation-contract'

export function SpoolChecksResult({
  result
}: {
  result: SpoolChecksReadResult
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
              className="border-sidebar-border bg-sidebar text-sidebar-foreground hover:border-muted-foreground/35 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-sidebar-ring dark:border-sidebar-border dark:bg-sidebar dark:hover:bg-sidebar-accent"
              onClick={() => openOwnerUrl(reviewUrl)}
            >
              <ExternalLink aria-hidden="true" className="size-3" />
              {translate('auto.components.spool.SpoolChecksPane.openReview', 'Open review')}
            </Button>
          ) : null}
        </div>
      </div>

      <ChecksList
        checks={[...result.checks]}
        checksLoading={false}
        checkDetailsContextKey={`spool:${review.provider}:${review.number}:${review.updatedAt}`}
        persistDetails={false}
      />
      <SpoolCheckDetailNotice result={result} />
    </div>
  )
}

function SpoolCheckDetailNotice({
  result
}: {
  result: SpoolChecksReadResult
}): React.JSX.Element | null {
  let message: string | null = null
  if (result.detailStatus === 'unavailable') {
    message = translate(
      'auto.components.spool.SpoolChecksPane.detailsUnavailable',
      'Detailed checks could not be loaded.'
    )
  } else if (result.detailStatus === 'unsupported') {
    message = translate(
      'auto.components.spool.SpoolChecksPane.detailsUnsupported',
      'Detailed checks are not available for this provider.'
    )
  } else if (result.truncated) {
    message = translate(
      'auto.components.spool.SpoolChecksPane.checksTruncated',
      'Showing a partial check list.'
    )
  } else if (result.checks.length === 0) {
    message = translate(
      'auto.components.spool.SpoolChecksPane.noChecks',
      'No checks were reported for this review.'
    )
  }
  return message ? (
    <div className="text-muted-foreground px-4 py-8 text-center text-xs">{message}</div>
  ) : null
}

function ReviewStatus({ status }: { status: SpoolChecksReview['status'] }): React.JSX.Element {
  const StatusIcon = CHECK_ICON[status] ?? CHECK_ICON.neutral
  return (
    <span className={cn('flex items-center gap-1.5 text-[11px]', CHECK_COLOR[status])}>
      <StatusIcon className="size-3.5" />
      {reviewStatusLabel(status)}
    </span>
  )
}

function reviewStatusLabel(status: SpoolChecksReview['status']): string {
  switch (status) {
    case 'success':
      return translate('auto.components.spool.SpoolChecksPane.passing', 'Passing')
    case 'failure':
      return translate('auto.components.spool.SpoolChecksPane.failing', 'Failing')
    case 'pending':
      return translate('auto.components.spool.SpoolChecksPane.pending', 'Pending')
    case 'neutral':
      return translate('auto.components.spool.SpoolChecksPane.neutral', 'Neutral')
  }
}

function reviewLabel(review: SpoolChecksReview): string {
  const provider = providerLabel(review.provider)
  const prefix = review.provider === 'gitlab' ? '!' : '#'
  return `${provider} ${prefix}${review.number}`
}

function providerLabel(provider: SpoolChecksReview['provider']): string {
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
      return translate('auto.components.spool.SpoolChecksPane.hostedReview', 'Hosted review')
  }
}

function reviewStateLabel(state: SpoolChecksReview['state']): string {
  switch (state) {
    case 'open':
      return translate('auto.components.spool.SpoolChecksPane.open', 'Open')
    case 'closed':
      return translate('auto.components.spool.SpoolChecksPane.closed', 'Closed')
    case 'merged':
      return translate('auto.components.spool.SpoolChecksPane.merged', 'Merged')
    case 'draft':
      return translate('auto.components.spool.SpoolChecksPane.draft', 'Draft')
  }
}

function openOwnerUrl(url: string): void {
  // Why: the requester parser limits owner URLs to HTTP(S); bypass local worktree URL routing.
  void window.api.shell.openUrl(url)
}
