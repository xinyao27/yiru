import type { UpdateStatus } from '@yiru/runtime-protocol/workbench/types'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SYNC_FIT_PANES_EVENT } from '~renderer/constants/terminal'
import { LoadingIndicatorStyleProvider } from '~renderer/loading/indicator'
import { useRateLimitResumeDetector } from '~renderer/rate-limit-resume/detector'
import { useRateLimitResumeDispatch } from '~renderer/rate-limit-resume/use-rate-limit-resume-dispatch'
import { useRateLimitResumeNotifications } from '~renderer/rate-limit-resume/use-rate-limit-resume-notifications'
import { getWorkbenchLocation } from '~renderer/runtime/workbench-location'
import { Toaster } from '~renderer/ui/sonner'
import { TooltipProvider } from '~renderer/ui/tooltip'

import RetainedAgentsSyncGate from '../dashboard/retained-agents-sync-gate'
import { useEditorExternalWatch } from '../editor/use-editor-external-watch'
import {
  getSidePanelPresenceSnapshot,
  subscribeSidePanelPresence
} from '../extension/side-panel/presence'
import { useGitHubVisibilityRefresh } from '../github/use-visibility-refresh'
import { shouldShowOnboarding } from '../onboarding/should-show-onboarding'
import { WorkspacePortScanner } from '../ports/workspace-port-scanner'
import { useProjectCatalog } from '../project-catalog/provider'
import { isExtensionRenderer } from '../runtime/renderer-host'
import { useWebSessionTabsSync } from '../runtime/web-session/session'
import { SkillFreshnessNudge } from '../skills/skill-freshness-nudge'
import { useAppStore } from '../store/state'
import PinnedTabCloseDialog from '../terminal-pane/pinned-tab-close-dialog'
import { useSystemPrefersDark } from '../terminal-pane/use-system-prefers-dark'
import {
  hasRequestedBackgroundTerminalWorktreeMount,
  subscribeBackgroundTerminalWorktreeMountRequests
} from '../terminal/background-terminal-worktree-mount'
import { selectActiveTerminalChromeState } from '../terminal/state/chrome-selector'
import { useThemeGradientStyleVariables } from '../theme-gradient/style-variables'
import { ConfirmationDialogProvider } from '../ui/confirmation-dialog'
import { useGitStatusPolling } from '../workspace-panel/use-git-status-polling'
import { AgentHibernationGate } from './agent-hibernation-gate'
import { installRendererCommandToasts } from './command-result-toasts'
import { resolveMountedLazyModalIds, type LazyModalId } from './lazy-modal-mount-state'
import { resolveLeftSidebarStyleVariables } from './left-sidebar-appearance'
import { resolveShellChromeLayout } from './shell-chrome-layout'
import { ShellLateModals, ShellPrimaryModals } from './shell-modals'
import { ShellMiddleOverlays, ShellStatusBar, ShellTrailingOverlays } from './shell-status-overlays'
import { TitlebarLeftControls } from './titlebar-left-controls'
import { TitlebarMainStrip, WorkspaceProfileSwitcher } from './titlebar-main-strip'
import { useAppMenuPaste } from './use-app-menu-paste'
import { useAutoAckViewedAgent } from './use-auto-ack-viewed-agent'
import { useDocumentAppearance } from './use-document-appearance'
import { useFeatureTips } from './use-feature-tips'
import { useGlobalFileDrop } from './use-global-file-drop'
import { useGlobalShortcuts } from './use-global-shortcuts'
import { useIpcEvents } from './use-ipc-events'
import { useLargeTextControlPaste } from './use-large-text-control-paste'
import { usePersistedUi } from './use-persisted-ui'
import { usePrimarySelectionPaste } from './use-primary-selection-paste'
import { useRadixBodyPointerEventsRecovery } from './use-radix-body-pointer-events-recovery'
import { useRuntimeGraphSync } from './use-runtime-graph-sync'
import { useSessionPersistence } from './use-session-persistence'
import { useStartupHydration } from './use-startup-hydration'
import { useUnreadDockBadge } from './use-unread-dock-badge'
import { hasCustomTitleBar, hasNativeSidebarMaterial } from './window-chrome-environment'
import { WindowControls } from './window-controls'
import { WorkspaceShellLayout } from './workspace-shell-layout'
import { shouldShowWorktreeCreationSurface } from './worktree-creation-surface'

// Why: presentation must exist before any bootstrap action can publish a result,
// and it must not disappear during React remounts.
installRendererCommandToasts()

function shouldMountUpdateCardForStatus(status: UpdateStatus): boolean {
  if (status.state === 'idle') {
    return false
  }
  if (status.state === 'checking' || status.state === 'not-available') {
    return status.userInitiated === true
  }
  return true
}

function App(): React.JSX.Element {
  const isExtensionHost = isExtensionRenderer()
  const workbenchLocation = getWorkbenchLocation()
  const projectSurface = workbenchLocation.kind === 'project' ? workbenchLocation : null
  const projectCatalog = useProjectCatalog()
  const clearUnreadDockBadge = useUnreadDockBadge()
  useRadixBodyPointerEventsRecovery()
  useWebSessionTabsSync()
  const activeView = useAppStore((s) => s.activeView)
  const activeModal = useAppStore((s) => s.activeModal)
  const { activeWorktreeId } = useAppStore(useShallow(selectActiveTerminalChromeState))
  const activePendingCreationId = useAppStore((s) => s.activePendingCreationId)
  // Why: the creation surface owns the tab strip from the first pending frame.
  // Gating it on the delayed loader flag made the tab bar swap in mid-create.
  const activePendingCreationExists = useAppStore(
    (s) =>
      s.activePendingCreationId !== null &&
      s.pendingWorktreeCreations[s.activePendingCreationId] !== undefined
  )
  // Why: App swaps the sidebar between workspace and landing layouts when the
  // active workspace is slept/deleted. Keep virtualized scroll memory above
  // that remount so the left workspace list doesn't restart at scrollTop 0.
  const worktreeSidebarScrollOffsetRef = useRef(0)
  const workspaceSessionReady = useAppStore((s) => s.workspaceSessionReady)
  const backgroundTerminalMountRequested = useSyncExternalStore(
    subscribeBackgroundTerminalWorktreeMountRequests,
    hasRequestedBackgroundTerminalWorktreeMount,
    hasRequestedBackgroundTerminalWorktreeMount
  )
  const keybindings = useAppStore((s) => s.keybindings)
  const updateStatus = useAppStore((s) => s.updateStatus)
  const activeContextualTourId = useAppStore((s) => s.activeContextualTourId)
  const statusBarVisible = useAppStore((s) => s.statusBarVisible)
  const hasMountedTerminalWorkbenchRef = useRef(false)
  if (activeWorktreeId !== null || backgroundTerminalMountRequested) {
    hasMountedTerminalWorkbenchRef.current = true
  }
  // Why: skip the terminal bundle on the no-workspace landing path, but once a
  // workspace has mounted, keep Terminal-owned hidden panes alive through sleep
  // and shutdown transitions where activeWorktreeId can briefly become null.
  const shouldMountTerminalWorkbench =
    activeWorktreeId !== null ||
    backgroundTerminalMountRequested ||
    hasMountedTerminalWorkbenchRef.current
  // Why: visible worktree creation owns its faux tab strip from start to finish;
  // the previous workspace must stay mounted for retention without rendering
  // real chrome.
  const creationLayoutActive = shouldShowWorktreeCreationSurface({
    activeView,
    activePendingCreationId,
    hasActivePendingCreation: activePendingCreationExists
  })
  const workspaceChromeActive =
    activeView === 'terminal' && activeWorktreeId !== null && !creationLayoutActive
  const terminalWorkbenchVisible =
    activeView === 'terminal' && activeWorktreeId !== null && !creationLayoutActive
  const setAppRootNode = (node: HTMLDivElement | null): void => {
    // Why: these best-effort App chrome cleanups share the App root lifetime.
    if (!node) {
      clearUnreadDockBadge()
    }
  }

  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const extensionSidePanelOpen = useSyncExternalStore(
    subscribeSidePanelPresence,
    getSidePanelPresenceSnapshot,
    getSidePanelPresenceSnapshot
  )
  const groupBy = useAppStore((s) => s.groupBy)
  const sortBy = useAppStore((s) => s.sortBy)
  const projectOrderBy = useAppStore((s) => s.projectOrderBy)
  const showSleepingWorkspaces = useAppStore((s) => s.showSleepingWorkspaces)
  const hideDefaultBranchWorkspace = useAppStore((s) => s.hideDefaultBranchWorkspace)
  const showDotfilesByWorktree = useAppStore((s) => s.showDotfilesByWorktree)
  const filterRepoIds = useAppStore((s) => s.filterRepoIds)
  const acknowledgedAgentsByPaneKey = useAppStore((s) => s.acknowledgedAgentsByPaneKey)
  const persistedUIReady = useAppStore((s) => s.persistedUIReady)
  const shouldMountContextualTourOverlay = activeContextualTourId !== null
  const shouldMountSetupGuideTelemetryObserver = persistedUIReady
  const shouldMountUpdateCard = shouldMountUpdateCardForStatus(updateStatus)
  const rightSidebarWidth = useAppStore((s) => s.rightSidebarWidth)
  const markdownTocPanelWidth = useAppStore((s) => s.markdownTocPanelWidth)
  const rightSidebarOpen = useAppStore((s) => s.rightSidebarOpen)
  const rightSidebarTab = useAppStore((s) => s.rightSidebarTab)
  const rightSidebarExplorerView = useAppStore((s) => s.rightSidebarExplorerView)
  const isFullScreen = useAppStore((s) => s.isFullScreen)
  const settings = useAppStore((s) => s.settings)
  const systemPrefersDark = useSystemPrefersDark()
  const [startupWindowBackgroundBlur, setStartupWindowBackgroundBlur] = useState<boolean | null>(
    null
  )
  useEffect(() => {
    if (settings !== null && startupWindowBackgroundBlur === null) {
      // Why: BrowserWindow material is fixed at creation, so renderer opacity
      // must keep using the first hydrated value until the requested restart.
      setStartupWindowBackgroundBlur(settings.windowBackgroundBlur === true)
    }
  }, [settings, startupWindowBackgroundBlur])
  const windowBackgroundBlurEnabled =
    hasNativeSidebarMaterial && startupWindowBackgroundBlur === true
  const leftSidebarVariables = (() =>
    resolveLeftSidebarStyleVariables(settings, systemPrefersDark, hasNativeSidebarMaterial))()
  const leftSidebarStyle = leftSidebarVariables as React.CSSProperties | undefined
  const themeGradientVariables = useThemeGradientStyleVariables(systemPrefersDark)
  usePrimarySelectionPaste()
  useAppMenuPaste()
  useLargeTextControlPaste()
  const titlebarLeftControlsRef = useRef<HTMLDivElement | null>(null)
  const [collapsedSidebarHeaderWidth, setCollapsedSidebarHeaderWidth] = useState(0)
  const [mountedLazyModalIds, setMountedLazyModalIds] = useState<Set<LazyModalId>>(() => new Set())
  const [shouldMountAddRepoDialog, setShouldMountAddRepoDialog] = useState(false)
  const { onboarding, onboardingLoaded, setOnboarding } = useStartupHydration(
    projectCatalog.isPending,
    projectCatalog.repos
  )
  const unmountAddRepoDialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldRenderOnboarding = onboarding !== null && shouldShowOnboarding(onboarding)

  useEffect(() => {
    if (activeModal === 'add-repo') {
      if (unmountAddRepoDialogTimerRef.current) {
        clearTimeout(unmountAddRepoDialogTimerRef.current)
        unmountAddRepoDialogTimerRef.current = null
      }
      setShouldMountAddRepoDialog(true)
      return
    }
    if (shouldMountAddRepoDialog && !unmountAddRepoDialogTimerRef.current) {
      // Why: AddRepoDialog's close effect aborts in-flight clone/nested work.
      // Keep one closed render, then remove hidden SSH/remote subscriptions.
      unmountAddRepoDialogTimerRef.current = setTimeout(() => {
        setShouldMountAddRepoDialog(false)
        unmountAddRepoDialogTimerRef.current = null
      }, 0)
    }
    return () => {
      if (unmountAddRepoDialogTimerRef.current) {
        clearTimeout(unmountAddRepoDialogTimerRef.current)
        unmountAddRepoDialogTimerRef.current = null
      }
    }
  }, [activeModal, shouldMountAddRepoDialog])

  // Subscribe to IPC push events
  useIpcEvents()
  // Why: both watch every agent pane, so they must run above any pane subtree
  // that unmounts when the user switches tabs. Neither subscribes reactively —
  // the detector uses a plain store listener — so App does not re-render on
  // pane churn.
  useRateLimitResumeDetector()
  useRateLimitResumeDispatch()
  useRateLimitResumeNotifications()
  // Why: retention must run at App level so the inline per-card agents list
  // always sees retained entries. If retention ran inside the sidebar-card
  // subtree, "done" agents would vanish any time the user collapsed a card's
  // inline agents section. The retention hooks are hosted inside
  // <RetainedAgentsSyncGate /> (a leaf component that renders null) rather
  // than being called inline here so its high-churn store subscriptions
  // (agentStatusByPaneKey ticks at PTY event frequency)
  // do not re-render the App tree on every agent status update.
  // Why: git conflict-operation state also drives the worktree cards. Polling
  // cannot live under an individual workspace-panel tab because those tabs
  // mount on demand, which would leave worktree badges stale until opened.
  // Why: visible-window polling runs immediately on mount. Wait until the
  // workspace session has hydrated so git status work cannot compete with the
  // first window becoming usable.
  useGitStatusPolling({ enabled: workspaceSessionReady })
  // Why: the editor must hear external filesystem changes regardless of
  // which workspace-panel tab is visible (Explorer unmounts when the user
  // switches between Changes and Review). Wiring this at App level mirrors
  // VSCode's workbench-scoped `TextFileEditorModelManager`, which reloads
  // clean models from a single always-on file-change subscription instead
  // of tying reloads to the Explorer UI lifecycle.
  useEditorExternalWatch()
  useGlobalFileDrop()
  useAutoAckViewedAgent()
  useRuntimeGraphSync(workspaceSessionReady)
  useSessionPersistence()
  usePersistedUi({
    acknowledgedAgentsByPaneKey,
    activeView,
    filterRepoIds,
    groupBy,
    hideDefaultBranchWorkspace,
    markdownTocPanelWidth,
    persistedUIReady,
    projectOrderBy,
    rightSidebarExplorerView,
    rightSidebarOpen,
    rightSidebarTab,
    rightSidebarWidth,
    showDotfilesByWorktree,
    showSleepingWorkspaces,
    sidebarWidth,
    sortBy
  })
  useDocumentAppearance(settings)
  useGitHubVisibilityRefresh()
  useFeatureTips({
    activeModal,
    onboarding,
    onboardingLoaded,
    persistedUIReady,
    settings
  })

  // Why: sidebar open/close flips width instantaneously. useLayoutEffect
  // runs synchronously after React commits the DOM but before paint, so
  // dispatching SYNC_FIT_PANES_EVENT here lets the terminal reflow in the
  // same frame as the width change — no "wrongly-sized terminal" transient
  // and no delayed snap. The later ResizeObserver rAF and 150ms debounced
  // fit both become no-ops because proposeDimensions() will match the
  // already-fitted cols/rows.
  useLayoutEffect(() => {
    window.dispatchEvent(new CustomEvent(SYNC_FIT_PANES_EVENT))
  }, [extensionSidePanelOpen, sidebarOpen])

  const {
    leftTitlebarChromeLayout,
    navigationSidebarOpen,
    settingsChromeOverlayActive,
    settingsNativeSidebarMaterialActive,
    showProfileSwitcherInTopRight,
    showSidebar,
    stackedPageOwnsTitlebar,
    stackedSidebarOpen
  } = resolveShellChromeLayout({
    activeView,
    creationLayoutActive,
    extensionSidePanelOpen,
    hasNativeSidebarMaterial,
    isExtensionHost,
    sidebarOpen,
    workspaceChromeActive
  })

  useGlobalShortcuts({
    activeView,
    activeWorktreeId,
    creationLayoutActive,
    keybindings,
    terminalShortcutPolicy: settings?.terminalShortcutPolicy,
    workspaceChromeActive
  })
  useLayoutEffect(() => {
    const controls = titlebarLeftControlsRef.current
    if (!controls) {
      return
    }

    const updateWidth = (): void => {
      setCollapsedSidebarHeaderWidth(controls.getBoundingClientRect().width)
    }

    updateWidth()
    const observer = new ResizeObserver(() => {
      updateWidth()
    })
    observer.observe(controls)
    return () => observer.disconnect()
  }, [isFullScreen, showSidebar, leftTitlebarChromeLayout.isFloating, navigationSidebarOpen])

  const resolvedMountedLazyModalIds = resolveMountedLazyModalIds(activeModal, mountedLazyModalIds)
  if (resolvedMountedLazyModalIds !== mountedLazyModalIds) {
    // Why: lazy-load these modals only after first use, then keep them mounted
    // so repeat opens preserve their local state and avoid re-fetch flashes.
    setMountedLazyModalIds(new Set(resolvedMountedLazyModalIds))
  }

  const titlebarLeftControls = isExtensionHost ? null : (
    <TitlebarLeftControls
      activeView={activeView}
      controlsRef={titlebarLeftControlsRef}
      isFullScreen={isFullScreen}
      layout={leftTitlebarChromeLayout}
      showSidebar={showSidebar}
      sidebarOpen={navigationSidebarOpen}
    />
  )
  const titlebarMainStrip = isExtensionHost ? null : (
    <TitlebarMainStrip
      creationLayoutActive={creationLayoutActive}
      showProfileSwitcher={showProfileSwitcherInTopRight}
      workspaceChromeActive={workspaceChromeActive}
    />
  )
  const workspaceProfileSwitcher = isExtensionHost ? null : (
    <WorkspaceProfileSwitcher
      layout={leftTitlebarChromeLayout}
      showProfileSwitcher={showProfileSwitcherInTopRight}
      stackedSidebarOpen={stackedSidebarOpen}
      workspaceChromeActive={workspaceChromeActive}
    />
  )
  return (
    <LoadingIndicatorStyleProvider
      loaderStyle={settings?.loaderStyle}
      ref={setAppRootNode}
      className="flex h-dvh w-screen flex-col overflow-hidden"
      data-native-sidebar-material={hasNativeSidebarMaterial ? 'true' : undefined}
      data-theme-gradient={themeGradientVariables ? 'on' : undefined}
      style={
        {
          ...themeGradientVariables,
          '--collapsed-sidebar-header-width': `${
            !isExtensionHost && showSidebar ? collapsedSidebarHeaderWidth : 0
          }px`,
          // Why: Settings renders its overlaid window controls and navigation in
          // sibling trees; one seam value keeps their left-column widths aligned.
          '--settings-sidebar-width': '280px',
          // Why: consumed by anything that needs to avoid the fixed-position
          // window-controls overlay on Windows/Linux (floating sidebar toggle,
          // right sidebar header, etc.) without hardcoding 138px in multiple
          // places.
          '--window-controls-width': hasCustomTitleBar ? '138px' : '0px',
          // Why: consumed by the side-position activity bar to push icons below
          // the fixed-position window-controls overlay on Windows/Linux.
          '--window-controls-height': hasCustomTitleBar ? 'var(--titlebar-height)' : '0px'
        } as React.CSSProperties
      }
    >
      <TooltipProvider>
        <ConfirmationDialogProvider>
          <>
            <WorkspacePortScanner enabled={workspaceSessionReady} />
            {/* Why: leaf-mounted retention sync keeps agent-status retention
            subscriptions from re-rendering the App tree. */}
            <RetainedAgentsSyncGate />
            <AgentHibernationGate />
            {/* Why: workspace activation is a hot path; including activeWorktreeId
            in reset keys remounts whole surfaces during wake. */}
            <WorkspaceShellLayout
              activePendingCreationId={activePendingCreationId}
              activeView={activeView}
              activeWorktreeId={activeWorktreeId}
              appearanceStyle={leftSidebarStyle}
              creationLayoutActive={creationLayoutActive}
              layout={leftTitlebarChromeLayout}
              projectId={projectSurface?.projectId}
              settingsChromeOverlayActive={settingsChromeOverlayActive}
              settingsNativeSidebarMaterialActive={settingsNativeSidebarMaterialActive}
              shouldMountTerminalWorkbench={shouldMountTerminalWorkbench}
              showSidebar={showSidebar}
              sidebarOpen={navigationSidebarOpen}
              stackedPageOwnsTitlebar={stackedPageOwnsTitlebar}
              stackedSidebarOpen={stackedSidebarOpen}
              terminalWorkbenchVisible={terminalWorkbenchVisible}
              titlebarLeftControls={titlebarLeftControls}
              titlebarMainStrip={titlebarMainStrip}
              windowBackgroundBlurEnabled={windowBackgroundBlurEnabled}
              workspaceChromeActive={workspaceChromeActive}
              workspaceProfileSwitcher={workspaceProfileSwitcher}
              worktreeScrollOffsetRef={worktreeSidebarScrollOffsetRef}
            />
            <ShellStatusBar activeView={activeView} isVisible={statusBarVisible} />
            <ShellPrimaryModals
              activeModal={activeModal}
              mountedLazyModalIds={resolvedMountedLazyModalIds}
              shouldMountAddRepoDialog={shouldMountAddRepoDialog}
              shouldMountSetupGuideTelemetryObserver={shouldMountSetupGuideTelemetryObserver}
            />
            <ShellMiddleOverlays
              activeView={activeView}
              shouldMountContextualTourOverlay={shouldMountContextualTourOverlay}
              shouldMountUpdateCard={shouldMountUpdateCard}
              telemetryOptedIn={settings?.telemetry?.optedIn ?? undefined}
            />
            <ShellLateModals
              activeModal={activeModal}
              onboarding={onboarding}
              setOnboarding={setOnboarding}
              shouldRenderOnboarding={shouldRenderOnboarding}
            />
            <ShellTrailingOverlays activeView={activeView} />
          </>
        </ConfirmationDialogProvider>
      </TooltipProvider>
      <Toaster
        theme={settings?.theme ?? 'system'}
        closeButton
        toastOptions={{ className: 'font-sans text-sm' }}
      />
      <SkillFreshnessNudge />
      <PinnedTabCloseDialog />
      {/* Why: rendered last so it sits after all -webkit-app-region:drag elements
          in DOM order. Electron's hit-test for drag regions is DOM-order-based and
          ignores z-index — placing WindowControls earlier caused the drag region to
          win, making the buttons unclickable. */}
      {hasCustomTitleBar && <WindowControls />}
    </LoadingIndicatorStyleProvider>
  )
}

export default App
