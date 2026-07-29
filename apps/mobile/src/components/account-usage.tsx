import { View, Text, ActivityIndicator } from 'react-native'

import { cn } from '@/style/class-names'

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
  UsageBarState
} from './account-usage-state'
export {
  getActiveProviderRateLimits,
  getInactiveProviderUsage,
  getUsageBarState,
  getWindowResetLabel,
  hasActiveProviderUsage,
  hasRenderableUsage
} from './account-usage-state'

// Why: matches desktop StatusBar — bars show percent used (consumption), same
// as Claude/Codex harness meters. Fresh account is empty/green; depleted is
// full/red.
export function UsageBar({
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
}) {
  // Why: round then clamp so bar width, color, and label share one value (desktop parity).
  const used = usedPercent == null ? null : Math.max(0, Math.min(100, Math.round(usedPercent)))
  // Why: same consumption bands as desktop barColor (green <60, amber <80, red ≥80).
  const barColorClassName =
    used == null
      ? 'bg-muted'
      : used >= 80
        ? 'bg-red-500'
        : used >= 60
          ? 'bg-amber-500'
          : 'bg-green-500'
  return (
    <View className="flex-1 gap-1">
      <View className="flex-row items-center gap-1">
        <Text className="text-muted-foreground w-6">{label}</Text>
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
          <Text className="text-muted-foreground w-9 text-right">
            {unavailable || used == null ? '—' : `${used}%`}
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
