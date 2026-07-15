import { AlertTriangle } from 'lucide-react'
import { Fragment } from 'react'
import type React from 'react'
import type { ProviderRateLimits, RateLimitWindow } from '../../../../shared/rate-limit-types'
import {
  getDisplayedUsagePercentage,
  type UsagePercentageDisplay
} from '../../../../shared/usage-percentage-display'
import { translate } from '@/i18n/i18n'
import { formatWindowLabel } from '@/lib/window-label-formatter'
import { formatUsagePercentageLabel } from './usage-percentage-label'
import { getProviderUsageStatusLabel, ProviderIcon } from './tooltip'

// Why: only the primary Gemini buckets earn space in compact usage surfaces;
// the remaining model buckets stay available in the detailed usage panel.
const STATUS_BAR_BUCKET_NAMES = new Set(['Flash', 'Pro', '1.5 Pro'])

function UsageBar({
  usedPercent,
  display
}: {
  usedPercent: number
  display: UsagePercentageDisplay
}): React.JSX.Element {
  return (
    <span className="h-[6px] w-12 shrink-0 overflow-hidden rounded-full bg-muted">
      <span
        className="block h-full rounded-full bg-muted-foreground/40 transition-all duration-300"
        style={{ width: `${getDisplayedUsagePercentage(usedPercent, display)}%` }}
      />
    </span>
  )
}

function WindowLabel({
  window,
  label,
  display
}: {
  window: RateLimitWindow
  label: string
  display: UsagePercentageDisplay
}): React.JSX.Element {
  return (
    <span className="tabular-nums">
      {formatUsagePercentageLabel(window.usedPercent, display)} {label}
    </span>
  )
}

export function ProviderUsageSegment({
  limits,
  compact,
  display
}: {
  limits: ProviderRateLimits | null
  compact: boolean
  display: UsagePercentageDisplay
}): React.JSX.Element {
  const provider = limits?.provider ?? 'claude'
  const statusLabel = limits ? getProviderUsageStatusLabel(limits) : ''

  if (!limits || limits.status === 'idle') {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <ProviderIcon provider={provider} />
        <span className="animate-pulse">···</span>
      </span>
    )
  }

  if (
    limits.status === 'fetching' &&
    !limits.session &&
    !limits.weekly &&
    !limits.monthly &&
    !limits.fableWeekly
  ) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <ProviderIcon provider={provider} />
        <span className="animate-pulse">···</span>
      </span>
    )
  }

  if (limits.status === 'unavailable') {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground/50">
        <ProviderIcon provider={provider} /> --
      </span>
    )
  }

  if (
    limits.status === 'error' &&
    !limits.session &&
    !limits.weekly &&
    !limits.monthly &&
    !limits.fableWeekly
  ) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <ProviderIcon provider={provider} />
        <AlertTriangle size={11} className="text-muted-foreground/80" />
        {!compact ? <span className="text-[11px] font-medium">{statusLabel}</span> : null}
      </span>
    )
  }

  const isStale = limits.status === 'error'
  if (limits.buckets && limits.buckets.length > 0) {
    const visibleBuckets = limits.buckets.filter((bucket) =>
      STATUS_BAR_BUCKET_NAMES.has(bucket.name)
    )
    return (
      <span className="inline-flex items-center gap-1.5">
        <ProviderIcon provider={provider} />
        {visibleBuckets.map((bucket, index) => (
          <Fragment key={bucket.name}>
            {index > 0 ? <span className="text-muted-foreground">·</span> : null}
            <span className="tabular-nums">
              {bucket.name} {formatUsagePercentageLabel(bucket.usedPercent, display)}
            </span>
          </Fragment>
        ))}
        {visibleBuckets.length === 0 && limits.session ? (
          <WindowLabel
            window={limits.session}
            label={formatWindowLabel(limits.session.windowMinutes)}
            display={display}
          />
        ) : null}
        {isStale ? <AlertTriangle size={11} className="text-muted-foreground/80" /> : null}
      </span>
    )
  }

  const visibleWindows = [
    limits.session
      ? {
          key: 'session',
          window: limits.session,
          label: formatWindowLabel(limits.session.windowMinutes)
        }
      : null,
    limits.weekly
      ? {
          key: 'weekly',
          window: limits.weekly,
          label: formatWindowLabel(limits.weekly.windowMinutes)
        }
      : null,
    limits.fableWeekly
      ? {
          key: 'fableWeekly',
          window: limits.fableWeekly,
          label: translate('auto.components.status.bar.StatusBar.a79c64f87e', 'Fable')
        }
      : null,
    // Why: unified-billing providers expose only a monthly window; providers
    // with shorter windows keep monthly details in the hover surface.
    limits.monthly && !limits.session && !limits.weekly
      ? {
          key: 'monthly',
          window: limits.monthly,
          label: formatWindowLabel(limits.monthly.windowMinutes)
        }
      : null
  ].filter(
    (window): window is { key: string; window: RateLimitWindow; label: string } => window !== null
  )

  return (
    <span className="inline-flex items-center gap-1.5">
      <ProviderIcon provider={provider} />
      {limits.session && !compact ? (
        <UsageBar usedPercent={limits.session.usedPercent} display={display} />
      ) : null}
      {visibleWindows.map((window, index) => (
        <Fragment key={window.key}>
          {index > 0 ? <span className="text-muted-foreground">·</span> : null}
          <WindowLabel window={window.window} label={window.label} display={display} />
        </Fragment>
      ))}
      {isStale ? <AlertTriangle size={11} className="text-muted-foreground/80" /> : null}
    </span>
  )
}
