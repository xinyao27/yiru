import { Stack, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Platform, Text, View, type LayoutChangeEvent } from 'react-native'

import { MobileGlassIconButton } from '@/components/glass/icon-button'
import { useSafeAreaInsets } from '@/components/uniwind-native-components'

import { useResponsiveLayout } from '../layout/responsive-layout'
import type { useMobileDiffReviewController } from '../session/diff/use-review-controller'
import { MobileDiffReviewBody } from './diff-review-body'
import { MobileDiffReviewDrawers } from './diff-review-drawers'
import { MobileDiffReviewFileSummary } from './diff-review-file-summary'
import { MobileDiffReviewFooter } from './diff-review-footer'
import { MobileDiffReviewHeader } from './diff-review-header'
import { MobilePRSidebar } from './pr-sidebar'
import {
  canDockPrSidebar,
  resolvePresentationMode,
  shouldShowTrigger
} from './pr-sidebar-presentation'
import { mobilePrSidebarStyles, PR_SIDEBAR_DOCK_WIDTH } from './pr-sidebar/styles'
import { RightDrawer } from './right-drawer'

type Props = {
  controller: ReturnType<typeof useMobileDiffReviewController>
}

export function MobileDiffReviewScreenView({ controller }: Props) {
  const router = useRouter()
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
  const showPRTrigger = shouldShowTrigger({
    isGithubRepo: controller.prSidebarIsGithubRepo,
    isWideLayout,
    canDock: presentationMode === 'inline'
  })
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
    <View className="bg-background flex-1">
      <Stack.Screen
        options={{
          title: `Changes · ${controller.worktreeLabel}`,
          headerLeft:
            Platform.OS === 'ios'
              ? undefined
              : () => (
                  <MobileGlassIconButton
                    accessibilityLabel="Back"
                    icon="back"
                    onPress={() => router.back()}
                  />
                ),
          headerRight:
            Platform.OS === 'ios'
              ? undefined
              : () => (
                  <View className="flex-row items-center gap-2">
                    {showPRTrigger ? (
                      <MobileGlassIconButton
                        accessibilityLabel="Open pull request review"
                        icon="checks"
                        onPress={controller.openPRSidebar}
                      />
                    ) : null}
                    <MobileGlassIconButton
                      accessibilityLabel="More review actions"
                      icon="more"
                      onPress={() => controller.setShowOverflow(true)}
                    />
                  </View>
                )
        }}
      />
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel="Back"
            icon="chevron.left"
            onPress={() => router.back()}
          />
        </Stack.Toolbar>
      ) : null}
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            accessibilityLabel="Open pull request sidebar"
            hidden={!showPRTrigger}
            icon="checklist"
            onPress={controller.openPRSidebar}
          />
          <Stack.Toolbar.Button
            accessibilityLabel="Open review actions"
            icon="ellipsis"
            onPress={() => controller.setShowOverflow(true)}
          />
        </Stack.Toolbar>
      ) : null}
      <MobileDiffReviewHeader
        filter={controller.filter}
        queueLength={controller.queue.length}
        reviewedCount={controller.reviewedCount}
        unsentCount={controller.unsentComments.length}
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
            <View className="border-hairline bg-secondary mx-4 mt-2 rounded-xl border-amber-500 px-3 py-2">
              <Text className="text-foreground text-xs">{controller.actionError}</Text>
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
    </View>
  )
}
