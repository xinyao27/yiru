import type { KeybindingOverrides } from '~shared/keybindings'
import {
  ModifierDoubleTapDetector,
  toModifierDoubleTapEvent
} from '~shared/modifier-double-tap-detector'
import {
  isRecentTabSwitcherCommitRelease,
  matchesRecentTabSwitcherChord,
  nativeZoomCommandMatchesKeybindings,
  resolveWindowShortcutAction
} from '~shared/window-shortcut-policy'

import { publishShellEvent } from '../shell/events'
import {
  forwardGuestBrowserPageZoom,
  forwardGuestShortcutInput,
  type GuestShortcutContext,
  type GuestShortcutInput
} from './guest-shortcut-dispatch'
import { consumeRecentGuestWheelZoom } from './guest-zoom-forwarding'

export function setupGuestShortcutForwarding(args: {
  browserTabId: string
  guest: Electron.WebContents
  resolveRenderer: (browserTabId: string) => Electron.WebContents | null
  isMobileEmulatorEnabled?: () => boolean
  getKeybindings?: () => KeybindingOverrides | undefined
}): () => void {
  const { guest } = args
  const context: GuestShortcutContext = args
  let ctrlTabSwitching = false
  const doubleTapDetector = new ModifierDoubleTapDetector()
  const resetDoubleTapDetector = (): void => doubleTapDetector.reset()

  const handler = (event: Electron.Event, input: Electron.Input): void => {
    const keybindings = args.getKeybindings?.()
    if (
      input.type === 'keyDown' &&
      matchesRecentTabSwitcherChord(input, process.platform, keybindings)
    ) {
      event.preventDefault()
      ctrlTabSwitching = true
      const renderer = args.resolveRenderer(args.browserTabId)
      if (renderer) {
        publishShellEvent(renderer.id, {
          type: 'uiCtrlTabKeyDown',
          shiftKey: input.shift === true
        })
      }
      return
    }
    if (ctrlTabSwitching && isRecentTabSwitcherCommitRelease(input)) {
      event.preventDefault()
      ctrlTabSwitching = false
      const renderer = args.resolveRenderer(args.browserTabId)
      if (renderer) {
        publishShellEvent(renderer.id, { type: 'uiCtrlTabKeyUp' })
      }
      return
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
        const doubleTapInput: GuestShortcutInput = { doubleTapModifier: detected.modifier }
        forwardGuestShortcutInput(
          event,
          doubleTapInput,
          context,
          resolveWindowShortcutAction(doubleTapInput, process.platform, keybindings, {
            context: 'app'
          })
        )
        return
      }
    }
    if (input.type !== 'keyDown') {
      return
    }
    forwardGuestShortcutInput(
      event,
      input,
      context,
      resolveWindowShortcutAction(input, process.platform, keybindings)
    )
  }

  const zoomCommandHandler = (
    event: Electron.Event,
    zoomDirection: 'in' | 'out' | 'reset'
  ): void => {
    if (zoomDirection === 'reset') {
      return
    }
    if (consumeRecentGuestWheelZoom(guest, zoomDirection)) {
      event.preventDefault()
      return
    }
    if (
      !nativeZoomCommandMatchesKeybindings(zoomDirection, process.platform, args.getKeybindings?.())
    ) {
      return
    }
    forwardGuestBrowserPageZoom(event, context, zoomDirection)
  }

  guest.on('before-input-event', handler)
  guest.on('zoom-changed', zoomCommandHandler)
  guest.on('blur', resetDoubleTapDetector)
  return () => {
    try {
      guest.off('before-input-event', handler)
      guest.off('zoom-changed', zoomCommandHandler)
      guest.off('blur', resetDoubleTapDetector)
    } catch {
      // Guest teardown is best effort.
    }
  }
}
