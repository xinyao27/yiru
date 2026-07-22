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
      ? 'bg-neutral-500/40'
      : used >= 80
        ? 'bg-red-500'
        : used >= 60
          ? 'bg-amber-500'
          : 'bg-green-500'
  return (
    <View className={styles.usageBarColumn}>
      <View className={styles.usageBar}>
        <Text className={styles.usageLabel}>{label}</Text>
        <View className={styles.usageTrack}>
          <View
            className={cn(styles.usageFill, unavailable ? 'bg-neutral-500/40' : barColorClassName)}
            style={{ width: `${used ?? 0}%` }}
          />
        </View>
        {loading ? (
          <ActivityIndicator
            size="small"
            colorClassName="accent-muted-foreground"
            className={styles.usageSpinner}
          />
        ) : (
          <Text className={styles.usageValue}>
            {unavailable || used == null ? '—' : `${used}%`}
          </Text>
        )}
      </View>
      {resetText ? (
        <Text className={styles.usageResetText} numberOfLines={1}>
          {resetText}
        </Text>
      ) : null}
    </View>
  )
}

const styles = {
  usageBarColumn: cn('flex-1 gap-[2px]'),
  usageBar: cn('flex-row items-center gap-1'),
  usageLabel: cn('text-[12px] text-muted-foreground/60 w-[22px]'),
  usageTrack: cn('flex-1 h-1.5 rounded-none bg-secondary overflow-hidden'),
  usageFill: cn('h-full rounded-none'),
  usageValue: cn('text-[12px] text-muted-foreground w-9 text-right'),
  usageSpinner: cn('w-9'),
  // Why: indented past the window label so the countdown aligns with the
  // start of the track above it.
  usageResetText: cn('text-[12px] text-muted-foreground/60 ml-[26px]')
} as const
