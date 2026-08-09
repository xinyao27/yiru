export const WORKSPACE_SIDEBAR_MIN_WIDTH = 220
const MIN_EDITOR_AREA_WIDTH = 320
const FALLBACK_MAX_WIDTH = 2000

export function canFitWorkspaceSidebar(
  workspaceWidth: number | null,
  activityBarWidth: number
): boolean {
  if (workspaceWidth === null || !Number.isFinite(workspaceWidth)) {
    return true
  }
  return workspaceWidth >= MIN_EDITOR_AREA_WIDTH + WORKSPACE_SIDEBAR_MIN_WIDTH + activityBarWidth
}

export function getWorkspaceSidebarMaxWidth(
  windowWidth: number | null,
  activityBarWidth: number
): number {
  if (windowWidth === null || !Number.isFinite(windowWidth)) {
    return FALLBACK_MAX_WIDTH
  }
  return Math.max(
    WORKSPACE_SIDEBAR_MIN_WIDTH,
    windowWidth - MIN_EDITOR_AREA_WIDTH - activityBarWidth
  )
}

export function clampWorkspaceSidebarWidth(
  width: number,
  windowWidth: number | null,
  activityBarWidth: number
): number {
  return Math.min(
    getWorkspaceSidebarMaxWidth(windowWidth, activityBarWidth),
    Math.max(WORKSPACE_SIDEBAR_MIN_WIDTH, width)
  )
}
