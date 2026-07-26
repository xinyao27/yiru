import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View
} from 'react-native'

import {
  Minus,
  DotsThree as MoreHorizontal,
  Plus,
  Sparkle as Sparkles
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { spacing } from '../theme/uniwind-theme-values'
import { MobileCommitFailurePanel } from './commit-failure-panel'
import { MobileSourceControlCreatePrEntry } from './create-pr-entry'
import { makeRenderFileRow, BranchCompareFooter } from './file-rows'
import { hubStyles } from './hub-styles'
import { KEYBOARD_COMMIT_BAR_CLEARANCE } from './screen-state'
import { styles } from './styles'
import type { MobileSourceControlState } from './use-source-control-state'

type Props = {
  state: MobileSourceControlState
}

// Changes tab: local file changes only — uncommitted (staged/unstaged) plus
// committed-on-branch vs base. PR conflicts and push status live elsewhere.
export function MobileSourceControlContent({ state }: Props) {
  const {
    insets,
    connState,
    busyAction,
    commitMessage,
    setCommitMessage,
    generatingMessage,
    setShowActionSheet,
    setDiscardTarget,
    actionError,
    commitFailureRecovery,
    commitFailureRecoveryAction,
    keyboardLift,
    openingPath,
    openingBranchPath,
    sections,
    hasVisibleChanges,
    stageablePaths,
    unstageablePaths,
    stagedCount,
    primaryAction,
    createPrAction,
    stageAll,
    unstageAll,
    generateCommitMessage,
    cancelGenerateCommitMessage,
    openFile,
    openBranchDiff,
    runGitAction
  } = state
  const ioBusy = busyAction !== null || openingPath !== null || openingBranchPath !== null
  const shouldShowGenerateButton = stagedCount > 0 || generatingMessage
  const createPrHeroActive =
    createPrAction.visible && !createPrAction.disabled && !createPrAction.pushFirst
  const branchCompareFooter = (
    <BranchCompareFooter
      state={{
        shouldShowBranchCompareSection: state.shouldShowBranchCompareSection,
        branchCompareSummaryText: state.branchCompareSummaryText,
        branchEntries: state.branchEntries,
        branchCompareState: state.branchCompareState,
        branchCompareResult: state.branchCompareResult,
        busyAction,
        openBranchDiff,
        openingBranchPath,
        openingPath
      }}
    />
  )

  return (
    <>
      {connState !== 'connected' ? (
        // Why: once data has loaded the screen looks alive even when the
        // desktop link is down, so taps appear to do nothing (STA-1511).
        // Surface the reconnect state where the user is looking.
        <View className="bg-secondary border-hairline mx-4 mt-4 mb-[-8px] flex-row items-center gap-2 border-amber-500 px-3 py-2">
          <ActivityIndicator size="small" colorClassName="accent-amber-500" />
          <Text className="text-foreground text-xs">Reconnecting to desktop...</Text>
        </View>
      ) : null}
      <View className="mt-1 px-4">
        {commitFailureRecovery ? (
          <MobileCommitFailurePanel
            failure={commitFailureRecovery}
            action={commitFailureRecoveryAction}
          />
        ) : actionError ? (
          <View className="bg-secondary border-hairline border-destructive mt-2 px-3 py-2">
            <Text className="text-foreground text-xs leading-[16px]" numberOfLines={2}>
              {actionError}
            </Text>
          </View>
        ) : null}
        <MobileSourceControlCreatePrEntry action={createPrAction} />
        <View className="mt-3 flex-row gap-2">
          <Pressable
            className={cn(
              styles.bulkButton,
              (stageablePaths.length === 0 || ioBusy) && styles.bulkButtonDisabled,
              'active:bg-accent'
            )}
            onPress={() => void stageAll()}
            disabled={ioBusy || stageablePaths.length === 0}
          >
            {busyAction === 'stage-all' ? (
              <ActivityIndicator size="small" colorClassName="accent-foreground" />
            ) : (
              <Plus size={15} colorClassName="accent-foreground" />
            )}
            <Text className={styles.bulkButtonText}>Stage All</Text>
          </Pressable>
          <Pressable
            className={cn(
              styles.bulkButton,
              (unstageablePaths.length === 0 || ioBusy) && styles.bulkButtonDisabled,
              'active:bg-accent'
            )}
            onPress={() => void unstageAll()}
            disabled={ioBusy || unstageablePaths.length === 0}
          >
            {busyAction === 'unstage-all' ? (
              <ActivityIndicator size="small" colorClassName="accent-foreground" />
            ) : (
              <Minus size={15} colorClassName="accent-foreground" />
            )}
            <Text className={styles.bulkButtonText}>Unstage All</Text>
          </Pressable>
          <Pressable
            className={cn(
              'w-[42px] min-h-9 bg-secondary items-center justify-center',
              'active:bg-accent',
              ioBusy && styles.bulkButtonDisabled
            )}
            onPress={() => setShowActionSheet(true)}
            disabled={ioBusy}
            hitSlop={8}
            accessibilityLabel="Open source control actions"
          >
            <MoreHorizontal size={18} colorClassName="accent-foreground" />
          </Pressable>
        </View>
      </View>

      {!hasVisibleChanges ? (
        <View className={styles.state}>
          <Text className={styles.stateTitle}>No local changes</Text>
          <Text className={styles.stateText}>Working tree is clean.</Text>
        </View>
      ) : sections.length === 0 ? (
        // Why: RN SectionList with empty `sections` often skips ListFooterComponent,
        // which hid "Committed on Branch" when only branch files remain.
        <ScrollView className={hubStyles.tabBody} contentContainerClassName={styles.listContent}>
          {branchCompareFooter}
        </ScrollView>
      ) : (
        <SectionList
          className={hubStyles.tabBody}
          sections={sections}
          renderItem={makeRenderFileRow({
            busyAction,
            openingPath,
            openingBranchPath,
            openFile,
            runGitAction,
            setDiscardTarget
          })}
          keyExtractor={(item) => `${item.area}:${item.path}:${item.oldPath ?? ''}`}
          renderSectionHeader={({ section }) => (
            <View className={styles.sectionHeader}>
              <Text className={styles.sectionTitle}>{section.title}</Text>
              <Text className={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          ListFooterComponent={branchCompareFooter}
          stickySectionHeadersEnabled={false}
          contentContainerClassName={styles.listContent}
        />
      )}

      <View
        className="bg-card border-t-hairline border-t-border absolute right-0 left-0 gap-1 p-4 pt-3"
        style={[
          {
            bottom: keyboardLift > 0 ? keyboardLift + KEYBOARD_COMMIT_BAR_CLEARANCE : keyboardLift,
            paddingBottom: keyboardLift > 0 ? spacing.md : spacing.md + insets.bottom
          }
        ]}
      >
        <View className="flex-row gap-2">
          {stagedCount === 0 ? (
            <View
              className={cn(
                styles.commitInput,
                'bg-card border-border border-dashed items-center justify-center'
              )}
              accessibilityRole="text"
              accessibilityState={{ disabled: true }}
              accessibilityLabel="Commit message disabled. No staged files."
            >
              <Text className="text-muted-foreground/60 text-sm font-semibold">
                No staged files
              </Text>
            </View>
          ) : (
            <TextInput
              className={styles.commitInput}
              value={commitMessage}
              onChangeText={setCommitMessage}
              placeholder="Commit message"
              placeholderTextColorClassName="accent-muted-foreground"
              editable={busyAction === null && openingPath === null && openingBranchPath === null}
              returnKeyType="done"
              onSubmitEditing={primaryAction.onPress}
            />
          )}
          {shouldShowGenerateButton ? (
            <Pressable
              className={cn(
                'w-[42px] min-h-[42px] bg-secondary items-center justify-center',
                busyAction !== null && styles.commitButtonDisabled,
                'active:bg-accent'
              )}
              // Why: commit-message AI belongs to the commit path; hiding it
              // during Stage All keeps the quick action visually unambiguous.
              disabled={busyAction !== null}
              onPress={() =>
                generatingMessage ? cancelGenerateCommitMessage() : void generateCommitMessage()
              }
              accessibilityLabel={
                generatingMessage
                  ? 'Cancel commit message generation'
                  : 'Generate commit message with AI'
              }
            >
              {generatingMessage ? (
                <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
              ) : (
                <Sparkles size={16} colorClassName="accent-muted-foreground" />
              )}
            </Pressable>
          ) : null}
          <Pressable
            className={cn(
              'min-w-[88px] min-h-[42px] bg-primary items-center justify-center px-3',
              createPrHeroActive && 'bg-transparent border-hairline border-border',
              primaryAction.disabled && styles.commitButtonDisabled,
              'active:bg-accent'
            )}
            onPress={primaryAction.onPress}
            disabled={primaryAction.disabled}
            accessibilityLabel={primaryAction.accessibilityLabel}
            accessibilityHint={primaryAction.accessibilityHint}
          >
            {primaryAction.loading ? (
              <ActivityIndicator
                size="small"
                colorClassName={
                  createPrHeroActive ? 'accent-foreground' : 'accent-primary-foreground'
                }
              />
            ) : (
              <Text
                className={cn(
                  'text-primary-foreground text-sm font-bold',
                  createPrHeroActive && 'text-foreground'
                )}
              >
                {primaryAction.label}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </>
  )
}
