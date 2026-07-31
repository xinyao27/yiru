import { Text, View } from 'react-native'

import { GitMerge } from '~/components/uniwind-icons'

import { MobileGlassTextButton } from '../components/glass/text-button'
import { mobileConflictAbortLabel } from './conflict-abort'
import { MobileSourceControlPrChip } from './pr-chip'
import type { MobilePrChipSummary } from './pr-chip-summary'
import { styles } from './styles'

type Props = {
  branchLabel: string
  syncLabel: string | null
  unstagedCount: number
  stagedCount: number
  branchCount: number
  conflictOperation: string | null
  // True while any serial git IO is in flight — disables Abort so ops don't race.
  conflictBusy: boolean
  // True only while abort-merge / abort-rebase itself is running (label accuracy).
  conflictAborting: boolean
  onAbortConflict: (operation: string) => void
  // The PR chip is shown only on repos with a hosted-review remote; null hides it.
  prChip: MobilePrChipSummary | null
  onOpenPr: () => void
}

// Persistent card at the top of every hub segment: branch identity, sync/counts,
// conflict state, and the PR chip. Shared so PR/History see the same status the
// Changes lens does without re-deriving it.
export function MobileSourceControlBranchCard({
  branchLabel,
  syncLabel,
  unstagedCount,
  stagedCount,
  branchCount,
  conflictOperation,
  conflictBusy,
  conflictAborting,
  onAbortConflict,
  prChip,
  onOpenPr
}: Props) {
  const showConflict = conflictOperation !== null && conflictOperation !== 'unknown'
  return (
    <View className="mx-4 mt-3 mb-2 p-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-1">
          <GitMerge size={15} colorClassName="accent-muted-foreground" />
          <Text className="text-foreground flex-1 text-sm" numberOfLines={1}>
            {branchLabel}
          </Text>
        </View>
        {syncLabel ? <Text className="text-muted-foreground text-xs">{syncLabel}</Text> : null}
      </View>
      <View className="mt-2 flex-row flex-wrap gap-3">
        <Text className={styles.countText}>{unstagedCount} changed</Text>
        <Text className={styles.countText}>{stagedCount} staged</Text>
        {branchCount > 0 ? <Text className={styles.countText}>{branchCount} on branch</Text> : null}
      </View>
      {/* Own row so Abort never overflows past the card when counts are long. */}
      {showConflict ? (
        <View className="mt-2 max-w-full flex-row flex-wrap items-center gap-2 self-start">
          <Text className="text-xs text-amber-500 capitalize">{conflictOperation}</Text>
          {conflictOperation === 'merge' || conflictOperation === 'rebase' ? (
            <MobileGlassTextButton
              className="shrink-0"
              disabled={conflictBusy}
              isDestructive
              label={mobileConflictAbortLabel(conflictOperation, conflictAborting)}
              onPress={() => onAbortConflict(conflictOperation)}
              size="small"
            />
          ) : null}
        </View>
      ) : null}
      {prChip ? <MobileSourceControlPrChip summary={prChip} onPress={onOpenPr} /> : null}
    </View>
  )
}
