import { ArrowSquareOut as ExternalLink, ArrowClockwise as RefreshCw } from '@phosphor-icons/react'
import React from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { GitBranchCompareSummary, GitUpstreamStatus } from '../../../../shared/types'
import {
  buildSourceControlBranchContextStats,
  resolveSourceControlDisplayedBaseRef,
  shouldShowSourceControlBranchContextRow
} from './source-control-branch-context-stats'
import { SourceControlHeaderIconButton } from './source-control-header-icon-button'

export { shouldShowSourceControlBranchContextRow } from './source-control-branch-context-stats'

function BaseRefButton({
  baseRef,
  onClick,
  title
}: {
  baseRef: string
  onClick: () => void
  title: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="text-foreground/90 decoration-border hover:text-foreground hover:decoration-foreground max-w-full min-w-0 truncate rounded-sm border-0 bg-transparent p-0 text-left font-mono text-[10.5px] font-medium underline underline-offset-2"
      onClick={onClick}
      title={`${title} (${baseRef})`}
    >
      {baseRef}
    </button>
  )
}

function ContextStat({
  stat
}: {
  stat: ReturnType<typeof buildSourceControlBranchContextStats>[number]
}): React.JSX.Element {
  const className = cn(
    'shrink-0 tabular-nums text-muted-foreground',
    stat.tone === 'muted' && 'text-muted-foreground/70'
  )

  if (!stat.title) {
    return <span className={className}>{stat.label}</span>
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={className}>{stat.label}</span>} />
      <TooltipContent side="bottom" sideOffset={6}>
        {stat.title}
      </TooltipContent>
    </Tooltip>
  )
}

function ManualReviewLinkButton({
  url
}: {
  url: string | null | undefined
}): React.JSX.Element | null {
  if (!url) {
    return null
  }
  return (
    <SourceControlHeaderIconButton
      icon={ExternalLink}
      label={translate(
        'auto.components.right.sidebar.SourceControl.4b4a7de138',
        'Open review page in browser'
      )}
      onClick={() => {
        void window.api.shell.openUrl(url)
      }}
    />
  )
}

export function SourceControlBranchContextRow({
  summary,
  compareBaseRef,
  upstreamStatus,
  manualReviewUrl,
  onChangeBaseRef,
  onRetry
}: {
  summary: GitBranchCompareSummary | null
  compareBaseRef: string | null
  upstreamStatus?: GitUpstreamStatus
  manualReviewUrl?: string | null
  onChangeBaseRef: () => void
  onRetry: () => void
}): React.JSX.Element | null {
  const displayedBaseRef = resolveSourceControlDisplayedBaseRef(summary, compareBaseRef)
  if (!shouldShowSourceControlBranchContextRow(summary, compareBaseRef) || !displayedBaseRef) {
    return null
  }

  const changeBaseTitle = translate(
    'auto.components.right.sidebar.SourceControl.493f963029',
    'Change base ref'
  )

  if (!summary || summary.status === 'loading') {
    return (
      <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px]">
        <LoadingIndicator className="size-3 shrink-0" />
        <span className="text-muted-foreground shrink-0">
          {translate('auto.components.right.sidebar.SourceControl.e8a1c4b203', 'vs')}
        </span>
        <span className="min-w-0 flex-1">
          <BaseRefButton
            baseRef={displayedBaseRef}
            onClick={onChangeBaseRef}
            title={changeBaseTitle}
          />
        </span>
        <ManualReviewLinkButton url={manualReviewUrl} />
      </div>
    )
  }

  if (summary.status !== 'ready') {
    return (
      <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px]">
        <span className="min-w-0 flex-1">
          <BaseRefButton
            baseRef={displayedBaseRef}
            onClick={onChangeBaseRef}
            title={changeBaseTitle}
          />
        </span>
        <span className="min-w-0 flex-1 truncate" title={summary.errorMessage ?? undefined}>
          {summary.errorMessage ??
            translate(
              'auto.components.right.sidebar.SourceControl.715d229c86',
              'Branch compare unavailable'
            )}
        </span>
        <ManualReviewLinkButton url={manualReviewUrl} />
        <SourceControlHeaderIconButton
          icon={RefreshCw}
          label={translate('auto.components.right.sidebar.SourceControl.286dbda4d6', 'Retry')}
          onClick={onRetry}
        />
      </div>
    )
  }

  const stats = buildSourceControlBranchContextStats({
    summary,
    baseRef: displayedBaseRef,
    upstreamStatus
  })

  return (
    <div className="text-muted-foreground flex min-w-0 items-center justify-between gap-1.5 text-[11px]">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="shrink-0">
          {translate('auto.components.right.sidebar.SourceControl.e8a1c4b203', 'vs')}
        </span>
        <span className="min-w-0 flex-1">
          <BaseRefButton
            baseRef={displayedBaseRef}
            onClick={onChangeBaseRef}
            title={changeBaseTitle}
          />
        </span>
      </div>
      {stats.length > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-1.5">
          {stats.map((stat) => (
            <ContextStat key={stat.key} stat={stat} />
          ))}
        </span>
      ) : null}
      <ManualReviewLinkButton url={manualReviewUrl} />
    </div>
  )
}
