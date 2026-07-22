import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import {
  Warning as AlertTriangle,
  Check,
  CaretRight as ChevronRight,
  RadioButton as CircleDot,
  GitPullRequest,
  Chat as MessageSquare,
  X
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { statusColorClasses } from '../components/pr-sidebar/pr-sidebar-status-color'
import type { MobilePrChipRollup, MobilePrChipSummary } from './mobile-pr-chip-summary'
import { hubStyles } from './mobile-source-control-hub-styles'

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
      className={cn(hubStyles.chip, hubStyles.chipPressedActive)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={chipAccessibilityLabel(summary)}
    >
      <View className={hubStyles.chipIcon}>
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
          <Text className={hubStyles.chipCreateText}>Create pull request</Text>
          <View className={hubStyles.chipSpacer} />
          <ChevronRight size={16} colorClassName="accent-muted-foreground" />
        </>
      ) : summary.kind === 'unavailable' ? (
        <>
          <Text className={hubStyles.chipMutedText} numberOfLines={1}>
            {summary.message}
          </Text>
          <ChevronRight size={16} colorClassName="accent-muted-foreground" />
        </>
      ) : (
        <>
          <Text className={hubStyles.chipNumber}>#{summary.number}</Text>
          <View className={cn(hubStyles.statePill, stateColors?.border)}>
            <Text className={cn(hubStyles.statePillText, stateColors?.text)}>
              {summary.stateLabel}
            </Text>
          </View>
          <ChipRollup rollup={summary.rollup} />
          {summary.commentCount != null && summary.commentCount > 0 ? (
            <View className={hubStyles.comment}>
              <MessageSquare size={13} colorClassName="accent-muted-foreground" />
              <Text className={hubStyles.commentText}>{summary.commentCount}</Text>
            </View>
          ) : null}
          <View className={hubStyles.chipSpacer} />
          <ChevronRight size={16} colorClassName="accent-muted-foreground" />
        </>
      )}
    </Pressable>
  )
}

function ChipRollup({ rollup }: { rollup: MobilePrChipRollup }) {
  const colors = statusColorClasses(rollup.token)
  return (
    <View className={hubStyles.rollup}>
      <RollupIcon kind={rollup.kind} colorClassName={colors.accent} />
      <Text className={cn(hubStyles.rollupText, colors.text)}>{rollup.text}</Text>
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
