import { assertClipboardTextWithinLimitWithYield } from '@yiru/runtime-protocol/model/ui'
import {
  keybindingMatchesAction,
  type KeybindingOverrides
} from '@yiru/runtime-protocol/workbench/keybindings'
import { useEffect } from 'react'
import { APP_MENU_PASTE_EVENT } from '~renderer/application-shell/menu-paste'

import type { PaneManager } from './pane-manager/pane-manager'
import type { PtyTransport } from './pty/transport-types'
import {
  firesNativePasteEvent,
  getClipboardEventText,
  isClipboardEventPasteRequired
} from './terminal-clipboard-event-paste'
import { createTerminalPanePasteActions } from './terminal-pane-paste-actions'

type TerminalPanePasteInput = {
  containerRef: React.RefObject<HTMLDivElement | null>
  forceBracketedMultilineTextPaste: boolean
  isActive: boolean
  keybindings?: KeybindingOverrides
  managerRef: React.RefObject<PaneManager | null>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  tabId: string
  worktreeId: string
}

function getShortcutPlatform(): NodeJS.Platform {
  if (navigator.userAgent.includes('Mac')) {
    return 'darwin'
  }
  return navigator.userAgent.includes('Windows') ? 'win32' : 'linux'
}

function shouldSuppressNativePaste(event: KeyboardEvent, isMac: boolean): boolean {
  const key = event.key.toLowerCase()
  return (
    (isMac && key === 'v' && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) ||
    (!isMac && key === 'v' && event.ctrlKey && !event.metaKey && !event.altKey) ||
    (!isMac &&
      event.key === 'Insert' &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey)
  )
}

export function useTerminalPanePaste({
  containerRef,
  forceBracketedMultilineTextPaste,
  isActive,
  keybindings,
  managerRef,
  paneTransportsRef,
  tabId,
  worktreeId
}: TerminalPanePasteInput): void {
  useEffect(() => {
    if (!isActive) {
      return
    }
    const container = containerRef.current
    if (!container) {
      return
    }

    const shortcutPlatform = getShortcutPlatform()
    const isMac = shortcutPlatform === 'darwin'
    const { pasteFromClipboard } = createTerminalPanePasteActions({
      forceBracketedMultilineTextPaste,
      managerRef,
      paneTransportsRef,
      shortcutPlatform,
      tabId,
      worktreeId
    })
    const getActivePane = () => {
      const manager = managerRef.current
      return manager?.getActivePane() ?? manager?.getPanes()[0] ?? null
    }
    let suppressNextNativePaste = false
    let pasteSuppressionTimerId: number | null = null
    const suppressNativePasteOnce = (): void => {
      suppressNextNativePaste = true
      if (pasteSuppressionTimerId !== null) {
        window.clearTimeout(pasteSuppressionTimerId)
      }
      pasteSuppressionTimerId = window.setTimeout(() => {
        pasteSuppressionTimerId = null
        suppressNextNativePaste = false
      }, 0)
    }
    const onKeyPaste = (event: KeyboardEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-terminal-search-root]')) {
        return
      }
      const matchesPaste = keybindingMatchesAction(
        'terminal.paste',
        event,
        shortcutPlatform,
        keybindings,
        { context: 'terminal' }
      )
      if (!matchesPaste) {
        if (shouldSuppressNativePaste(event, isMac)) {
          // Why: bare Ctrl+V is readline's quote-insert on Windows/Linux. Suppress
          // Chromium's follow-up paste while leaving the original keydown for xterm.
          suppressNativePasteOnce()
        }
        return
      }
      if (isClipboardEventPasteRequired() && firesNativePasteEvent(event, isMac)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const pane = getActivePane()
      if (!pane) {
        return
      }
      suppressNativePasteOnce()
      pasteFromClipboard({
        activeElementAtDispatch: document.activeElement,
        pane,
        source: 'keyboard'
      })
    }
    const onPaste = (event: ClipboardEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-terminal-search-root]')) {
        return
      }
      if (suppressNextNativePaste) {
        suppressNextNativePaste = false
        if (pasteSuppressionTimerId !== null) {
          window.clearTimeout(pasteSuppressionTimerId)
          pasteSuppressionTimerId = null
        }
        event.preventDefault()
        event.stopPropagation()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const pane = getActivePane()
      if (!pane) {
        return
      }
      pasteFromClipboard({
        activeElementAtDispatch: document.activeElement,
        pane,
        source: 'paste-event',
        ...(isClipboardEventPasteRequired()
          ? {
              readClipboardText: (options) =>
                assertClipboardTextWithinLimitWithYield(getClipboardEventText(event), options)
            }
          : {})
      })
    }
    const onAppMenuPaste = (event: Event): void => {
      const activeElementAtDispatch = document.activeElement
      if (
        !(activeElementAtDispatch instanceof Element) ||
        !container.contains(activeElementAtDispatch) ||
        activeElementAtDispatch.closest('[data-terminal-search-root]')
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const pane = getActivePane()
      if (pane) {
        pasteFromClipboard({ activeElementAtDispatch, pane, source: 'app-menu' })
      }
    }

    container.addEventListener('keydown', onKeyPaste, { capture: true })
    container.addEventListener('paste', onPaste, { capture: true })
    window.addEventListener(APP_MENU_PASTE_EVENT, onAppMenuPaste)
    return () => {
      if (pasteSuppressionTimerId !== null) {
        window.clearTimeout(pasteSuppressionTimerId)
      }
      container.removeEventListener('keydown', onKeyPaste, { capture: true })
      container.removeEventListener('paste', onPaste, { capture: true })
      window.removeEventListener(APP_MENU_PASTE_EVENT, onAppMenuPaste)
    }
  }, [
    containerRef,
    forceBracketedMultilineTextPaste,
    isActive,
    keybindings,
    managerRef,
    paneTransportsRef,
    tabId,
    worktreeId
  ])
}
