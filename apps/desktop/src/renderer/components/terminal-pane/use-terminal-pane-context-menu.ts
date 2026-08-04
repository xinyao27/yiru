/* eslint-disable max-lines -- Why: context-menu actions share pane refs, focus
 * recovery, inherited-cwd split behavior, and agent-fork state in one hook. */
import type { BaseUIEvent } from '@base-ui/react/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  REQUEST_ACTIVE_TERMINAL_PANE_SPLIT_EVENT,
  type RequestActiveTerminalPaneSplitDetail
} from '~renderer/constants/terminal'
import { translate } from '~renderer/i18n/i18n'
import { getConnectionId } from '~renderer/lib/connection-context'
import type { ManagedPane, PaneManager } from '~renderer/lib/pane-manager/pane-manager'
import { runQuickCommandInNewTab } from '~renderer/lib/run-quick-command-in-new-tab'
import { pasteTerminalText } from '~renderer/lib/terminal-bracketed-paste'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/lib/worktree-runtime-owner'
import { useAppStore } from '~renderer/store'
import { makePaneKey } from '~shared/stable-pane-id'
import { isTerminalAgentQuickCommand } from '~shared/terminal/quick-commands'
import type { TerminalQuickCommand } from '~shared/types'

import type { AgentSessionContinuationRequest } from './agent/session-continuation'
import {
  executeTerminalPastePlan,
  planTerminalPasteWithYield,
  type TerminalPasteSource,
  type TerminalPasteTextOptions
} from './paste/coordinator'
import { formatTerminalPasteExecutionError } from './paste/errors'
import { resolveTerminalPasteRuntime } from './paste/runtime'
import { isTerminalPanePasteTargetCurrent } from './paste/target-state'
import type { PtyTransport } from './pty/transport'
import type { PaneCwdMap } from './resolve-split-cwd'
import { recordCreatedTerminalPaneSplit } from './split-completion'
import { splitTerminalPaneWithInheritedCwd } from './split-with-inherited-cwd'
import { prepareAgentSessionContinuationFromPane } from './terminal-agent-session-continuation'
import {
  copyAgentSessionContextFromPane,
  prepareAgentSessionForkFromPane,
  type PreparedAgentSessionFork
} from './terminal-agent-session-fork'
import { pasteTerminalClipboard } from './terminal-clipboard-paste'
import { copyTerminalHandleForPane } from './terminal-handle-copy'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'
import { writeTerminalPastePtyInput } from './terminal-pty-paste-writer'
import { sendTerminalQuickCommandToPane } from './terminal-quick-command-dispatch'
import { scheduleImagePasteWebglAtlasRecovery } from './terminal-webgl-atlas-recovery'

const CLOSE_ALL_CONTEXT_MENUS_EVENT = 'yiru-close-all-context-menus'

export function recordContextMenuCreatedTerminalPaneSplit(
  createdPane: unknown,
  args: {
    source: 'contextual_tour' | 'context_menu'
    direction: 'vertical' | 'horizontal'
  }
): boolean {
  return recordCreatedTerminalPaneSplit(createdPane, args)
}

type UseTerminalPaneContextMenuDeps = {
  managerRef: React.RefObject<PaneManager | null>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  paneCwdRef: React.RefObject<PaneCwdMap>
  tabId: string
  worktreeId: string
  groupId: string | null
  fallbackCwd: string
  toggleExpandPane: (paneId: number) => void
  onRequestClosePane: (paneId: number) => void
  onClearPaneScrollback: (pane: ManagedPane) => void
  onSetTitle: (paneId: number) => void
  onClearPaneTitle: (paneId: number) => void
  onPasteError: (message: string) => void
  onAgentSessionForkReady: (fork: PreparedAgentSessionFork) => void
  onAgentSessionContinuationReady: (request: AgentSessionContinuationRequest) => void
  forceBracketedMultilineTextPaste: boolean
  rightClickToPaste: boolean
}

type TerminalMenuState = {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  menuOpenedAtRef: React.RefObject<number>
  paneCount: number
  menuPaneId: number | null
  onContextMenu: (event: BaseUIEvent<React.MouseEvent<HTMLDivElement>>) => void
  onPaneTitleContextMenu: (
    event: BaseUIEvent<React.MouseEvent<HTMLElement>>,
    paneId: number
  ) => void
  onCopy: () => Promise<void>
  onCopyTerminalId: () => Promise<void>
  onCopyPaneId: () => Promise<void>
  onPaste: () => Promise<void>
  onSplitRight: () => void
  onSplitDown: () => void
  onEqualizePaneSizes: () => void
  onClosePane: () => void
  onClearScreen: () => void
  onForkAgentSession: () => Promise<void>
  onContinueAgentSessionInNewSession: () => void
  onRelaunchAgentSession: () => void
  onCopyAgentSessionContext: () => Promise<void>
  onQuickCommand: (command: TerminalQuickCommand) => void
  onToggleExpand: () => void
  onSetTitle: () => void
  onClearPaneTitle: () => void
  runForPane: <Result>(paneId: number, action: () => Result) => Result
}

export function useTerminalPaneContextMenu({
  managerRef,
  paneTransportsRef,
  paneCwdRef,
  tabId,
  worktreeId,
  groupId,
  fallbackCwd,
  toggleExpandPane,
  onRequestClosePane,
  onClearPaneScrollback,
  onSetTitle,
  onClearPaneTitle,
  onPasteError,
  onAgentSessionForkReady,
  onAgentSessionContinuationReady,
  forceBracketedMultilineTextPaste,
  rightClickToPaste
}: UseTerminalPaneContextMenuDeps): TerminalMenuState {
  const contextPaneIdRef = useRef<number | null>(null)
  const menuOpenedAtRef = useRef(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const closeMenu = (): void => {
      if (Date.now() - menuOpenedAtRef.current < 100) {
        return
      }
      setOpen(false)
    }
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [])

  const resolveMenuPane = useCallback((): ManagedPane | null => {
    const manager = managerRef.current
    if (!manager) {
      return null
    }
    const panes = manager.getPanes()
    if (contextPaneIdRef.current !== null) {
      const clickedPane = panes.find((pane) => pane.id === contextPaneIdRef.current) ?? null
      return clickedPane
    }
    return manager.getActivePane() ?? panes[0] ?? null
  }, [managerRef])

  const onCopy = async (): Promise<void> => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    const selection = pane.terminal.getSelection()
    if (selection) {
      await window.api.ui.writeClipboardText(selection)
    }
    // Why: Radix returns focus to the menu trigger (the pane container) on
    // close, but xterm.js only accepts input when its own helper textarea is
    // focused. Without this, the user has to click the pane again before
    // typing works (see #592).
    pane.terminal.focus()
  }

  const onCopyPaneId = async (): Promise<void> => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    // Why: orchestration targets use YIRU_PANE_KEY, which survives renderer
    // remounts; the numeric PaneManager id is only a local runtime handle.
    await window.api.ui.writeClipboardText(makePaneKey(tabId, pane.leafId))
    toast.success(
      translate(
        'auto.components.terminal.pane.use.terminal.pane.context.menu.a29b9faa01',
        'Pane ID copied'
      )
    )
    pane.terminal.focus()
  }

  const getShortcutPlatform = (): NodeJS.Platform => {
    if (navigator.userAgent.includes('Mac')) {
      return 'darwin'
    }
    return navigator.userAgent.includes('Windows') ? 'win32' : 'linux'
  }

  const isPanePasteTargetMounted = (
    pane: ManagedPane,
    transport: PtyTransport | undefined,
    ptyId: string | null
  ): boolean => {
    return isTerminalPanePasteTargetCurrent({
      manager: managerRef.current,
      paneTransports: paneTransportsRef.current,
      paneId: pane.id,
      leafId: pane.leafId,
      transport,
      ptyId
    })
  }

  const executeMenuPasteText = async (
    pane: ManagedPane,
    source: TerminalPasteSource,
    text: string,
    options?: TerminalPasteTextOptions
  ): Promise<boolean> => {
    const connectionId = getConnectionId(worktreeId) ?? null
    const transport = paneTransportsRef.current.get(pane.id)
    const ptyId = transport?.getPtyId() ?? null
    const shortcutPlatform = getShortcutPlatform()
    const plan = await planTerminalPasteWithYield({
      text,
      source,
      target: {
        kind: 'terminal',
        paneId: pane.id,
        leafId: pane.leafId,
        ptyId,
        runtime: resolveTerminalPasteRuntime({
          platform: shortcutPlatform,
          ptyId,
          connectionId,
          transport,
          isWindowsConpty: forceBracketedMultilineTextPaste
        })
      },
      forceBracketedPaste: options?.forceBracketedPaste,
      forceBracketedPasteForMultiline: options?.forceBracketedPasteForMultiline,
      terminalBracketedPasteMode: pane.terminal.modes.bracketedPasteMode
    })
    const execution = await executeTerminalPastePlan(plan, {
      pasteText: (pasteText, pasteOptions) =>
        pasteTerminalText(pane.terminal, pasteText, pasteOptions),
      writePty: (data) => writeTerminalPastePtyInput(transport, data),
      isTargetCurrent: () => isPanePasteTargetMounted(pane, transport, ptyId),
      canContinue: () => isPanePasteTargetMounted(pane, transport, ptyId)
    })
    if (execution.status !== 'pasted') {
      onPasteError(formatTerminalPasteExecutionError(execution.reason))
      return false
    }
    if (text) {
      recordTerminalUserInputForLeaf(tabId, pane.leafId)
    }
    if (options?.recoverImagePasteWebglAtlas) {
      scheduleImagePasteWebglAtlasRecovery()
    }
    return true
  }

  const onCopyTerminalId = async (): Promise<void> => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    try {
      await copyTerminalHandleForPane({
        tabId,
        leafId: pane.leafId,
        callRuntime: window.api.runtime.call,
        writeClipboardText: window.api.ui.writeClipboardText
      })
      toast.success(
        translate(
          'auto.components.terminal.pane.use.terminal.pane.context.menu.terminal.id.copied',
          'Terminal ID copied'
        )
      )
    } catch {
      toast.error(
        translate(
          'auto.components.terminal.pane.use.terminal.pane.context.menu.terminal.id.copy.failed',
          'Unable to copy terminal ID'
        )
      )
    } finally {
      pane.terminal.focus()
    }
  }

  const pasteResolvedPane = async (
    source: Extract<TerminalPasteSource, 'context-menu' | 'right-click'>
  ): Promise<void> => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    const connectionId = getConnectionId(worktreeId) ?? null
    const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(
      useAppStore.getState(),
      worktreeId
    )
    const result = await pasteTerminalClipboard({
      readClipboardText: window.api.ui.readClipboardText,
      saveClipboardImageAsTempFile: window.api.ui.saveClipboardImageAsTempFile,
      connectionId,
      runtimeEnvironmentId,
      forceBracketedMultilineTextPaste,
      pasteText: (text, options) => executeMenuPasteText(pane, source, text, options),
      onTextPasteError: () =>
        onPasteError('Paste failed: clipboard text is too large for a safe terminal paste.'),
      onImagePasteError: (error) => {
        const detail = error instanceof Error ? error.message : String(error)
        onPasteError(`Image paste failed: ${detail}`)
      }
    })
    if (result.status !== 'pasted') {
      return
    }
    // Why: Radix returns focus to the menu trigger (the pane container) on
    // close. Refocus only after a completed paste so rejected async targets
    // do not steal focus from the user's new control.
    pane.terminal.focus()
  }

  const onPaste = async (): Promise<void> => pasteResolvedPane('context-menu')

  const splitWithInheritedCwd = useCallback(
    (
      direction: 'vertical' | 'horizontal',
      source: 'contextual_tour' | 'context_menu' = 'context_menu'
    ): void => {
      const pane = resolveMenuPane()
      const manager = managerRef.current
      if (!pane || !manager) {
        return
      }
      splitTerminalPaneWithInheritedCwd({
        manager,
        getManager: () => managerRef.current,
        paneTransports: paneTransportsRef.current,
        paneCwdMap: paneCwdRef.current,
        fallbackCwd,
        pane,
        direction,
        source
      })
    },
    [fallbackCwd, managerRef, paneCwdRef, paneTransportsRef, resolveMenuPane]
  )

  const onSplitRight = (): void => splitWithInheritedCwd('vertical')
  const onSplitDown = (): void => splitWithInheritedCwd('horizontal')

  useEffect(() => {
    const onRequestSplit = (event: Event): void => {
      const detail = (event as CustomEvent<RequestActiveTerminalPaneSplitDetail>).detail
      if (detail?.tabId && detail.tabId !== tabId) {
        return
      }
      contextPaneIdRef.current = null
      splitWithInheritedCwd(detail?.direction ?? 'vertical', getRequestedSplitTelemetrySource())
    }
    window.addEventListener(REQUEST_ACTIVE_TERMINAL_PANE_SPLIT_EVENT, onRequestSplit)
    return () =>
      window.removeEventListener(REQUEST_ACTIVE_TERMINAL_PANE_SPLIT_EVENT, onRequestSplit)
    // splitWithInheritedCwd closes over live refs; re-registering keeps the
    // tour action aligned with the current focused pane and fallback cwd.
  }, [tabId, splitWithInheritedCwd])

  const onEqualizePaneSizes = (): void => {
    const pane = resolveMenuPane()
    const manager = managerRef.current
    if (!pane || !manager) {
      return
    }
    manager.equalizePaneSizes()
    pane.terminal.focus()
  }

  const onClosePane = (): void => {
    const pane = resolveMenuPane()
    if (pane && (managerRef.current?.getPanes().length ?? 0) > 1) {
      onRequestClosePane(pane.id)
    }
  }

  const onClearScreen = (): void => {
    const pane = resolveMenuPane()
    if (pane) {
      onClearPaneScrollback(pane)
    }
  }

  const onForkAgentSession = async (): Promise<void> => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    const fork = prepareAgentSessionForkFromPane({ pane, tabId, worktreeId, groupId })
    if (fork) {
      onAgentSessionForkReady(fork)
    }
  }

  const onContinueAgentSessionInNewSession = (): void => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    const initialCwd = paneCwdRef.current.get(pane.id)?.cwd || fallbackCwd
    const request = prepareAgentSessionContinuationFromPane({
      pane,
      tabId,
      worktreeId,
      groupId,
      workspacePath: fallbackCwd,
      initialCwd
    })
    if (request) {
      onAgentSessionContinuationReady(request)
    }
  }

  // Why: the composer's Agent/model switch reuses this dialog, but a model
  // change is valid before the session has produced anything to hand off.
  const onRelaunchAgentSession = (): void => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    const initialCwd = paneCwdRef.current.get(pane.id)?.cwd || fallbackCwd
    const request = prepareAgentSessionContinuationFromPane({
      pane,
      tabId,
      worktreeId,
      groupId,
      workspacePath: fallbackCwd,
      initialCwd,
      requireContext: false
    })
    if (request) {
      onAgentSessionContinuationReady(request)
    }
  }

  // Why: the captured session transcript is often wanted on its own — to paste
  // into another tool — so copy the bounded transcript directly, without the
  // fork prompt's framing or the fork dialog detour (issue #5020).
  const onCopyAgentSessionContext = async (): Promise<void> => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    await copyAgentSessionContextFromPane(pane)
  }

  const onQuickCommand = (command: TerminalQuickCommand): void => {
    if (isTerminalAgentQuickCommand(command)) {
      runQuickCommandInNewTab({ command, worktreeId, groupId })
      return
    }

    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    sendTerminalQuickCommandToPane({
      command,
      pane,
      tabId,
      transport: paneTransportsRef.current.get(pane.id)
    })
  }

  const onToggleExpand = (): void => {
    const pane = resolveMenuPane()
    if (pane) {
      toggleExpandPane(pane.id)
    }
  }

  /** Routes title edits through the resolved menu pane instead of active pane. */
  const handleSetTitle = (): void => {
    const pane = resolveMenuPane()
    if (pane) {
      onSetTitle(pane.id)
    }
  }

  /** Clears the title for the pane that opened the context menu. */
  const handleClearPaneTitle = (): void => {
    const pane = resolveMenuPane()
    if (pane) {
      onClearPaneTitle(pane.id)
    }
  }

  const runForPane = <Result>(paneId: number, action: () => Result): Result => {
    const previousPaneId = contextPaneIdRef.current
    contextPaneIdRef.current = paneId
    try {
      return action()
    } finally {
      contextPaneIdRef.current = previousPaneId
    }
  }

  const openContextMenu = (
    event: BaseUIEvent<React.MouseEvent<HTMLElement>>,
    clickedPaneId: number | null
  ): void => {
    window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
    const manager = managerRef.current
    if (!manager) {
      event.preventBaseUIHandler()
      contextPaneIdRef.current = null
      return
    }
    const clickedPane =
      clickedPaneId !== null
        ? (manager.getPanes().find((pane) => pane.id === clickedPaneId) ?? null)
        : null
    contextPaneIdRef.current = clickedPane?.id ?? null

    // Why: when users opt into terminal-style right-click, a selection copies
    // and no selection pastes. Ctrl+right-click keeps the app menu reachable.
    if (rightClickToPaste && !event.ctrlKey) {
      event.preventBaseUIHandler()
      event.stopPropagation()
      if (!clickedPane) {
        return
      }
      const selection = clickedPane.terminal.getSelection()
      if (selection) {
        void window.api.ui.writeClipboardText(selection)
        clickedPane.terminal.clearSelection()
      } else {
        void pasteResolvedPane('right-click')
      }
      return
    }

    menuOpenedAtRef.current = Date.now()
  }

  const onContextMenu = (event: BaseUIEvent<React.MouseEvent<HTMLDivElement>>): void => {
    const manager = managerRef.current
    const target = event.target
    if (!manager || !(target instanceof Node)) {
      event.preventBaseUIHandler()
      contextPaneIdRef.current = null
      return
    }
    const clickedPane = manager.getPanes().find((pane) => pane.container.contains(target)) ?? null
    openContextMenu(event, clickedPane?.id ?? null)
  }

  const onPaneTitleContextMenu = (
    event: BaseUIEvent<React.MouseEvent<HTMLElement>>,
    paneId: number
  ): void => {
    openContextMenu(event, paneId)
  }

  // Why: PaneManager.getPanes() allocates public pane wrappers. Closed menus
  // do not need pane counts or target identity, so avoid that work on every
  // render across hundreds of mounted terminal tabs.
  const paneCount = open ? (managerRef.current?.getPanes().length ?? 1) : 1
  const menuPaneId = open ? (resolveMenuPane()?.id ?? null) : null

  return {
    open,
    setOpen,
    menuOpenedAtRef,
    paneCount,
    menuPaneId,
    onContextMenu,
    onPaneTitleContextMenu,
    onCopy,
    onCopyTerminalId,
    onCopyPaneId,
    onPaste,
    onSplitRight,
    onSplitDown,
    onEqualizePaneSizes,
    onClosePane,
    onClearScreen,
    onForkAgentSession,
    onContinueAgentSessionInNewSession,
    onRelaunchAgentSession,
    onCopyAgentSessionContext,
    onQuickCommand,
    onToggleExpand,
    onSetTitle: handleSetTitle,
    onClearPaneTitle: handleClearPaneTitle,
    runForPane
  }
}

function getRequestedSplitTelemetrySource(): 'contextual_tour' | 'context_menu' {
  return useAppStore.getState().activeContextualTourId === 'workspace-agent-sessions'
    ? 'contextual_tour'
    : 'context_menu'
}
