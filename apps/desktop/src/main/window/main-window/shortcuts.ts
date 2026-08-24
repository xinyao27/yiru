import { is } from '@electron-toolkit/utils'
import type { BrowserWindow } from 'electron'
import type { Store } from '~main/persistence'
import { publishShellEvent } from '~main/shell/events'
import { normalizeTerminalShortcutPolicy, type KeybindingMatchOptions } from '~shared/keybindings'
import {
  ModifierDoubleTapDetector,
  toModifierDoubleTapEvent
} from '~shared/modifier-double-tap-detector'
import {
  matchesRecentTabSwitcherChord,
  nativeZoomCommandMatchesKeybindings,
  resolveWindowShortcutAction
} from '~shared/window-shortcut-policy'

import type { CreateMainWindowOptions } from './model'
import type { RendererLifecycle } from './renderer-lifecycle'
import { createWindowShortcutDispatcher } from './shortcut-actions'

function isMacAppPasteInput(input: Electron.Input): boolean {
  return (
    process.platform === 'darwin' &&
    input.type === 'keyDown' &&
    input.meta &&
    !input.control &&
    !input.alt &&
    !input.shift &&
    (input.code === 'KeyV' || input.key.toLowerCase() === 'v')
  )
}

export function registerWindowShortcuts(
  mainWindow: BrowserWindow,
  store: Store | null,
  options: CreateMainWindowOptions | undefined,
  renderer: RendererLifecycle
): void {
  const doubleTapDetector = new ModifierDoubleTapDetector()
  const dispatchAction = createWindowShortcutDispatcher(mainWindow, options)

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const focus = renderer.getFocus()
    if (focus.shortcutRecorder) {
      return
    }
    if (input.type === 'keyDown' && is.dev && input.code === 'F12') {
      event.preventDefault()
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools({ mode: 'undocked' })
      }
      return
    }
    if (isMacAppPasteInput(input)) {
      event.preventDefault()
      publishShellEvent(mainWindow.webContents.id, { type: 'uiAppMenuPaste' })
      return
    }

    const keybindings = options?.getKeybindings?.()
    const terminalShortcutContext: KeybindingMatchOptions = {
      context: focus.terminalInput ? 'terminal' : 'app',
      terminalShortcutPolicy: normalizeTerminalShortcutPolicy(
        store?.getSettings().terminalShortcutPolicy
      )
    }
    const appShortcutContext: KeybindingMatchOptions = {
      context: 'app',
      terminalShortcutPolicy: terminalShortcutContext.terminalShortcutPolicy
    }

    if (input.type === 'keyDown' || input.type === 'keyUp') {
      const detected = doubleTapDetector.process(
        toModifierDoubleTapEvent({
          type: input.type,
          code: input.code,
          key: input.key,
          shift: input.shift,
          control: input.control,
          alt: input.alt,
          meta: input.meta,
          isAutoRepeat: input.isAutoRepeat
        }),
        Date.now()
      )
      if (detected) {
        const doubleTapAction = resolveWindowShortcutAction(
          { type: 'keyDown', doubleTapModifier: detected.modifier },
          process.platform,
          keybindings,
          appShortcutContext
        )
        if (
          doubleTapAction &&
          dispatchAction(event, doubleTapAction, {
            isAutoRepeat: false,
            focusedShortcutContext: terminalShortcutContext
          })
        ) {
          return
        }
      }
    }

    if (
      input.type === 'keyDown' &&
      matchesRecentTabSwitcherChord(input, process.platform, keybindings, terminalShortcutContext)
    ) {
      return
    }
    const modForBold = process.platform === 'darwin' ? input.meta : input.control
    if (focus.markdownEditor && input.code === 'KeyB' && !input.alt && !input.shift && modForBold) {
      return
    }

    const action = resolveWindowShortcutAction(
      input,
      process.platform,
      keybindings,
      terminalShortcutContext
    )
    if (!action || input.type !== 'keyDown') {
      return
    }
    dispatchAction(event, action, {
      isAutoRepeat: Boolean(input.isAutoRepeat),
      focusedShortcutContext: terminalShortcutContext
    })
  })

  mainWindow.on('blur', () => doubleTapDetector.reset())
  mainWindow.webContents.on('zoom-changed', (event, zoomDirection) => {
    if (zoomDirection !== 'in' && zoomDirection !== 'out') {
      return
    }
    const focus = renderer.getFocus()
    if (
      !nativeZoomCommandMatchesKeybindings(
        zoomDirection,
        process.platform,
        options?.getKeybindings?.(),
        {
          context: focus.terminalInput ? 'terminal' : 'app',
          terminalShortcutPolicy: normalizeTerminalShortcutPolicy(
            store?.getSettings().terminalShortcutPolicy
          )
        }
      )
    ) {
      return
    }
    event.preventDefault()
    publishShellEvent(mainWindow.webContents.id, {
      type: 'uiTerminalZoom',
      direction: zoomDirection
    })
  })
}
