import type React from 'react'
import { ExternalLink, GitMerge, GitPullRequest } from 'lucide-react'
import type {
  SpoolCheckEntry,
  SpoolChecksReadResult,
  SpoolChecksReview
} from '../../../../shared/spool/spool-operation-contract'
import { Button } from '@/components/ui/button'
import { CHECK_COLOR, CHECK_ICON } from '@/components/right-sidebar/check-status-presentation'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

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
      <div className="border-b border-sidebar-border px-3 py-3">
        <div className="flex min-w-0 items-start gap-2">
          <ReviewIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[13px] font-medium leading-5 text-foreground">
              {review.title}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
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
              className="border-sidebar-border bg-sidebar text-sidebar-foreground hover:border-muted-foreground/35 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-sidebar-ring focus-visible:ring-sidebar-ring/50 dark:border-sidebar-border dark:bg-sidebar dark:hover:bg-sidebar-accent"
              onClick={() => openOwnerUrl(reviewUrl)}
            >
              <ExternalLink aria-hidden="true" className="size-3" />
              {translate('auto.components.spool.SpoolChecksPane.openReview', 'Open review')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          {translate('auto.components.spool.SpoolChecksPane.checks', 'Checks')}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {result.checks.length}
        </span>
      </div>

      {result.checks.map((check, index) => (
        <SpoolCheckRow key={`${check.name}:${index}`} check={check} />
      ))}
      <SpoolCheckDetailNotice result={result} />
    </div>
  )
}

function SpoolCheckRow({ check }: { check: SpoolCheckEntry }): React.JSX.Element {
  const url = check.url
  const content = (
    <>
      <CheckStateIcon check={check} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-foreground">{check.name}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {checkStateLabel(check)}
        </span>
      </span>
      {url ? <ExternalLink aria-hidden="true" className="size-3.5 text-muted-foreground" /> : null}
    </>
  )
  const className = cn(
    'flex w-full min-w-0 items-center gap-2 border-b border-sidebar-border px-3 py-2 text-left',
    url &&
      'transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring'
  )
  return url ? (
    <button type="button" className={className} onClick={() => openOwnerUrl(url)}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
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
    <div className="px-4 py-8 text-center text-xs text-muted-foreground">{message}</div>
  ) : null
}

function ReviewStatus({ status }: { status: SpoolChecksReview['status'] }): React.JSX.Element {
  const StatusIcon = CHECK_ICON[status] ?? CHECK_ICON.neutral
  return (
    <span className={cn('flex items-center gap-1.5 text-[11px]', CHECK_COLOR[status])}>
      <StatusIcon className={cn('size-3.5', status === 'pending' && 'animate-spin')} />
      {reviewStatusLabel(status)}
    </span>
  )
}

function CheckStateIcon({ check }: { check: SpoolCheckEntry }): React.JSX.Element {
  const tone = checkPresentationTone(check)
  const StatusIcon = CHECK_ICON[tone] ?? CHECK_ICON.neutral
  return (
    <StatusIcon
      className={cn('size-4 shrink-0', CHECK_COLOR[tone], tone === 'pending' && 'animate-spin')}
    />
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

function checkPresentationTone(check: SpoolCheckEntry): string {
  if (check.status !== 'completed' || check.conclusion === 'pending' || check.conclusion === null) {
    return 'pending'
  }
  return check.conclusion
}

function checkStateLabel(check: SpoolCheckEntry): string {
  if (check.status === 'queued') {
    return translate('auto.components.spool.SpoolChecksPane.queued', 'Queued')
  }
  if (check.status === 'in_progress') {
    return translate('auto.components.spool.SpoolChecksPane.inProgress', 'In progress')
  }
  switch (check.conclusion) {
    case 'success':
      return translate('auto.components.spool.SpoolChecksPane.succeeded', 'Succeeded')
    case 'failure':
      return translate('auto.components.spool.SpoolChecksPane.failed', 'Failed')
    case 'cancelled':
      return translate('auto.components.spool.SpoolChecksPane.cancelled', 'Cancelled')
    case 'timed_out':
      return translate('auto.components.spool.SpoolChecksPane.timedOut', 'Timed out')
    case 'skipped':
      return translate('auto.components.spool.SpoolChecksPane.skipped', 'Skipped')
    case 'action_required':
      return translate('auto.components.spool.SpoolChecksPane.actionRequired', 'Action required')
    case 'neutral':
      return translate('auto.components.spool.SpoolChecksPane.neutral', 'Neutral')
    case 'pending':
    case null:
      return translate('auto.components.spool.SpoolChecksPane.pending', 'Pending')
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
