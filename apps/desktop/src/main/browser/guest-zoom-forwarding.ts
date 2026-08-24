import type { BrowserPageZoomDirection } from '~shared/browser/page-zoom'

import { publishShellEvent } from '../shell/events'

type ResolveRenderer = (browserTabId: string) => Electron.WebContents | null
type GuestWheelZoomDirection = Exclude<BrowserPageZoomDirection, 'reset'>

const CONTROL_MODIFIERS = new Set(['control', 'ctrl'])
const MAC_COMMAND_MODIFIERS = new Set(['meta', 'command', 'cmd'])
const WHEEL_ZOOM_BLOCKING_MODIFIERS = new Set(['alt', 'shift'])
const GUEST_WHEEL_ZOOM_DEDUPE_MS = 250
const recentGuestWheelZoomByGuest = new WeakMap<
  Electron.WebContents,
  { direction: GuestWheelZoomDirection; at: number }
>()

function hasModifier(mouse: Electron.MouseInputEvent, modifiers: ReadonlySet<string>): boolean {
  return mouse.modifiers?.some((modifier) => modifiers.has(modifier)) ?? false
}

export function resolveGuestMouseWheelZoomDirection(
  mouse: Electron.MouseInputEvent,
  platform: NodeJS.Platform = process.platform
): GuestWheelZoomDirection | null {
  if (
    mouse.type !== 'mouseWheel' ||
    hasModifier(mouse, WHEEL_ZOOM_BLOCKING_MODIFIERS) ||
    (!hasModifier(mouse, CONTROL_MODIFIERS) &&
      (platform !== 'darwin' || !hasModifier(mouse, MAC_COMMAND_MODIFIERS)))
  ) {
    return null
  }
  const deltaY = (mouse as Electron.MouseWheelInputEvent).deltaY
  return typeof deltaY !== 'number' || deltaY === 0 ? null : deltaY < 0 ? 'in' : 'out'
}

export function consumeRecentGuestWheelZoom(
  guest: Electron.WebContents,
  direction: GuestWheelZoomDirection
): boolean {
  const recent = recentGuestWheelZoomByGuest.get(guest)
  if (!recent) {
    return false
  }
  const elapsed = Date.now() - recent.at
  if (elapsed < 0 || elapsed > GUEST_WHEEL_ZOOM_DEDUPE_MS) {
    recentGuestWheelZoomByGuest.delete(guest)
    return false
  }
  if (recent.direction !== direction) {
    return false
  }
  recentGuestWheelZoomByGuest.delete(guest)
  return true
}

export function setupGuestMouseWheelZoomForwarding(args: {
  browserTabId: string
  guest: Electron.WebContents
  resolveRenderer: ResolveRenderer
}): () => void {
  const { browserTabId, guest, resolveRenderer } = args
  const handler = (event: Electron.Event, mouse: Electron.MouseInputEvent): void => {
    const direction = resolveGuestMouseWheelZoomDirection(mouse)
    if (!direction) {
      return
    }
    event.preventDefault()
    recentGuestWheelZoomByGuest.set(guest, { direction, at: Date.now() })
    const renderer = resolveRenderer(browserTabId)
    if (renderer) {
      publishShellEvent(renderer.id, { type: 'uiZoomBrowserPage', direction })
    }
  }
  guest.on('before-mouse-event', handler)
  return () => {
    try {
      guest.off('before-mouse-event', handler)
    } catch {
      // Guest teardown is best effort.
    }
  }
}
