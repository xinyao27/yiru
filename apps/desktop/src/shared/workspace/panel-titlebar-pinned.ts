import type { WorkspaceTitlebarActionId } from '../types'
import { isWorkspacePanelTabContentType } from './panel-tab'

export type { WorkspaceTitlebarActionId } from '../types'

export const WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID = 'open-in' as const
export const WORKSPACE_TITLEBAR_COMMANDS_ACTION_ID = 'commands' as const

// Why: default pins keep Open in visible; Command stays in More until pinned.
export const DEFAULT_WORKSPACE_PANEL_TITLEBAR_PINNED_IDS: readonly WorkspaceTitlebarActionId[] = [
  'explorer',
  'source-control',
  'vault',
  WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID
]

export function isWorkspaceTitlebarActionId(value: string): value is WorkspaceTitlebarActionId {
  return (
    value === WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID ||
    value === WORKSPACE_TITLEBAR_COMMANDS_ACTION_ID ||
    isWorkspacePanelTabContentType(value)
  )
}

export function normalizeWorkspacePanelTitlebarPinnedIds(
  ids: readonly unknown[] | null | undefined
): WorkspaceTitlebarActionId[] {
  const source = ids ?? DEFAULT_WORKSPACE_PANEL_TITLEBAR_PINNED_IDS
  const normalized: WorkspaceTitlebarActionId[] = []
  for (const value of source) {
    if (typeof value !== 'string') {
      continue
    }
    // Why: Checks used to be a standalone titlebar panel. Preserve its pin
    // position while migrating it to the combined Changes & Review panel.
    const id = value === 'checks' ? 'source-control' : value
    if (!isWorkspaceTitlebarActionId(id)) {
      continue
    }
    if (normalized.includes(id)) {
      continue
    }
    normalized.push(id)
  }

  // Why: builds that only persisted panel ids omitted Open in; append it once so
  // upgrades keep the previous always-on Open in placement at the strip end.
  if (
    ids != null &&
    !normalized.includes(WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID) &&
    !ids.includes(WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID)
  ) {
    normalized.push(WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID)
  }

  return normalized
}

export function splitWorkspacePanelTitlebarItems<T extends { id: WorkspaceTitlebarActionId }>(
  items: readonly T[],
  pinnedIds: readonly WorkspaceTitlebarActionId[]
): { visibleItems: T[]; overflowItems: T[] } {
  const byId = new Map(items.map((item) => [item.id, item]))
  const visibleItems: T[] = []
  for (const id of pinnedIds) {
    const item = byId.get(id)
    if (!item) {
      continue
    }
    visibleItems.push(item)
  }

  // Why: when every persisted pin is filtered out (folder vs git catalog shift),
  // seed from catalog order so the strip is not accidentally empty on first paint.
  if (visibleItems.length === 0 && pinnedIds.length > 0) {
    visibleItems.push(...items)
  }

  const visibleIds = new Set(visibleItems.map((item) => item.id))
  return {
    visibleItems,
    overflowItems: items.filter((item) => !visibleIds.has(item.id))
  }
}

export function pinWorkspacePanelTitlebarItem(
  pinnedIds: readonly WorkspaceTitlebarActionId[],
  itemId: WorkspaceTitlebarActionId,
  insertIndex: number = pinnedIds.length
): WorkspaceTitlebarActionId[] {
  const without = pinnedIds.filter((id) => id !== itemId)
  const clampedIndex = Math.max(0, Math.min(insertIndex, without.length))
  return [...without.slice(0, clampedIndex), itemId, ...without.slice(clampedIndex)]
}

export function unpinWorkspacePanelTitlebarItem(
  pinnedIds: readonly WorkspaceTitlebarActionId[],
  itemId: WorkspaceTitlebarActionId
): WorkspaceTitlebarActionId[] {
  return pinnedIds.filter((id) => id !== itemId)
}

export function reorderWorkspacePanelTitlebarPinnedIds(
  pinnedIds: readonly WorkspaceTitlebarActionId[],
  itemId: WorkspaceTitlebarActionId,
  beforeIndex: number
): WorkspaceTitlebarActionId[] {
  const fromIndex = pinnedIds.indexOf(itemId)
  if (fromIndex < 0) {
    return [...pinnedIds]
  }
  const without = pinnedIds.filter((id) => id !== itemId)
  // Why: beforeIndex is a gap in the pre-removal list (0..length); removing an
  // item to the left of that gap shifts the insert point down by one.
  let insertAt = beforeIndex
  if (fromIndex < beforeIndex) {
    insertAt -= 1
  }
  const clampedIndex = Math.max(0, Math.min(insertAt, without.length))
  return [...without.slice(0, clampedIndex), itemId, ...without.slice(clampedIndex)]
}
