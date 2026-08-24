import type { BrowserPageZoomDirection } from '~shared/browser/page-zoom'
import { keybindingMatchesAction, type KeybindingOverrides } from '~shared/keybindings'
import {
  resolveWindowShortcutAction,
  type WindowShortcutInput
} from '~shared/window-shortcut-policy'

import { publishShellEvent } from '../shell/events'

export type GuestShortcutInput = WindowShortcutInput & { isAutoRepeat?: boolean }
export type GuestShortcutContext = {
  browserTabId: string
  getKeybindings?: () => KeybindingOverrides | undefined
  isMobileEmulatorEnabled?: () => boolean
  resolveRenderer: (browserTabId: string) => Electron.WebContents | null
}

type ShellEvent = Parameters<typeof publishShellEvent>[1]

function publishGuestEvent(
  event: Electron.Event,
  context: GuestShortcutContext,
  payload: ShellEvent
): boolean {
  event.preventDefault()
  const renderer = context.resolveRenderer(context.browserTabId)
  if (renderer) {
    publishShellEvent(renderer.id, payload)
  }
  return true
}

export function forwardGuestBrowserPageZoom(
  event: Electron.Event,
  context: GuestShortcutContext,
  direction: BrowserPageZoomDirection
): void {
  publishGuestEvent(event, context, { type: 'uiZoomBrowserPage', direction })
}

function matchingDirection(
  input: GuestShortcutInput,
  keybindings: KeybindingOverrides | undefined,
  nextAction: 'tab.nextAllTypes' | 'tab.nextTerminal',
  previousAction: 'tab.previousAllTypes' | 'tab.previousTerminal'
): 1 | -1 | null {
  if (keybindingMatchesAction(nextAction, input, process.platform, keybindings)) {
    return 1
  }
  return keybindingMatchesAction(previousAction, input, process.platform, keybindings) ? -1 : null
}

export function forwardGuestShortcutInput(
  event: Electron.Event,
  input: GuestShortcutInput,
  context: GuestShortcutContext,
  action = resolveWindowShortcutAction(input, process.platform, context.getKeybindings?.())
): boolean {
  const keybindings = context.getKeybindings?.()
  if (action?.type === 'zoom') {
    forwardGuestBrowserPageZoom(event, context, action.direction)
    return true
  }
  if (input.isAutoRepeat) {
    return false
  }
  if (action?.type === 'worktreeHistoryNavigate') {
    return publishGuestEvent(event, context, {
      type: 'uiWorktreeHistoryNavigate',
      direction: action.direction
    })
  }
  const allTypesDirection = matchingDirection(
    input,
    keybindings,
    'tab.nextAllTypes',
    'tab.previousAllTypes'
  )
  if (allTypesDirection !== null) {
    return publishGuestEvent(event, context, {
      type: 'uiSwitchTabAcrossAllTypes',
      direction: allTypesDirection
    })
  }
  if (keybindingMatchesAction('tab.previousRecent', input, process.platform, keybindings)) {
    return publishGuestEvent(event, context, { type: 'uiSwitchRecentTab' })
  }
  const terminalDirection = matchingDirection(
    input,
    keybindings,
    'tab.nextTerminal',
    'tab.previousTerminal'
  )
  if (terminalDirection !== null) {
    return publishGuestEvent(event, context, {
      type: 'uiSwitchTerminalTab',
      direction: terminalDirection
    })
  }

  const renderer = context.resolveRenderer(context.browserTabId)
  if (!renderer) {
    return false
  }
  let payload: ShellEvent | null = null
  if (keybindingMatchesAction('tab.newBrowser', input, process.platform, keybindings)) {
    payload = { type: 'uiNewBrowserTab' }
  } else if (
    process.platform === 'darwin' &&
    (context.isMobileEmulatorEnabled?.() ?? true) &&
    keybindingMatchesAction('tab.newSimulator', input, process.platform, keybindings)
  ) {
    payload = { type: 'uiNewSimulatorTab' }
  } else if (keybindingMatchesAction('tab.newMarkdown', input, process.platform, keybindings)) {
    payload = { type: 'uiNewMarkdownTab' }
  } else if (keybindingMatchesAction('tab.newTerminal', input, process.platform, keybindings)) {
    payload = { type: 'uiNewTerminalTab' }
  } else if (
    keybindingMatchesAction('browser.focusAddressBar', input, process.platform, keybindings)
  ) {
    payload = { type: 'uiFocusBrowserAddressBar' }
  } else if (keybindingMatchesAction('browser.hardReload', input, process.platform, keybindings)) {
    payload = { type: 'uiHardReloadBrowserPage' }
  } else if (keybindingMatchesAction('browser.reload', input, process.platform, keybindings)) {
    payload = { type: 'uiReloadBrowserPage' }
  } else if (keybindingMatchesAction('browser.find', input, process.platform, keybindings)) {
    payload = { type: 'uiFindInBrowserPage' }
  } else if (keybindingMatchesAction('browser.back', input, process.platform, keybindings)) {
    payload = { type: 'uiBrowserHistoryNavigate', direction: 'back' }
  } else if (keybindingMatchesAction('browser.forward', input, process.platform, keybindings)) {
    payload = { type: 'uiBrowserHistoryNavigate', direction: 'forward' }
  } else if (keybindingMatchesAction('tab.close', input, process.platform, keybindings)) {
    payload = { type: 'uiCloseActiveTab' }
  } else if (keybindingMatchesAction('tab.nextSameType', input, process.platform, keybindings)) {
    payload = { type: 'uiSwitchTab', direction: 1 }
  } else if (
    keybindingMatchesAction('tab.previousSameType', input, process.platform, keybindings)
  ) {
    payload = { type: 'uiSwitchTab', direction: -1 }
  } else if (action?.type === 'toggleWorktreePalette') {
    payload = { type: 'uiToggleWorktreePalette' }
  } else if (action?.type === 'openQuickOpen') {
    payload = { type: 'uiOpenQuickOpen' }
  } else if (action?.type === 'toggleQuickCommandsMenu') {
    payload = { type: 'uiToggleQuickCommandsMenu' }
  } else if (action?.type === 'openNewWorkspace') {
    payload = { type: 'uiOpenNewWorkspace' }
  } else if (action?.type === 'openSettings') {
    payload = { type: 'uiOpenSettings' }
  } else if (action?.type === 'forceReload') {
    renderer.reloadIgnoringCache()
  } else if (action?.type === 'jumpToWorktreeIndex') {
    payload = { type: 'uiJumpToWorktreeIndex', index: action.index }
  } else if (action?.type === 'jumpToTabIndex') {
    payload = { type: 'uiJumpToTabIndex', index: action.index }
  } else {
    return false
  }
  if (payload) {
    publishShellEvent(renderer.id, payload)
  }
  // Why: prevent the guest page from also processing an app-owned chord.
  event.preventDefault()
  return true
}
