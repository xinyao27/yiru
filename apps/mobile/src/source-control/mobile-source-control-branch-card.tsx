import { Pressable, Text, View } from 'react-native'

import { GitMerge } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { MobilePrChipSummary } from './mobile-pr-chip-summary'
import { mobileConflictAbortLabel } from './mobile-source-control-conflict-abort'
import { MobileSourceControlPrChip } from './mobile-source-control-pr-chip'
import { styles } from './mobile-source-control-styles'

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
    <View className={styles.summaryCard}>
      <View className={styles.summaryHeader}>
        <View className={styles.branchLine}>
          <GitMerge size={15} colorClassName="accent-muted-foreground" />
          <Text className={styles.branchText} numberOfLines={1}>
            {branchLabel}
          </Text>
        </View>
        {syncLabel ? <Text className={styles.syncText}>{syncLabel}</Text> : null}
      </View>
      <View className={styles.countRow}>
        <Text className={styles.countText}>{unstagedCount} changed</Text>
        <Text className={styles.countText}>{stagedCount} staged</Text>
        {branchCount > 0 ? <Text className={styles.countText}>{branchCount} on branch</Text> : null}
      </View>
      {/* Own row so Abort never overflows past the card when counts are long. */}
      {showConflict ? (
        <View className={styles.conflictRow}>
          <Text className={styles.conflictText}>{conflictOperation}</Text>
          {conflictOperation === 'merge' || conflictOperation === 'rebase' ? (
            <Pressable
              className={cn(
                styles.abortButton,
                conflictBusy && styles.abortButtonDisabled,
                !conflictBusy && 'active:opacity-[0.75]'
              )}
              disabled={conflictBusy}
              onPress={() => onAbortConflict(conflictOperation)}
            >
              <Text className={styles.abortText}>
                {mobileConflictAbortLabel(conflictOperation, conflictAborting)}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {prChip ? <MobileSourceControlPrChip summary={prChip} onPress={onOpenPr} /> : null}
    </View>
  )
}
