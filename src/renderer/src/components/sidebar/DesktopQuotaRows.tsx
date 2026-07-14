import type React from 'react'
import { clampUsedPercent } from '../../../../shared/usage-percentage-display'
import type { SpoolProviderQuota } from '../../../../shared/spool/spool-catalog-contract'
import { translate } from '@/i18n/i18n'
import type { SpoolDesktopQuotaSidebarRow } from './spool-sidebar-rows'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'

type QuotaWindow = SpoolProviderQuota['fiveHour']

type DesktopQuotaRowsProps = {
  row: SpoolDesktopQuotaSidebarRow
}

const quotaResetFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})

function QuotaMeter({
  label,
  providerLabel,
  window
}: {
  label: string
  providerLabel: string
  window: QuotaWindow
}): React.JSX.Element {
  const usedPercent = clampUsedPercent(window?.usedPercent ?? 0)
  const resetAt = formatQuotaResetAt(window?.resetsAt ?? null)
  const resetLabel = resetAt
    ? translate('auto.components.sidebar.DesktopQuotaRows.resetsAt', 'Resets {{value0}}', {
        value0: resetAt
      })
    : null
  const ariaLabel = window
    ? translate(
        'auto.components.sidebar.DesktopQuotaRows.meterLabel',
        '{{value0}}: {{value1}}% used in {{value2}}',
        { value0: providerLabel, value1: String(usedPercent), value2: label }
      )
    : translate(
        'auto.components.sidebar.DesktopQuotaRows.windowUnavailable',
        '{{value0}}: {{value1}} usage unavailable',
        { value0: providerLabel, value1: label }
      )

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-0.5 flex items-center justify-between gap-1 text-[11px] leading-3 text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{window ? `${usedPercent}%` : '—'}</span>
      </div>
      <div
        role={window ? 'meter' : undefined}
        aria-label={window ? ariaLabel : undefined}
        aria-hidden={window ? undefined : true}
        aria-valuemin={window ? 0 : undefined}
        aria-valuemax={window ? 100 : undefined}
        aria-valuenow={window ? usedPercent : undefined}
        className="h-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-muted-foreground/40 transition-all duration-300 motion-reduce:transition-none"
          style={{ width: `${usedPercent}%` }}
        />
      </div>
      {!window ? <span className="sr-only">{ariaLabel}</span> : null}
      {resetLabel ? (
        <TruncatedSidebarLabel
          text={resetLabel}
          className="mt-0.5 text-[11px] leading-3 text-muted-foreground"
        />
      ) : null}
    </div>
  )
}

function formatQuotaResetAt(timestamp: number | null): string | null {
  if (timestamp === null || !Number.isFinite(timestamp)) {
    return null
  }
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : quotaResetFormatter.format(date)
}

function ProviderQuotaRow({
  provider,
  quota
}: {
  provider: SpoolProviderQuota['provider']
  quota: SpoolProviderQuota | null
}): React.JSX.Element {
  const providerLabel = provider === 'claude' ? 'Claude' : 'Codex'
  const unavailable = !quota || quota.status === 'unavailable'
  const fiveHourLabel = translate('auto.components.sidebar.DesktopQuotaRows.fiveHour', '5h')
  const sevenDayLabel = translate('auto.components.sidebar.DesktopQuotaRows.sevenDay', '7d')

  return (
    <div className="flex min-w-0 items-end gap-1.5">
      <span className="w-10 shrink-0 pb-0.5 text-[11px] font-medium leading-3 text-muted-foreground">
        {providerLabel}
      </span>
      <QuotaMeter
        label={fiveHourLabel}
        providerLabel={providerLabel}
        window={unavailable ? null : quota.fiveHour}
      />
      <QuotaMeter
        label={sevenDayLabel}
        providerLabel={providerLabel}
        window={unavailable ? null : quota.sevenDay}
      />
    </div>
  )
}

export function DesktopQuotaRows({ row }: DesktopQuotaRowsProps): React.JSX.Element {
  const claude = row.quota.find((candidate) => candidate.provider === 'claude') ?? null
  const codex = row.quota.find((candidate) => candidate.provider === 'codex') ?? null
  return (
    <div className="space-y-1 py-1 pl-7 pr-1.5">
      <ProviderQuotaRow provider="claude" quota={claude} />
      <ProviderQuotaRow provider="codex" quota={codex} />
    </div>
  )
}
