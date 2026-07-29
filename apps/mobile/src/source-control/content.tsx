import { ActivityIndicator, ScrollView, SectionList, Text, View } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { resolveCssNumber } from '@/style/resolve-css-variable'

import { MobileSourceControlBulkActions } from './bulk-actions'
import { MobileSourceControlCommitBar } from './commit-bar'
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
  const spacing3 = resolveCssNumber(useCSSVariable('--spacing-3'))
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
        <View className="border-hairline bg-secondary mx-4 mt-4 -mb-2 flex-row items-center gap-2 rounded-xl border-amber-500 px-3 py-2">
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
          <View className="border-hairline border-destructive bg-secondary mt-2 rounded-xl px-3 py-2">
            <Text className="text-foreground text-xs leading-4" numberOfLines={2}>
              {actionError}
            </Text>
          </View>
        ) : null}
        <MobileSourceControlCreatePrEntry action={createPrAction} />
        <MobileSourceControlBulkActions
          actionsDisabled={ioBusy}
          onMore={() => setShowActionSheet(true)}
          onStageAll={() => void stageAll()}
          onUnstageAll={() => void unstageAll()}
          stageDisabled={ioBusy || stageablePaths.length === 0}
          stageLoading={busyAction === 'stage-all'}
          unstageDisabled={ioBusy || unstageablePaths.length === 0}
          unstageLoading={busyAction === 'unstage-all'}
        />
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
        className="absolute right-0 left-0 px-3 pt-2"
        style={[
          {
            bottom: keyboardLift > 0 ? keyboardLift + KEYBOARD_COMMIT_BAR_CLEARANCE : keyboardLift,
            paddingBottom: keyboardLift > 0 ? spacing3 : spacing3 + insets.bottom
          }
        ]}
      >
        <MobileSourceControlCommitBar
          commitMessage={commitMessage}
          generateDisabled={busyAction !== null}
          generatingMessage={generatingMessage}
          hasStagedFiles={stagedCount > 0}
          inputDisabled={ioBusy}
          isCreatePrAction={createPrHeroActive}
          onChangeText={setCommitMessage}
          onGenerate={() =>
            generatingMessage ? cancelGenerateCommitMessage() : void generateCommitMessage()
          }
          onPrimaryAction={primaryAction.onPress}
          primaryAccessibilityHint={primaryAction.accessibilityHint}
          primaryAccessibilityLabel={primaryAction.accessibilityLabel}
          primaryDisabled={primaryAction.disabled}
          primaryLabel={primaryAction.label}
          primaryLoading={primaryAction.loading}
          showGenerateButton={shouldShowGenerateButton}
        />
      </View>
    </>
  )
}
