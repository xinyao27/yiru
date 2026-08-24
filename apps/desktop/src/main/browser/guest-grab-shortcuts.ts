import { keybindingMatchesAction, type KeybindingOverrides } from '~shared/keybindings'

import { publishShellEvent } from '../shell/events'

type ResolveRenderer = (browserTabId: string) => Electron.WebContents | null

export function setupGrabShortcutForwarding(args: {
  browserTabId: string
  guest: Electron.WebContents
  resolveRenderer: ResolveRenderer
  hasActiveGrabOp: (browserTabId: string) => boolean
  getKeybindings?: () => KeybindingOverrides | undefined
}): () => void {
  const { browserTabId, guest, resolveRenderer, hasActiveGrabOp, getKeybindings } = args
  const handler = (event: Electron.Event, input: Electron.Input): void => {
    if (input.type !== 'keyDown') {
      return
    }
    const bareKey = input.key.toLowerCase()
    if (
      !input.meta &&
      !input.control &&
      !input.alt &&
      !input.shift &&
      (bareKey === 'c' || bareKey === 's') &&
      hasActiveGrabOp(browserTabId)
    ) {
      const renderer = resolveRenderer(browserTabId)
      if (renderer) {
        event.preventDefault()
        publishShellEvent(renderer.id, {
          type: 'browserGrabActionShortcut',
          browserPageId: browserTabId,
          key: bareKey
        })
      }
      return
    }
    if (
      !keybindingMatchesAction('browser.grabElement', input, process.platform, getKeybindings?.())
    ) {
      return
    }

    void guest
      .executeJavaScript(`(() => {
        const active = document.activeElement
        const tag = active?.tagName
        const isEditable =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          active?.isContentEditable === true ||
          tag === 'SELECT' ||
          tag === 'IFRAME'
        if (isEditable) return false
        const selection = window.getSelection()
        return Boolean(selection && selection.type === 'Range' && selection.toString().trim().length > 0)
          ? false
          : true
      })()`)
      .then((shouldToggle) => {
        if (!shouldToggle) {
          return
        }
        event.preventDefault()
        const renderer = resolveRenderer(browserTabId)
        if (renderer) {
          publishShellEvent(renderer.id, {
            type: 'browserGrabModeToggle',
            browserPageId: browserTabId
          })
        }
      })
      .catch(() => {
        // Guest teardown must not break normal copy behavior.
      })
  }
  guest.on('before-input-event', handler)
  return () => {
    try {
      guest.off('before-input-event', handler)
    } catch {
      // Guest teardown is best effort.
    }
  }
}
