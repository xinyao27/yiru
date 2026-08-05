import { cn } from 'cnfast'
import { View, Text, ActivityIndicator } from 'react-native'

import { translate } from '~/i18n/translate'

import { MobileAgentIcon } from './agent-icon'
import { ClaudeIcon, MiniMaxIcon, OpenAIIcon } from './agent-icons'

// Pure types and selectors live in account-usage-state.ts (no RN imports) so
// they are unit-testable; re-exported here so existing import sites are stable.
export type {
  RateLimitWindow,
  ProviderRateLimits,
  InactiveAccountUsage,
  ClaudeAccountSummary,
  CodexAccountSummary,
  AccountsSnapshot,
  ProviderKey,
  UsageProviderKey,
  UsageBarState
} from './account-usage-state'
import type { ProviderRateLimits, RateLimitWindow, UsageProviderKey } from './account-usage-state'
export {
  getActiveProviderRateLimits,
  getInactiveProviderUsage,
  getProviderRateLimits,
  getProviderResetLabel,
  getUsageBarState,
  getWindowResetLabel,
  getUsageWindowResetLabel,
  hasActiveProviderUsage,
  hasRenderableUsage,
  USAGE_PROVIDER_KEYS
} from './account-usage-state'

export type UsageWindowDensity = 'compact' | 'detail'

export type ProviderUsageWindow = {
  key: string
  label: string
  window: RateLimitWindow
}

export function getProviderUsageWindows(
  limits: ProviderRateLimits | null,
  density: UsageWindowDensity
): ProviderUsageWindow[] {
  if (!limits) {
    return []
  }

  const windows: ProviderUsageWindow[] = []
  const addWindow = (
    key: string,
    window: RateLimitWindow | null | undefined,
    compactLabel: string,
    detailLabel: string
  ) => {
    if (!window) {
      return
    }
    windows.push({
      key,
      label: density === 'compact' ? compactLabel : detailLabel,
      window
    })
  }

  if (limits.buckets?.length) {
    limits.buckets.forEach((bucket, index) => {
      windows.push({
        key: `bucket-${index}-${bucket.name}`,
        label: bucket.name,
        window: bucket
      })
    })
    addWindow(
      'weekly',
      limits.weekly,
      translate('mobile.usage.week', 'wk'),
      translate('mobile.usage.weekly', 'Weekly')
    )
    return windows
  }

  addWindow(
    'session',
    limits.session,
    translate('mobile.usage.fiveHours', '5h'),
    translate('mobile.usage.session', 'Session')
  )
  addWindow(
    'weekly',
    limits.weekly,
    translate('mobile.usage.week', 'wk'),
    translate('mobile.usage.weekly', 'Weekly')
  )
  addWindow(
    'fableWeekly',
    limits.fableWeekly,
    translate('mobile.usage.fable', 'Fable'),
    translate('mobile.usage.fable', 'Fable')
  )
  addWindow(
    'monthly',
    limits.monthly,
    translate('mobile.usage.month', 'mo'),
    translate('mobile.usage.monthly', 'Monthly')
  )
  return windows
}

export function getProviderUsageStatusLabel(limits: ProviderRateLimits | null): string {
  if (!limits) {
    return translate('mobile.usage.noData', 'No usage data')
  }
  switch (limits.status) {
    case 'idle':
    case 'fetching':
      return translate('mobile.usage.loading', 'Loading usage…')
    case 'ok':
      return translate('mobile.usage.noData', 'No usage data')
    case 'error':
      return translate('mobile.usage.refreshFailed', 'Unable to refresh usage')
    case 'unavailable':
      return translate('mobile.usage.unavailable', 'Usage unavailable')
  }
}

export function getUsageProviderLabel(provider: UsageProviderKey): string {
  switch (provider) {
    case 'claude':
      return translate('mobile.usage.provider.claude', 'Claude')
    case 'codex':
      return translate('mobile.usage.provider.codex', 'Codex')
    case 'cursor':
      return translate('mobile.usage.provider.cursor', 'Cursor')
    case 'gemini':
      return translate('mobile.usage.provider.gemini', 'Gemini')
    case 'opencode-go':
      return translate('mobile.usage.provider.opencodeGo', 'OpenCode Go')
    case 'kimi':
      return translate('mobile.usage.provider.kimi', 'Kimi')
    case 'antigravity':
      return translate('mobile.usage.provider.antigravity', 'Antigravity')
    case 'minimax':
      return translate('mobile.usage.provider.minimax', 'MiniMax')
    case 'grok':
      return translate('mobile.usage.provider.grok', 'Grok')
  }
}

export function UsageProviderMark({ provider }: { provider: UsageProviderKey }): React.JSX.Element {
  switch (provider) {
    case 'claude':
      return <ClaudeIcon size={15} />
    case 'codex':
      return <OpenAIIcon size={15} colorClassName="accent-foreground" />
    case 'cursor':
      return <MobileAgentIcon agentId="cursor" size={15} />
    case 'gemini':
      return <MobileAgentIcon agentId="gemini" size={15} />
    case 'opencode-go':
      return <MobileAgentIcon agentId="opencode" size={15} />
    case 'kimi':
      return <MobileAgentIcon agentId="kimi" size={15} />
    case 'antigravity':
      return <MobileAgentIcon agentId="antigravity" size={15} />
    case 'minimax':
      return <MiniMaxIcon size={15} />
    case 'grok':
      return <MobileAgentIcon agentId="grok" size={15} />
  }
}

export function formatUsagePlanLabel(planType: string | null | undefined): string | null {
  const trimmed = planType?.trim()
  if (!trimmed) {
    return null
  }
  return trimmed
    .split(/[\s_-]+/)
    .map((word) => {
      const normalized = word.toLowerCase()
      return normalized === 'chatgpt'
        ? 'ChatGPT'
        : normalized.charAt(0).toUpperCase() + normalized.slice(1)
    })
    .join(' ')
}

function getUsedPercent(usedPercent: number | null): number | null {
  if (usedPercent == null || !Number.isFinite(usedPercent)) {
    return null
  }
  return Math.max(0, Math.min(100, Math.round(usedPercent)))
}

function getUsageBarColorClass(used: number | null): string {
  if (used == null) {
    return 'bg-muted'
  }
  return used >= 80 ? 'bg-red-500' : used >= 60 ? 'bg-amber-500' : 'bg-green-500'
}

// Why: matches desktop StatusBar — bars show percent used (consumption), same
// as Claude/Codex harness meters. Fresh account is empty/green; depleted is
// full/red.
export function UsageBar({
  label,
  usedPercent,
  unavailable,
  loading,
  resetText,
  className
}: {
  label: string
  usedPercent: number | null
  unavailable: boolean
  loading?: boolean
  resetText?: string | null
  className?: string
}): React.JSX.Element {
  // Why: round then clamp so bar width, color, and label share one value (desktop parity).
  const used = getUsedPercent(usedPercent)
  const barColorClassName = getUsageBarColorClass(used)
  return (
    <View className={cn('flex-1 gap-1', className)}>
      <View className="flex-row items-center gap-1">
        <Text className="text-muted-foreground w-8 shrink-0" numberOfLines={1}>
          {label}
        </Text>
        <View className="bg-secondary h-1.5 flex-1 overflow-hidden rounded-full">
          <View
            className={cn('h-full', unavailable ? 'bg-muted' : barColorClassName)}
            style={{ width: `${used ?? 0}%` }}
          />
        </View>
        {loading ? (
          <ActivityIndicator
            size="small"
            colorClassName="accent-muted-foreground"
            className="w-9"
          />
        ) : (
          <Text className="text-muted-foreground w-8 shrink-0 text-right" numberOfLines={1}>
            {unavailable || used == null ? translate('mobile.usage.noDataShort', '—') : `${used}%`}
          </Text>
        )}
      </View>
      {resetText ? (
        // Why: the indent aligns the countdown with the usage track above it.
        <Text className="text-muted-foreground ml-7" numberOfLines={1}>
          {resetText}
        </Text>
      ) : null}
    </View>
  )
}

export function UsageDetailBar({
  label,
  usedPercent,
  unavailable,
  loading,
  resetText
}: {
  label: string
  usedPercent: number | null
  unavailable: boolean
  loading?: boolean
  resetText?: string | null
}): React.JSX.Element {
  const used = getUsedPercent(usedPercent)
  const barColorClassName = getUsageBarColorClass(used)
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-foreground text-sm font-medium">{label}</Text>
        {loading ? (
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        ) : (
          <Text className="text-muted-foreground text-xs">
            {unavailable || used == null
              ? translate('mobile.usage.noDataShort', '—')
              : translate('mobile.usage.usedPercent', 'Used {{percent}}%', { percent: used })}
          </Text>
        )}
      </View>
      <View className="bg-secondary h-2 overflow-hidden rounded-full">
        <View
          className={cn('h-full', unavailable ? 'bg-muted' : barColorClassName)}
          style={{ width: `${used ?? 0}%` }}
        />
      </View>
      {resetText ? (
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>
          {resetText}
        </Text>
      ) : null}
    </View>
  )
}
