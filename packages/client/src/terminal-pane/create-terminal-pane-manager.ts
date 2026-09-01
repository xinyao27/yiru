import { createTerminalPaneCloseHandler } from './create-terminal-pane-close-handler'
import { createTerminalPaneCreatedHandler } from './create-terminal-pane-created-handler'
import type { TerminalPaneRuntime } from './create-terminal-pane-runtime'
import { PaneManager } from './pane-manager/pane-manager'
import { normalizeTerminalTuiMouseWheelMultiplier } from './pane-manager/pane-terminal-mouse-wheel'
import type { PtyConnectionDeps } from './pty/connection-types'
import type { LinkHandlerDeps } from './terminal-link-handlers'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'
import { formatTerminalUrlTooltip } from './terminal-pane-link-metadata'
import {
  createTerminalActivePaneHandler,
  createTerminalLayoutHandler
} from './terminal-pane-manager-events'
import { createTerminalPaneOptions } from './terminal-pane-options'
import { handleTerminalWebLinkClick } from './terminal-web-link-click'
import type { TerminalPaneResources } from './use-terminal-pane-resources'

type CreateTerminalPaneManagerInput = {
  applyAppearance: (manager: PaneManager) => void
  container: HTMLDivElement
  defaultTabCwd: string
  deps: UseTerminalPaneLifecycleDeps
  fileOpenLinkHint: string
  getPaneLinkCwd: (paneId: number) => string
  linkDeps: LinkHandlerDeps
  osc7UncHost: string | null
  ptyDeps: PtyConnectionDeps
  resources: TerminalPaneResources
  runtime: TerminalPaneRuntime
  shouldPersistLayout: () => boolean
  startupCwd: string
  urlOpenLinkHint: string
}

export function createTerminalPaneManager({
  applyAppearance,
  container,
  defaultTabCwd,
  deps,
  fileOpenLinkHint,
  getPaneLinkCwd,
  linkDeps,
  osc7UncHost,
  ptyDeps,
  resources,
  runtime,
  shouldPersistLayout,
  startupCwd,
  urlOpenLinkHint
}: CreateTerminalPaneManagerInput): PaneManager {
  let manager: PaneManager
  const panePtyBindings = deps.panePtyBindingsRef.current
  manager = new PaneManager(container, {
    onPaneCreated: createTerminalPaneCreatedHandler({
      applyAppearance,
      defaultTabCwd,
      disposables: {
        fileLinkClickFallback: resources.fileLinkClickFallbackDisposablesRef.current,
        httpLinkClickFallback: resources.httpLinkClickFallbackDisposablesRef.current,
        imeComposition: resources.imeCompositionDisposablesRef.current,
        imeNativeTextForwarder: resources.imeNativeTextForwarderDisposablesRef.current,
        linkProvider: resources.linkProviderDisposablesRef.current,
        mode2031: resources.mode2031DisposablesRef.current,
        mouseHide: resources.mouseHideDisposablesRef.current,
        osc52: resources.osc52DisposablesRef.current,
        osc7: resources.osc7DisposablesRef.current,
        selection: resources.selectionDisposablesRef.current,
        selectionCaptureTimers: resources.selectionCaptureTimersRef.current,
        terminalHandleLink: resources.terminalHandleLinkDisposablesRef.current
      },
      fileOpenLinkHint,
      getManager: () => manager,
      getPaneLinkCwd,
      linkDeps,
      managerRef: deps.managerRef,
      onShowSessionRestoredBanner: deps.onShowSessionRestoredBanner,
      osc7UncHost,
      paneCwdRef: deps.paneCwdRef,
      paneLastThemeModeRef: deps.paneLastThemeModeRef,
      paneMode2031Ref: deps.paneMode2031Ref,
      panePtyBindings,
      ptyDeps,
      queueResizeAll: runtime.queueResizeAll,
      queuedInitialCwdRef: resources.queuedInitialCwdRef,
      replayingPanesRef: deps.replayingPanesRef,
      settingsRef: deps.settingsRef,
      syncPaneCount: runtime.syncPaneCount,
      urlOpenLinkHint
    }),
    onPaneClosed: createTerminalPaneCloseHandler({
      clearRuntimePaneTitle: deps.clearRuntimePaneTitle,
      clearTabPtyId: deps.clearTabPtyId,
      disposables: {
        fileLinkClickFallback: resources.fileLinkClickFallbackDisposablesRef.current,
        httpLinkClickFallback: resources.httpLinkClickFallbackDisposablesRef.current,
        imeComposition: resources.imeCompositionDisposablesRef.current,
        imeNativeTextForwarder: resources.imeNativeTextForwarderDisposablesRef.current,
        linkProvider: resources.linkProviderDisposablesRef.current,
        mode2031: resources.mode2031DisposablesRef.current,
        mouseHide: resources.mouseHideDisposablesRef.current,
        osc52: resources.osc52DisposablesRef.current,
        osc7: resources.osc7DisposablesRef.current,
        selection: resources.selectionDisposablesRef.current,
        terminalHandleLink: resources.terminalHandleLinkDisposablesRef.current
      },
      managerRef: deps.managerRef,
      paneCwdMap: deps.paneCwdRef.current,
      paneFontSizes: deps.paneFontSizesRef.current,
      paneKittyKeyboardModes: deps.paneKittyKeyboardModesRef.current,
      paneLastThemeMode: deps.paneLastThemeModeRef.current,
      paneMode2031: deps.paneMode2031Ref.current,
      panePtyBindings,
      paneTitlesRef: deps.paneTitlesRef,
      paneTransports: deps.paneTransportsRef.current,
      replayingPanesRef: deps.replayingPanesRef,
      restoredViewportBlankingPanes: resources.restoredViewportBlankingPanesRef.current,
      selectionCaptureTimers: resources.selectionCaptureTimersRef.current,
      setPaneCount: deps.setPaneCount,
      setPaneTitles: deps.setPaneTitles,
      setRenamingPaneId: deps.setRenamingPaneId,
      syncPanePtyLayoutBinding: deps.syncPanePtyLayoutBinding,
      tabId: deps.tabId,
      updateTabTitle: deps.updateTabTitle,
      worktreeId: deps.worktreeId
    }),
    onActivePaneChange: createTerminalActivePaneHandler({
      managerRef: deps.managerRef,
      panePtyBindings,
      persistLayoutSnapshot: deps.persistLayoutSnapshot,
      shouldPersistLayout,
      syncPaneLayoutRevision: runtime.syncPaneLayoutRevision,
      tabId: deps.tabId,
      updateTabTitle: deps.updateTabTitle
    }),
    onLayoutChanged: createTerminalLayoutHandler({
      persistLayoutSnapshot: deps.persistLayoutSnapshot,
      queueResizeAll: runtime.queueResizeAll,
      shouldPersistLayout,
      syncCanExpandState: runtime.syncCanExpandState,
      syncExpandedLayout: deps.syncExpandedLayout,
      syncPaneCount: runtime.syncPaneCount,
      syncPaneLayoutRevision: runtime.syncPaneLayoutRevision
    }),
    resolveExternalPaneDropTarget: deps.resolveExternalPaneDropTarget,
    onExternalPaneDrop: deps.onExternalPaneDrop,
    terminalOptions: createTerminalPaneOptions({
      effectiveMacOptionAsAltRef: deps.effectiveMacOptionAsAltRef,
      getStartup: () => ptyDeps.startup,
      settingsRef: deps.settingsRef,
      startupCwd,
      tabId: deps.tabId,
      worktreeId: deps.worktreeId
    }),
    terminalTuiScrollSensitivity: () =>
      normalizeTerminalTuiMouseWheelMultiplier(
        deps.settingsRef.current?.terminalTuiScrollSensitivity
      ),
    onLinkClick: (event, url) => {
      const activePane = deps.managerRef.current?.getActivePane()
      handleTerminalWebLinkClick(url, event, {
        ...linkDeps,
        terminal: activePane?.terminal ?? null,
        startupCwd: activePane ? getPaneLinkCwd(activePane.id) : startupCwd,
        runtimeEnvironmentId: activePane
          ? (linkDeps.getRuntimeEnvironmentIdForPane?.(activePane.id) ?? null)
          : null
      })
    },
    formatLinkTooltip: (url, openLinkHint) => formatTerminalUrlTooltip(url, openLinkHint),
    initialRenderingSuspended: !deps.isVisibleRef.current,
    terminalGpuAcceleration: deps.settingsRef.current?.terminalGpuAcceleration ?? 'auto',
    debugLabel: `tab:${deps.tabId}/wt:${deps.worktreeId}`
  })
  return manager
}
