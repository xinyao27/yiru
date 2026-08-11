import type React from 'react'
import { ProviderPanel } from '~renderer/components/status-bar/tooltip'
import { HoverCardContent } from '~renderer/components/ui/hover-card'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'
import type {
  CoworkingProviderQuota,
  CoworkingProviderQuotaWindow
} from '~shared/coworking/catalog-contract'
import type { ProviderRateLimits, RateLimitWindow } from '~shared/rate-limit-types'
import { normalizeUsagePercentageDisplay } from '~shared/usage-percentage-display'

import type { CoworkingRemoteDesktopSidebarContext } from './coworking-sidebar-rows'

function toRateLimitWindow(
  window: CoworkingProviderQuotaWindow | null,
  windowMinutes: number
): RateLimitWindow | null {
  return window
    ? {
        usedPercent: window.usedPercent,
        windowMinutes,
        resetsAt: window.resetsAt,
        resetDescription: null
      }
    : null
}

function toProviderRateLimits(
  provider: CoworkingProviderQuota['provider'],
  quota: CoworkingProviderQuota | null
): ProviderRateLimits {
  const available = quota?.status === 'ok'
  return {
    provider,
    session: available ? toRateLimitWindow(quota.fiveHour, 300) : null,
    weekly: available ? toRateLimitWindow(quota.sevenDay, 10_080) : null,
    updatedAt: quota?.updatedAt ?? 0,
    error: null,
    status: available ? 'ok' : 'unavailable'
  }
}

export function CoworkingDesktopUsageHoverCard({
  desktop
}: {
  desktop: CoworkingRemoteDesktopSidebarContext
}): React.JSX.Element {
  const display = normalizeUsagePercentageDisplay(
    useAppStore((state) => state.usagePercentageDisplay)
  )
  const limitsFor = (provider: CoworkingProviderQuota['provider']): ProviderRateLimits =>
    toProviderRateLimits(
      provider,
      desktop.quota.find((candidate) => candidate.provider === provider) ?? null
    )

  return (
    <HoverCardContent side="right" align="start" sideOffset={8} className="w-72 p-3">
      <div className="min-w-0">
        <div className="text-foreground truncate text-[13px] font-semibold">
          {desktop.userDisplayName}
        </div>
        <div className="text-muted-foreground mt-0.5 truncate text-[11px]">
          {desktop.nodeDisplayName}
        </div>
      </div>
      <div className="text-muted-foreground mt-3 text-[11px] font-semibold tracking-[0.05em] uppercase">
        {translate('auto.components.sidebar.CoworkingDesktopUsageHoverCard.usage', 'Usage')}
      </div>
      {/* Why: remote worktree hover reuses the status-bar detail panel so usage
          bars, reset copy, and the global used/remaining preference cannot drift. */}
      <div className="divide-border/70 text-foreground mt-2 grid gap-3 divide-y text-[11px]">
        <ProviderPanel
          p={limitsFor('claude')}
          className="w-full pb-3"
          showResetCredits={false}
          usagePercentageDisplay={display}
        />
        <ProviderPanel
          p={limitsFor('codex')}
          className="w-full"
          showResetCredits={false}
          usagePercentageDisplay={display}
        />
      </div>
    </HoverCardContent>
  )
}
