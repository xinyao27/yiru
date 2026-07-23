import { useCallback, useEffect, useState } from 'react'
import { Text, View, type LayoutChangeEvent } from 'react-native'

import { SafeAreaView, useSafeAreaInsets } from '@/components/uniwind-native-components'

import { useResponsiveLayout } from '../layout/responsive-layout'
import type { useMobileDiffReviewController } from '../session/use-mobile-diff-review-controller'
import { MobileDiffReviewBody } from './mobile-diff-review-body'
import { MobileDiffReviewDrawers } from './mobile-diff-review-drawers'
import { MobileDiffReviewFileSummary } from './mobile-diff-review-file-summary'
import { MobileDiffReviewFooter } from './mobile-diff-review-footer'
import { MobileDiffReviewHeader } from './mobile-diff-review-header'
import { mobileDiffReviewStyles as styles } from './mobile-diff-review-screen-styles'
import { MobilePRSidebar } from './mobile-pr-sidebar'
import { canDockPrSidebar, resolvePresentationMode } from './mobile-pr-sidebar-presentation'
import { mobilePrSidebarStyles, PR_SIDEBAR_DOCK_WIDTH } from './pr-sidebar/mobile-pr-sidebar-styles'
import { RightDrawer } from './right-drawer'

type Props = {
  controller: ReturnType<typeof useMobileDiffReviewController>
  onBack: () => void
}

export function MobileDiffReviewScreenView({ controller, onBack }: Props) {
  const { isWideLayout } = useResponsiveLayout()
  const insets = useSafeAreaInsets()
  const [contentRowWidth, setContentRowWidth] = useState(0)
  const canDockSidebar = canDockPrSidebar({
    isWideLayout,
    availableWidth: contentRowWidth,
    dockWidth: PR_SIDEBAR_DOCK_WIDTH
  })
  const presentationMode = resolvePresentationMode(isWideLayout, canDockSidebar)
  // Inline-dock the sidebar only when wide and the repo is GitHub; otherwise it
  // lives in the RightDrawer overlay toggled by showPRSidebar.
  const showInlineDock = presentationMode === 'inline' && controller.prSidebarIsGithubRepo
  const gitStatus = controller.screenState.kind === 'ready' ? controller.screenState.status : null

  // The docked sidebar has no trigger to tap, so load its PR data once it becomes
  // visible (the overlay loads on trigger press instead).
  const prSidebarKind = controller.prSidebarState.kind
  const loadPRSidebar = controller.refetchPRSidebar
  useEffect(() => {
    if (showInlineDock && prSidebarKind === 'hidden') {
      loadPRSidebar()
    }
  }, [showInlineDock, prSidebarKind, loadPRSidebar])

  const handleContentRowLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width)
    setContentRowWidth((prev) => (prev === width ? prev : width))
  }, [])

  return (
    <SafeAreaView className={styles.safeArea} edges={['top']}>
      <MobileDiffReviewHeader
        filter={controller.filter}
        isWideLayout={isWideLayout}
        prSidebarIsGithubRepo={controller.prSidebarIsGithubRepo}
        prSidebarCanDock={presentationMode === 'inline'}
        queueLength={controller.queue.length}
        reviewedCount={controller.reviewedCount}
        unsentCount={controller.unsentComments.length}
        worktreeLabel={controller.worktreeLabel}
        onBack={onBack}
        onOpenActions={() => controller.setShowOverflow(true)}
        onOpenPRSidebar={controller.openPRSidebar}
        onSelectFilter={controller.selectFilter}
      />
      <View className="flex-1 flex-row" onLayout={handleContentRowLayout}>
        {/* Diff column keeps its full layout; in wide mode the docked sidebar sits
            beside it and each column scrolls independently. */}
        <View className="min-w-0 flex-1">
          {controller.currentItem ? (
            <MobileDiffReviewFileSummary
              currentIndex={controller.currentIndex}
              diffState={controller.diffState}
              fileNotes={controller.fileNotes}
              filteredCount={controller.filteredQueue.length}
              item={controller.currentItem}
              staleCommentIds={controller.staleCommentIds}
              onEditNote={controller.openEditComposer}
              onJumpHunk={controller.jumpHunk}
            />
          ) : null}
          {controller.actionError ? (
            <View className={styles.actionError}>
              <Text className={styles.actionErrorText}>{controller.actionError}</Text>
            </View>
          ) : null}
          <MobileDiffReviewBody
            activeHunkIndex={controller.activeHunkIndex}
            commentsByLine={controller.commentsByLine}
            currentItem={controller.currentItem}
            diffState={controller.diffState}
            filteredCount={controller.filteredQueue.length}
            listRef={controller.listRef}
            screenState={controller.screenState}
            staleCommentIds={controller.staleCommentIds}
            onAddNote={controller.openComposer}
            onEditNote={controller.openEditComposer}
            onRetry={controller.retryAction}
          />
          {controller.currentItem ? (
            <MobileDiffReviewFooter
              busyAction={controller.busyAction}
              item={controller.currentItem}
              onAddFileNote={() => controller.openComposer(0)}
              onDiscard={controller.setDiscardTarget}
              onGitMutation={(method, item) => void controller.runGitMutation(method, item)}
              onMarkReviewed={() => void controller.markReviewed()}
              onMoveFile={controller.moveFile}
            />
          ) : null}
        </View>
        {showInlineDock ? (
          <View className={mobilePrSidebarStyles.dockColumn}>
            <MobilePRSidebar
              state={controller.prSidebarState}
              onRetry={controller.retryPRSidebar}
              refetch={controller.refetchPRSidebar}
              onSourceControlRefresh={controller.retryAction}
              client={controller.client}
              connState={controller.connState}
              worktreeId={controller.worktreeId}
              gitBranch={controller.prSidebarBranch}
              gitStatus={gitStatus}
              headSha={controller.prSidebarHeadSha}
              bottomInset={insets.bottom}
            />
          </View>
        ) : null}
      </View>
      <MobileDiffReviewDrawers controller={controller} />
      {presentationMode === 'overlay' ? (
        <RightDrawer
          visible={controller.showPRSidebar}
          onClose={() => controller.setShowPRSidebar(false)}
        >
          <MobilePRSidebar
            state={controller.prSidebarState}
            onRetry={controller.retryPRSidebar}
            refetch={controller.refetchPRSidebar}
            onSourceControlRefresh={controller.retryAction}
            client={controller.client}
            connState={controller.connState}
            worktreeId={controller.worktreeId}
            gitBranch={controller.prSidebarBranch}
            gitStatus={gitStatus}
            headSha={controller.prSidebarHeadSha}
          />
        </RightDrawer>
      ) : null}
    </SafeAreaView>
  )
}
