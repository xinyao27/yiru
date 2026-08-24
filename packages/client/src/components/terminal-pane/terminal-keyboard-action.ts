import type { IDisposable } from '@xterm/xterm'
import type { ManagedPane, PaneManager } from '~renderer/lib/pane-manager/pane-manager'
import {
  markTerminalFollowOutput,
  markTerminalPinnedViewport,
  syncTerminalScrollIntentFromViewport
} from '~renderer/lib/pane-manager/terminal-scroll-intent'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store'

import type { PtyTransport } from './pty/transport-types'
import type { PaneCwdMap } from './resolve-split-cwd'
import { splitTerminalPaneWithInheritedCwd } from './split-with-inherited-cwd'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'
import type { resolveTerminalShortcutAction } from './terminal-shortcut-policy'

type TerminalKeyboardAction = NonNullable<ReturnType<typeof resolveTerminalShortcutAction>>

type TerminalKeyboardActionInput = {
  action: TerminalKeyboardAction
  event: KeyboardEvent
  expandedPaneIdRef: React.RefObject<number | null>
  fallbackCwd: string
  manager: PaneManager
  managerRef: React.RefObject<PaneManager | null>
  onClearPaneScrollback: (pane: ManagedPane) => void
  onClearPaneTitle: (paneId: number) => void
  onRequestClosePane: (paneId: number) => void
  onSetTitle: (paneId: number) => void
  paneCwdRef: React.RefObject<PaneCwdMap>
  panePtyBindingsRef: React.RefObject<Map<number, IDisposable>>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  persistLayoutSnapshot: () => void
  refreshPaneSizes: (focusActive: boolean) => void
  restoreExpandedLayout: () => void
  setExpandedPane: (paneId: number | null) => void
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>
  tabId: string
  toggleExpandPane: (paneId: number) => void
}

function consume(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopImmediatePropagation()
}

export function handleTerminalKeyboardAction(input: TerminalKeyboardActionInput): void {
  const { action, event, manager } = input
  if (action.type === 'sendInput') {
    consume(event)
    const pane = manager.getActivePane() ?? manager.getPanes()[0]
    if (!pane) {
      return
    }
    const sent = input.paneTransportsRef.current.get(pane.id)?.sendInput(action.data) === true
    if (sent) {
      recordTerminalUserInputForLeaf(input.tabId, pane.leafId)
      if (action.data === '\x1b[13;2u') {
        // Why: this direct write bypasses PTY onData, so Droid needs an
        // explicit post-write confirmation ladder.
        const binding = input.panePtyBindingsRef.current.get(pane.id) as
          | (IDisposable & { requestDroidReconfirmation?: () => void })
          | undefined
        binding?.requestDroidReconfirmation?.()
      }
    }
    return
  }
  if (event.repeat) {
    return
  }

  switch (action.type) {
    case 'copySelection': {
      const pane = manager.getActivePane() ?? manager.getPanes()[0]
      const selection = pane?.terminal.getSelection()
      if (selection) {
        consume(event)
        void shellClient.ui.writeClipboardText(selection).catch(() => {})
      }
      return
    }
    case 'toggleSearch':
      consume(event)
      input.setSearchOpen((previous) => !previous)
      return
    case 'clearActivePane': {
      consume(event)
      const pane = manager.getActivePane() ?? manager.getPanes()[0]
      if (pane) {
        input.onClearPaneScrollback(pane)
      }
      return
    }
    case 'scrollViewport': {
      consume(event)
      const pane = manager.getActivePane() ?? manager.getPanes()[0]
      if (!pane) {
        return
      }
      if (action.position === 'top') {
        markTerminalPinnedViewport(pane.terminal)
        pane.terminal.scrollToLine(0)
      } else {
        markTerminalFollowOutput(pane.terminal)
        pane.terminal.scrollToBottom()
      }
      syncTerminalScrollIntentFromViewport(pane.terminal)
      return
    }
    case 'focusPane': {
      const panes = manager.getPanes()
      if (panes.length < 2) {
        return
      }
      consume(event)
      collapseExpandedPane(input)
      const activeId = manager.getActivePane()?.id ?? panes[0].id
      const currentIndex = panes.findIndex((pane) => pane.id === activeId)
      if (currentIndex === -1) {
        return
      }
      const direction = action.direction === 'next' ? 1 : -1
      manager.setActivePane(panes[(currentIndex + direction + panes.length) % panes.length].id, {
        focus: true
      })
      return
    }
    case 'equalizePaneSizes': {
      consume(event)
      if (input.expandedPaneIdRef.current !== null) {
        return
      }
      manager.equalizePaneSizes()
      const paneToFocus = manager.getActivePane() ?? manager.getPanes()[0]
      paneToFocus?.terminal.focus()
      return
    }
    case 'toggleExpandActivePane': {
      const panes = manager.getPanes()
      if (panes.length < 2) {
        return
      }
      consume(event)
      const pane = manager.getActivePane() ?? panes[0]
      if (pane) {
        input.toggleExpandPane(pane.id)
      }
      return
    }
    case 'setTitle':
    case 'clearPaneTitle':
    case 'closeActivePane': {
      consume(event)
      const pane = manager.getActivePane() ?? manager.getPanes()[0]
      if (!pane) {
        return
      }
      if (action.type === 'setTitle') {
        input.onSetTitle(pane.id)
      } else if (action.type === 'clearPaneTitle') {
        input.onClearPaneTitle(pane.id)
      } else {
        input.onRequestClosePane(pane.id)
      }
      return
    }
    case 'splitActivePane': {
      consume(event)
      collapseExpandedPane(input)
      const pane = manager.getActivePane() ?? manager.getPanes()[0]
      if (!pane) {
        return
      }
      splitTerminalPaneWithInheritedCwd({
        manager,
        getManager: () => input.managerRef.current,
        paneTransports: input.paneTransportsRef.current,
        paneCwdMap: input.paneCwdRef.current,
        fallbackCwd: input.fallbackCwd,
        pane,
        direction: action.direction,
        source: getKeyboardSplitTelemetrySource()
      })
    }
  }
}

function collapseExpandedPane(input: TerminalKeyboardActionInput): void {
  if (input.expandedPaneIdRef.current === null) {
    return
  }
  input.setExpandedPane(null)
  input.restoreExpandedLayout()
  input.refreshPaneSizes(true)
  input.persistLayoutSnapshot()
}

function getKeyboardSplitTelemetrySource(): 'contextual_tour' | 'keyboard' {
  return useAppStore.getState().activeContextualTourId === 'workspace-agent-sessions'
    ? 'contextual_tour'
    : 'keyboard'
}
