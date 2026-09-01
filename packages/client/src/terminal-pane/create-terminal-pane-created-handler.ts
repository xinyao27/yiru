import type { IDisposable } from '@xterm/xterm'

import { scheduleRuntimeGraphSync } from '../runtime/sync-runtime-graph'
import { installTerminalPaneInteractions } from './install-terminal-pane-interactions'
import { installTerminalPaneKeyboard } from './install-terminal-pane-keyboard'
import { installTerminalPaneParsers } from './install-terminal-pane-parsers'
import type { PaneManager, PaneManagerOptions } from './pane-manager/pane-manager'
import { connectPanePty } from './pty/connection'
import type { PtyConnectionDeps } from './pty/connection-types'
import type { ReplayingPanesRef } from './replay-guard'
import type { LinkHandlerDeps } from './terminal-link-handlers'
import { clearQueuedInitialCwdAfterFirstPane } from './terminal-pane-lifecycle-decisions'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'

type PaneCreateDisposables = {
  fileLinkClickFallback: Map<number, IDisposable>
  httpLinkClickFallback: Map<number, IDisposable>
  imeComposition: Map<number, IDisposable>
  imeNativeTextForwarder: Map<number, IDisposable>
  linkProvider: Map<number, IDisposable>
  mode2031: Map<number, IDisposable[]>
  mouseHide: Map<number, IDisposable>
  osc52: Map<number, IDisposable>
  osc7: Map<number, IDisposable>
  selection: Map<number, IDisposable>
  selectionCaptureTimers: Map<number, number>
  terminalHandleLink: Map<number, IDisposable>
}

type TerminalPaneCreatedHandlerInput = {
  applyAppearance: (manager: PaneManager) => void
  defaultTabCwd: string
  disposables: PaneCreateDisposables
  fileOpenLinkHint: string
  getManager: () => PaneManager
  getPaneLinkCwd: (paneId: number) => string
  linkDeps: LinkHandlerDeps
  managerRef: UseTerminalPaneLifecycleDeps['managerRef']
  onShowSessionRestoredBanner: UseTerminalPaneLifecycleDeps['onShowSessionRestoredBanner']
  osc7UncHost: string | null
  paneCwdRef: UseTerminalPaneLifecycleDeps['paneCwdRef']
  paneLastThemeModeRef: UseTerminalPaneLifecycleDeps['paneLastThemeModeRef']
  paneMode2031Ref: UseTerminalPaneLifecycleDeps['paneMode2031Ref']
  panePtyBindings: Map<number, IDisposable>
  ptyDeps: PtyConnectionDeps
  queueResizeAll: (focusActive: boolean) => void
  queuedInitialCwdRef: React.RefObject<string | null | undefined>
  replayingPanesRef: ReplayingPanesRef
  settingsRef: UseTerminalPaneLifecycleDeps['settingsRef']
  syncPaneCount: () => void
  urlOpenLinkHint: string
}

export function createTerminalPaneCreatedHandler({
  applyAppearance,
  defaultTabCwd,
  disposables,
  fileOpenLinkHint,
  getManager,
  getPaneLinkCwd,
  linkDeps,
  managerRef,
  onShowSessionRestoredBanner,
  osc7UncHost,
  paneCwdRef,
  paneLastThemeModeRef,
  paneMode2031Ref,
  panePtyBindings,
  ptyDeps,
  queueResizeAll,
  queuedInitialCwdRef,
  replayingPanesRef,
  settingsRef,
  syncPaneCount,
  urlOpenLinkHint
}: TerminalPaneCreatedHandlerInput): NonNullable<PaneManagerOptions['onPaneCreated']> {
  return (pane, spawnHints) => {
    const manager = getManager()
    installTerminalPaneParsers({
      defaultCwd: ptyDeps.cwd ?? defaultTabCwd,
      mode2031Disposables: disposables.mode2031,
      osc52Disposables: disposables.osc52,
      osc7Disposables: disposables.osc7,
      osc7UncHost,
      pane,
      paneCwdMap: paneCwdRef.current,
      paneLastThemeMode: paneLastThemeModeRef.current,
      paneMode2031: paneMode2031Ref.current,
      replayingPanesRef,
      settingsRef,
      spawnCwd: spawnHints?.cwd
    })
    installTerminalPaneKeyboard({
      imeCompositionDisposables: disposables.imeComposition,
      imeNativeTextForwarderDisposables: disposables.imeNativeTextForwarder,
      managerRef,
      pane,
      settingsRef
    })
    installTerminalPaneInteractions({
      fileLinkClickFallbackDisposables: disposables.fileLinkClickFallback,
      fileOpenLinkHint,
      getPaneLinkCwd,
      httpLinkClickFallbackDisposables: disposables.httpLinkClickFallback,
      linkDeps,
      linkProviderDisposables: disposables.linkProvider,
      managerRef,
      mouseHideDisposables: disposables.mouseHide,
      onShowSessionRestoredBanner,
      pane,
      selectionCaptureTimers: disposables.selectionCaptureTimers,
      selectionDisposables: disposables.selection,
      settingsRef,
      startup: ptyDeps.startup,
      terminalHandleLinkDisposables: disposables.terminalHandleLink,
      urlOpenLinkHint
    })
    applyAppearance(manager)
    const panePtyBinding = connectPanePty(pane, manager, {
      ...ptyDeps,
      ...(spawnHints?.cwd ? { cwd: spawnHints.cwd } : {}),
      restoredPtyIdByLeafId: spawnHints?.ptyId
        ? {
            ...ptyDeps.restoredPtyIdByLeafId,
            [pane.leafId]: spawnHints.ptyId
          }
        : ptyDeps.restoredPtyIdByLeafId,
      restoredLeafId: pane.leafId
    })
    ptyDeps.startup = null
    const nextInitialCwdState = clearQueuedInitialCwdAfterFirstPane(
      queuedInitialCwdRef.current,
      defaultTabCwd,
      ptyDeps.cwd ?? defaultTabCwd
    )
    queuedInitialCwdRef.current = nextInitialCwdState.queuedInitialCwd
    ptyDeps.cwd = nextInitialCwdState.ptyCwd
    panePtyBindings.set(pane.id, panePtyBinding)
    syncPaneCount()
    scheduleRuntimeGraphSync()
    queueResizeAll(true)
  }
}
