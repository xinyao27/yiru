import {
  armPrimarySelectionNativePasteSuppression,
  isPrimarySelectionEnabled,
  readPrimarySelectionText
} from '~renderer/clipboard/primary-selection'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { pasteTerminalText } from '~renderer/terminal/bracketed-paste'

import type { ManagedPane, PaneManager } from './pane-manager/pane-manager'
import { executeTerminalPastePlan, planTerminalPasteWithYield } from './paste/coordinator'
import { formatTerminalPasteExecutionError } from './paste/errors'
import { resolveTerminalPasteRuntime } from './paste/runtime'
import type { PtyTransport } from './pty/transport-types'
import { reportTerminalPaneError } from './terminal-error-reporting'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'
import { writeTerminalPastePtyInput } from './terminal-pty-paste-writer'

type PrimarySelectionPasteInput = {
  managerRef: React.RefObject<PaneManager | null>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  tabId: string
  worktreeId: string
}

type PrimarySelectionPasteHandlers = {
  onAuxClick: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void
}

function shouldHandleMiddleClick(target: EventTarget | null): target is Node {
  if (!(target instanceof Element) || target.closest('[data-terminal-search-root]')) {
    return false
  }
  const editable = target.closest('input, textarea, [contenteditable=""], [contenteditable="true"]')
  return !editable || editable.classList.contains('xterm-helper-textarea')
}

function getClickedPane(
  managerRef: React.RefObject<PaneManager | null>,
  target: EventTarget | null
) {
  if (!shouldHandleMiddleClick(target)) {
    return null
  }
  const manager = managerRef.current
  if (!manager) {
    return null
  }
  const pane =
    manager.getPanes().find((candidate) => candidate.container.contains(target)) ??
    manager.getActivePane() ??
    manager.getPanes()[0]
  return pane?.terminal.modes.mouseTrackingMode === 'none' ? pane : null
}

function getShortcutPlatform(): NodeJS.Platform {
  if (navigator.userAgent.includes('Mac')) {
    return 'darwin'
  }
  return navigator.userAgent.includes('Windows') ? 'win32' : 'linux'
}

export function useTerminalPrimarySelectionPaste({
  managerRef,
  paneTransportsRef,
  tabId,
  worktreeId
}: PrimarySelectionPasteInput): PrimarySelectionPasteHandlers {
  const pasteSelection = async (pane: ManagedPane, text: string): Promise<void> => {
    const transport = paneTransportsRef.current.get(pane.id)
    const ptyId = transport?.getPtyId() ?? null
    const isTargetCurrent = (): boolean =>
      Boolean(
        managerRef.current
          ?.getPanes()
          .some((candidate) => candidate.id === pane.id && candidate.leafId === pane.leafId) &&
        transport &&
        paneTransportsRef.current.get(pane.id) === transport &&
        transport.isConnected() &&
        transport.getPtyId() === ptyId
      )
    const plan = await planTerminalPasteWithYield({
      text,
      source: 'middle-click',
      target: {
        kind: 'terminal',
        paneId: pane.id,
        leafId: pane.leafId,
        ptyId,
        runtime: resolveTerminalPasteRuntime({
          platform: getShortcutPlatform(),
          ptyId,
          connectionId: getConnectionId(worktreeId) ?? null,
          transport
        })
      },
      terminalBracketedPasteMode: pane.terminal.modes.bracketedPasteMode
    })
    const execution = await executeTerminalPastePlan(plan, {
      pasteText: (pasteText, options) => pasteTerminalText(pane.terminal, pasteText, options),
      writePty: (data) => writeTerminalPastePtyInput(transport, data),
      isTargetCurrent,
      canContinue: isTargetCurrent
    })
    if (execution.status !== 'pasted') {
      reportTerminalPaneError(formatTerminalPasteExecutionError(execution.reason), 'terminal-paste')
      return
    }
    recordTerminalUserInputForLeaf(tabId, pane.leafId)
  }

  const onMouseDown = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.button !== 1 || !isPrimarySelectionEnabled()) {
      return
    }
    const pane = getClickedPane(managerRef, event.target)
    if (!pane) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    // Why: mousedown cancellation does not stop Chromium's later native X11 paste.
    armPrimarySelectionNativePasteSuppression()
    pane.terminal.focus()
    void readPrimarySelectionText().then((text) => (text ? pasteSelection(pane, text) : undefined))
  }

  const onAuxClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (
      event.button !== 1 ||
      !isPrimarySelectionEnabled() ||
      !getClickedPane(managerRef, event.target)
    ) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    // Why: re-arm at release so slow middle clicks cover Chromium's imminent native paste.
    armPrimarySelectionNativePasteSuppression()
  }

  return { onAuxClick, onMouseDown }
}
