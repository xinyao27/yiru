export type GlobalAssistantPanelBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type GlobalAssistantResizeDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

const STORAGE_KEY = 'yiru.global-assistant.bounds.v1'
const MIN_WIDTH = 480
const MIN_HEIGHT = 360
const VIEWPORT_MARGIN = 12
const TOP_MARGIN = 40

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function clampGlobalAssistantPanelBounds(
  bounds: GlobalAssistantPanelBounds,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight
): GlobalAssistantPanelBounds {
  const availableWidth = Math.max(320, viewportWidth - VIEWPORT_MARGIN * 2)
  const availableHeight = Math.max(260, viewportHeight - TOP_MARGIN - VIEWPORT_MARGIN)
  const minWidth = Math.min(MIN_WIDTH, availableWidth)
  const minHeight = Math.min(MIN_HEIGHT, availableHeight)
  const width = Math.min(availableWidth, Math.max(minWidth, bounds.width))
  const height = Math.min(availableHeight, Math.max(minHeight, bounds.height))
  return {
    width,
    height,
    x: Math.min(viewportWidth - VIEWPORT_MARGIN - width, Math.max(VIEWPORT_MARGIN, bounds.x)),
    y: Math.min(viewportHeight - VIEWPORT_MARGIN - height, Math.max(TOP_MARGIN, bounds.y))
  }
}

export function getDefaultGlobalAssistantPanelBounds(): GlobalAssistantPanelBounds {
  const width = Math.min(780, Math.max(320, window.innerWidth - VIEWPORT_MARGIN * 2))
  const height = Math.min(640, Math.max(260, window.innerHeight - TOP_MARGIN - VIEWPORT_MARGIN))
  return clampGlobalAssistantPanelBounds({
    width,
    height,
    x: (window.innerWidth - width) / 2,
    y: Math.max(TOP_MARGIN, (window.innerHeight - height) / 2)
  })
}

export function readGlobalAssistantPanelBounds(): GlobalAssistantPanelBounds {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? ''
    ) as Partial<GlobalAssistantPanelBounds>
    if (
      isFiniteNumber(parsed.x) &&
      isFiniteNumber(parsed.y) &&
      isFiniteNumber(parsed.width) &&
      isFiniteNumber(parsed.height)
    ) {
      return clampGlobalAssistantPanelBounds(parsed as GlobalAssistantPanelBounds)
    }
  } catch {
    // Corrupt or unavailable storage falls back to a safe centered panel.
  }
  return getDefaultGlobalAssistantPanelBounds()
}

export function persistGlobalAssistantPanelBounds(bounds: GlobalAssistantPanelBounds): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bounds))
  } catch {
    // Persistence is optional; dragging and resizing still work for this window.
  }
}

export function resizeGlobalAssistantPanelBounds(
  start: GlobalAssistantPanelBounds,
  direction: GlobalAssistantResizeDirection,
  deltaX: number,
  deltaY: number
): GlobalAssistantPanelBounds {
  const east = direction.includes('e')
  const west = direction.includes('w')
  const north = direction.includes('n')
  const south = direction.includes('s')
  const availableWidth = Math.max(320, window.innerWidth - VIEWPORT_MARGIN * 2)
  const availableHeight = Math.max(260, window.innerHeight - TOP_MARGIN - VIEWPORT_MARGIN)
  const minWidth = Math.min(MIN_WIDTH, availableWidth)
  const minHeight = Math.min(MIN_HEIGHT, availableHeight)
  const maxWidth = west
    ? start.x + start.width - VIEWPORT_MARGIN
    : window.innerWidth - VIEWPORT_MARGIN - start.x
  const maxHeight = north
    ? start.y + start.height - TOP_MARGIN
    : window.innerHeight - VIEWPORT_MARGIN - start.y
  const desiredWidth = east ? start.width + deltaX : west ? start.width - deltaX : start.width
  const desiredHeight = south ? start.height + deltaY : north ? start.height - deltaY : start.height
  const width = Math.min(Math.max(minWidth, maxWidth), Math.max(minWidth, desiredWidth))
  const height = Math.min(Math.max(minHeight, maxHeight), Math.max(minHeight, desiredHeight))
  return clampGlobalAssistantPanelBounds({
    width,
    height,
    x: west ? start.x + start.width - width : start.x,
    y: north ? start.y + start.height - height : start.y
  })
}
