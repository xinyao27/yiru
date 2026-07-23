import { getDefaultUIState } from '../../shared/constants'
import { normalizeContextualTourIds } from '../../shared/contextual-tours'
import { normalizeFeatureInteractions } from '../../shared/feature-interactions'
import type { PersistedState } from '../../shared/types'

export function normalizePersistedGroupBy(groupBy: unknown): PersistedState['ui']['groupBy'] {
  if (
    groupBy === 'none' ||
    groupBy === 'workspace-status' ||
    groupBy === 'repo' ||
    groupBy === 'pr-status'
  ) {
    return groupBy
  }
  return groupBy === 'flat' ? 'none' : getDefaultUIState().groupBy
}

export function normalizePersistedShowDotfiles(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const normalized: Record<string, boolean> = {}
  for (const [worktreeId, showDotfiles] of Object.entries(value as Record<string, unknown>)) {
    if (
      !worktreeId ||
      worktreeId === '__proto__' ||
      worktreeId === 'constructor' ||
      worktreeId === 'prototype' ||
      typeof showDotfiles !== 'boolean'
    ) {
      continue
    }
    normalized[worktreeId] = showDotfiles
  }
  return normalized
}

export function mergePersistedFeatureInteractions(
  current: PersistedState['ui']['featureInteractions'],
  incoming: PersistedState['ui']['featureInteractions']
): PersistedState['ui']['featureInteractions'] {
  const currentNormalized = normalizeFeatureInteractions(current)
  const incomingNormalized = normalizeFeatureInteractions(incoming)
  const merged = { ...currentNormalized }
  for (const [id, incomingRecord] of Object.entries(incomingNormalized)) {
    const currentRecord = currentNormalized[id as keyof typeof currentNormalized]
    merged[id as keyof typeof merged] = currentRecord
      ? {
          firstInteractedAt: Math.min(
            currentRecord.firstInteractedAt,
            incomingRecord.firstInteractedAt
          ),
          interactionCount: Math.max(
            currentRecord.interactionCount,
            incomingRecord.interactionCount
          )
        }
      : incomingRecord
  }
  return merged
}

export function mergePersistedContextualTours(
  current: PersistedState['ui']['contextualToursSeenIds'],
  incoming: PersistedState['ui']['contextualToursSeenIds']
): PersistedState['ui']['contextualToursSeenIds'] {
  const merged = new Set(normalizeContextualTourIds(current))
  for (const id of normalizeContextualTourIds(incoming)) {
    merged.add(id)
  }
  return [...merged]
}

export function stripReservedPersistedUiState(
  value: Partial<PersistedState['ui']> | undefined
): Partial<PersistedState['ui']> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const {
    featureInteractionTelemetryBuckets: _reserved,
    _worktreeCardModeDefaulted: _retiredCardMarker,
    ...ui
  } = value as Partial<PersistedState['ui']> & {
    featureInteractionTelemetryBuckets?: unknown
    _worktreeCardModeDefaulted?: unknown
  }
  void _reserved
  void _retiredCardMarker
  return ui
}

export function normalizePersistedSortBy(sortBy: unknown): PersistedState['ui']['sortBy'] {
  return sortBy === 'smart' ||
    sortBy === 'recent' ||
    sortBy === 'repo' ||
    sortBy === 'name' ||
    sortBy === 'manual'
    ? sortBy
    : getDefaultUIState().sortBy
}

export function normalizePersistedProjectOrderBy(
  projectOrderBy: unknown
): PersistedState['ui']['projectOrderBy'] {
  return projectOrderBy === 'manual' || projectOrderBy === 'recent'
    ? projectOrderBy
    : getDefaultUIState().projectOrderBy
}

export function normalizePersistedRightSidebarTab(
  tab: unknown
): PersistedState['ui']['rightSidebarTab'] {
  return tab === 'explorer' ||
    tab === 'search' ||
    tab === 'vault' ||
    tab === 'workspaces' ||
    tab === 'source-control' ||
    tab === 'checks' ||
    tab === 'ports'
    ? tab
    : getDefaultUIState().rightSidebarTab
}

export function normalizePersistedRightSidebarExplorerView(
  view: unknown,
  tab?: unknown
): PersistedState['ui']['rightSidebarExplorerView'] {
  // Why: older builds persisted Search as a standalone activity tab.
  if (tab === 'search') {
    return 'search'
  }
  return view === 'files' || view === 'search' ? view : getDefaultUIState().rightSidebarExplorerView
}
