import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import {
  Warning as AlertTriangle,
  Check,
  CaretRight as ChevronRight,
  RadioButton as CircleDot,
  GitPullRequest,
  Chat as MessageSquare,
  X
} from '~/components/uniwind-icons'
import { cn } from '~/style/class-names'

import { statusColorClasses } from '../components/pr-sidebar/status-color'
import { hubStyles } from './hub-styles'
import type { MobilePrChipRollup, MobilePrChipSummary } from './pr-chip-summary'

type Props = {
  summary: MobilePrChipSummary
  onPress: () => void
}

// The glanceable PR status line on the branch card. Tapping it switches to the
// Pull Request segment. Rendered only when the repo supports hosted review — the
// parent gates on that, so this component always has something meaningful to show.
export function MobileSourceControlPrChip({ summary, onPress }: Props) {
  const stateColors = summary.kind === 'ready' ? statusColorClasses(summary.stateToken) : null
  return (
    <Pressable
      className={cn(
        'flex-row items-center gap-2 mt-3 pt-3 border-t-hairline border-t-border',
        'active:bg-accent'
      )}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={chipAccessibilityLabel(summary)}
    >
      <View className="w-5 items-center">
        <GitPullRequest size={15} colorClassName="accent-muted-foreground" />
      </View>
      {summary.kind === 'loading' ? (
        <>
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
          <Text className={hubStyles.chipMutedText} numberOfLines={1}>
            Loading pull request…
          </Text>
        </>
      ) : summary.kind === 'none' ? (
        <>
          <Text className="text-primary text-sm font-semibold">Create pull request</Text>
          <View className={hubStyles.chipSpacer} />
          <View className="w-5 items-center">
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </View>
        </>
      ) : summary.kind === 'unavailable' ? (
        <>
          <Text className={hubStyles.chipMutedText} numberOfLines={1}>
            {summary.message}
          </Text>
          <View className="w-5 items-center">
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </View>
        </>
      ) : (
        <>
          <Text className="text-foreground text-sm font-bold">#{summary.number}</Text>
          <View className={cn('px-2 py-1 border-hairline', stateColors?.border)}>
            <Text className={cn('text-xs font-bold', stateColors?.text)}>{summary.stateLabel}</Text>
          </View>
          <ChipRollup rollup={summary.rollup} />
          {summary.commentCount != null && summary.commentCount > 0 ? (
            <View className="flex-row items-center gap-1">
              <MessageSquare size={13} colorClassName="accent-muted-foreground" />
              <Text className="text-muted-foreground text-xs font-semibold">
                {summary.commentCount}
              </Text>
            </View>
          ) : null}
          <View className={hubStyles.chipSpacer} />
          <View className="w-5 items-center">
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </View>
        </>
      )}
    </Pressable>
  )
}

function ChipRollup({ rollup }: { rollup: MobilePrChipRollup }) {
  const colors = statusColorClasses(rollup.token)
  return (
    <View className="flex-row items-center gap-1">
      <RollupIcon kind={rollup.kind} colorClassName={colors.accent} />
      <Text className={cn('text-xs font-semibold', colors.text)}>{rollup.text}</Text>
    </View>
  )
}

function RollupIcon({
  kind,
  colorClassName
}: {
  kind: MobilePrChipRollup['kind']
  colorClassName: string
}) {
  const size = 13

  switch (kind) {
    case 'conflict':
      return <AlertTriangle size={size} colorClassName={colorClassName} />
    case 'failing':
      return <X size={size} colorClassName={colorClassName} />
    case 'running':
      return <CircleDot size={size} colorClassName={colorClassName} />
    case 'passed':
      return <Check size={size} colorClassName={colorClassName} />
    case 'none':
      return null
  }
}

function chipAccessibilityLabel(summary: MobilePrChipSummary): string {
  switch (summary.kind) {
    case 'loading':
      return 'Loading pull request'
    case 'none':
      return 'Create pull request'
    case 'unavailable':
      return `Pull request unavailable: ${summary.message}`
    case 'ready': {
      const comments =
        summary.commentCount != null && summary.commentCount > 0
          ? `, ${summary.commentCount} unresolved comments`
          : ''
      return `Pull request #${summary.number}, ${summary.stateLabel}, ${summary.rollup.text}${comments}. Open pull request.`
    }
  }
}
