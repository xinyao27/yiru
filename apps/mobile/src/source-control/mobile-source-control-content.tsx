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
import { MobileCommitFailurePanel } from './mobile-commit-failure-panel'
import { MobileSourceControlCreatePrEntry } from './mobile-source-control-create-pr-entry'
import { makeRenderFileRow, BranchCompareFooter } from './mobile-source-control-file-rows'
import { hubStyles } from './mobile-source-control-hub-styles'
import { KEYBOARD_COMMIT_BAR_CLEARANCE } from './mobile-source-control-screen-state'
import { styles } from './mobile-source-control-styles'
import type { MobileSourceControlState } from './use-mobile-source-control-state'

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
        <View className={styles.reconnectBanner}>
          <ActivityIndicator size="small" colorClassName="accent-amber-500" />
          <Text className={styles.reconnectBannerText}>Reconnecting to desktop...</Text>
        </View>
      ) : null}
      <View className={hubStyles.changesControls}>
        {commitFailureRecovery ? (
          <MobileCommitFailurePanel
            failure={commitFailureRecovery}
            action={commitFailureRecoveryAction}
          />
        ) : actionError ? (
          <View className={styles.actionError}>
            <Text className={styles.actionErrorText} numberOfLines={2}>
              {actionError}
            </Text>
          </View>
        ) : null}
        <MobileSourceControlCreatePrEntry action={createPrAction} />
        <View className={styles.bulkRow}>
          <Pressable
            className={cn(
              styles.bulkButton,
              (stageablePaths.length === 0 || ioBusy) && styles.bulkButtonDisabled,
              'active:opacity-[0.75]'
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
              'active:opacity-[0.75]'
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
              styles.bulkMenuButton,
              'active:opacity-[0.75]',
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
        className={styles.commitBar}
        style={[
          {
            bottom: keyboardLift > 0 ? keyboardLift + KEYBOARD_COMMIT_BAR_CLEARANCE : keyboardLift,
            paddingBottom: keyboardLift > 0 ? spacing.md : spacing.md + insets.bottom
          }
        ]}
      >
        <View className={styles.commitRow}>
          {stagedCount === 0 ? (
            <View
              className={cn(styles.commitInput, styles.commitInputDisabled)}
              accessibilityRole="text"
              accessibilityState={{ disabled: true }}
              accessibilityLabel="Commit message disabled. No staged files."
            >
              <Text className={styles.commitInputDisabledText}>No staged files</Text>
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
                styles.generateButton,
                busyAction !== null && styles.commitButtonDisabled,
                'active:opacity-[0.75]'
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
              styles.commitButton,
              createPrHeroActive && styles.commitButtonSecondary,
              primaryAction.disabled && styles.commitButtonDisabled,
              'active:opacity-[0.75]'
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
                  styles.commitButtonText,
                  createPrHeroActive && styles.commitButtonSecondaryText
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
