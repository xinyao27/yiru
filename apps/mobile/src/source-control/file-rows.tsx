import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { SectionListRenderItem } from 'react-native'

import {
  CaretRight as ChevronRight,
  Minus,
  Plus,
  Trash as Trash2
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { formatMobileBranchEntryMeta } from './branch-entry-format'
import { MOBILE_GIT_STATUS_LABELS, type MobileSourceControlSection } from './git-status'
import { statusColorClassName, type MobileGitStatusEntryView } from './screen-state'
import { styles } from './styles'
import type { MobileSourceControlState } from './use-source-control-state'

type RowState = Pick<
  MobileSourceControlState,
  | 'busyAction'
  | 'openingPath'
  | 'openingBranchPath'
  | 'openFile'
  | 'runGitAction'
  | 'setDiscardTarget'
>

export function makeRenderFileRow(
  state: RowState
): SectionListRenderItem<
  MobileGitStatusEntryView,
  MobileSourceControlSection<MobileGitStatusEntryView>
> {
  const { busyAction, openingPath, openingBranchPath, openFile, runGitAction, setDiscardTarget } =
    state
  return function FileRow({ item }) {
    const rowBusy =
      busyAction === item.stageActionId ||
      busyAction === item.unstageActionId ||
      busyAction === item.discardActionId ||
      openingPath === item.path
    const rowDisabled =
      !item.canOpen || busyAction !== null || openingPath !== null || openingBranchPath !== null
    const ioBusy = busyAction !== null || openingPath !== null || openingBranchPath !== null
    const hasInlineActions = item.area === 'staged' || item.canStage || item.canDiscard
    return (
      <Pressable
        className={cn(
          styles.fileRow,
          item.canOpen && 'active:bg-accent',
          rowDisabled && styles.fileRowDisabled,
          !item.canOpen && styles.fileRowUnavailable
        )}
        onPress={() => void openFile(item)}
        disabled={rowDisabled}
        accessibilityLabel={`Open changed file ${item.path}`}
      >
        <View className={styles.statusBadge}>
          <Text className={cn(styles.statusBadgeText, statusColorClassName(item.status))}>
            {MOBILE_GIT_STATUS_LABELS[item.status]}
          </Text>
        </View>
        <View className={styles.fileTextBlock}>
          <Text
            className={cn(styles.filePath, !item.canOpen && styles.filePathDisabled)}
            numberOfLines={1}
          >
            {item.path}
          </Text>
          {item.oldPath ? (
            <Text className={styles.fileMeta} numberOfLines={1}>
              from {item.oldPath}
            </Text>
          ) : item.conflictStatus === 'unresolved' ? (
            <Text className={styles.fileMeta} numberOfLines={1}>
              Unresolved conflict
            </Text>
          ) : null}
        </View>
        {rowBusy ? (
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        ) : item.area === 'staged' ? (
          <Pressable
            className={cn(
              styles.iconButton,
              ioBusy && styles.iconButtonDisabled,
              'active:bg-accent'
            )}
            disabled={ioBusy}
            onPress={() =>
              void runGitAction(item.unstageActionId, 'git.unstage', { filePath: item.path })
            }
            hitSlop={8}
            accessibilityLabel={`Unstage ${item.path}`}
          >
            <Minus size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
        ) : item.canStage || item.canDiscard ? (
          <View className="flex-row items-center gap-1">
            {item.canStage ? (
              <Pressable
                className={cn(
                  styles.iconButton,
                  ioBusy && styles.iconButtonDisabled,
                  'active:bg-accent'
                )}
                disabled={ioBusy}
                onPress={() =>
                  void runGitAction(item.stageActionId, 'git.stage', { filePath: item.path })
                }
                hitSlop={8}
                accessibilityLabel={`Stage ${item.path}`}
              >
                <Plus size={16} colorClassName="accent-muted-foreground" />
              </Pressable>
            ) : null}
            {item.canDiscard ? (
              <Pressable
                className={cn(
                  styles.iconButton,
                  ioBusy && styles.iconButtonDisabled,
                  'active:bg-accent'
                )}
                disabled={ioBusy}
                onPress={() => setDiscardTarget(item)}
                hitSlop={8}
                accessibilityLabel={`Discard ${item.path}`}
              >
                <Trash2 size={16} colorClassName="accent-destructive" />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {!rowBusy && item.canOpen && !hasInlineActions ? (
          <ChevronRight size={16} colorClassName="accent-muted-foreground" />
        ) : null}
      </Pressable>
    )
  }
}

type FooterState = Pick<
  MobileSourceControlState,
  | 'shouldShowBranchCompareSection'
  | 'branchCompareSummaryText'
  | 'branchEntries'
  | 'branchCompareState'
  | 'branchCompareResult'
  | 'busyAction'
  | 'openBranchDiff'
  | 'openingBranchPath'
  | 'openingPath'
>

export function BranchCompareFooter({ state }: { state: FooterState }) {
  const {
    shouldShowBranchCompareSection,
    branchCompareSummaryText,
    branchEntries,
    branchCompareState,
    branchCompareResult,
    busyAction,
    openBranchDiff,
    openingBranchPath,
    openingPath
  } = state
  if (!shouldShowBranchCompareSection) {
    return null
  }

  return (
    <View className="pb-2">
      <View className={styles.sectionHeader}>
        <View className="min-w-0 flex-1">
          <Text className={styles.sectionTitle}>Committed on Branch</Text>
          {branchCompareSummaryText ? (
            <Text className="text-muted-foreground mt-0.5 text-xs" numberOfLines={1}>
              {branchCompareSummaryText}
            </Text>
          ) : null}
        </View>
        <Text className={styles.sectionCount}>{branchEntries.length}</Text>
      </View>
      {branchCompareState.kind === 'loading' ? (
        <View className={styles.branchStateRow}>
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
          <Text className={styles.branchStateText}>Loading committed changes...</Text>
        </View>
      ) : branchCompareState.kind === 'error' ? (
        <View className={styles.branchStateRow}>
          <Text className={styles.branchStateText}>{branchCompareState.message}</Text>
        </View>
      ) : branchCompareResult && branchCompareResult.summary.status !== 'ready' ? (
        <View className={styles.branchStateRow}>
          <Text className={styles.branchStateText}>
            {branchCompareResult.summary.errorMessage ?? 'Committed changes unavailable.'}
          </Text>
        </View>
      ) : (
        branchEntries.map((entry) => {
          const rowBusy = openingBranchPath === entry.path
          const rowDisabled =
            !entry.canOpen ||
            busyAction !== null ||
            openingPath !== null ||
            openingBranchPath !== null
          const meta = formatMobileBranchEntryMeta(entry)
          return (
            <Pressable
              key={`${entry.path}:${entry.oldPath ?? ''}`}
              className={cn(
                styles.fileRow,
                entry.canOpen && 'active:bg-accent',
                rowDisabled && styles.fileRowDisabled,
                !entry.canOpen && styles.fileRowUnavailable
              )}
              onPress={() => void openBranchDiff(entry)}
              disabled={rowDisabled}
              accessibilityLabel={`Open committed change ${entry.path}`}
            >
              <View className={styles.statusBadge}>
                <Text className={cn(styles.statusBadgeText, statusColorClassName(entry.status))}>
                  {MOBILE_GIT_STATUS_LABELS[entry.status]}
                </Text>
              </View>
              <View className={styles.fileTextBlock}>
                <Text
                  className={cn(styles.filePath, !entry.canOpen && styles.filePathDisabled)}
                  numberOfLines={1}
                >
                  {entry.path}
                </Text>
                {meta ? (
                  <Text className={styles.fileMeta} numberOfLines={1}>
                    {meta}
                  </Text>
                ) : null}
              </View>
              {rowBusy ? (
                <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
              ) : entry.canOpen ? (
                <ChevronRight size={16} colorClassName="accent-muted-foreground" />
              ) : null}
            </Pressable>
          )
        })
      )}
    </View>
  )
}
