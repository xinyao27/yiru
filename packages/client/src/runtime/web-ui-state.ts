import { getDefaultUIState } from '~shared/constants'
import {
  normalizeAgentActivityDisplayMode,
  normalizeWorkspacePanelTitlebarPinnedIds,
  normalizeWorktreeCardProperties
} from '~shared/constants'
import { normalizeContextualTourIds, type ContextualTourId } from '~shared/contextual-tours'
import {
  normalizeFeatureInteractions,
  type FeatureInteractionId,
  type FeatureInteractionState
} from '~shared/feature-interactions'
import { normalizeStatusBarUsageMode } from '~shared/status-bar-usage-mode'
import type { PersistedUIState } from '~shared/types'
import { normalizeUsagePercentageDisplay } from '~shared/usage-percentage-display'

const UI_STORAGE_KEY = 'yiru.web.ui.v1'
const SETTINGS_STORAGE_KEY = 'yiru.web.settings.v1'

function readStoredRightSidebarDefault(): boolean | undefined {
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
  if (!raw) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return undefined
    }
    const value = Reflect.get(parsed, 'rightSidebarOpenByDefault')
    return typeof value === 'boolean' ? value : undefined
  } catch {
    return undefined
  }
}

function readStoredUIState(): Partial<PersistedUIState> {
  const raw = window.localStorage.getItem(UI_STORAGE_KEY)
  if (!raw) {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Partial<PersistedUIState>) : {}
  } catch {
    return {}
  }
}

export function readWebUIState(): PersistedUIState {
  const defaults = getDefaultUIState()
  const stored = readStoredUIState()
  if (typeof stored.rightSidebarOpen === 'boolean') {
    return mergeWebUIState(defaults, stored)
  }
  return mergeWebUIState(defaults, {
    ...stored,
    // Why: web has no main-process hydration pass for this retired setting.
    rightSidebarOpen: readStoredRightSidebarDefault() ?? defaults.rightSidebarOpen
  })
}

export function writeWebUIState(state: PersistedUIState): void {
  window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(state))
}

export function mergeWebUIState(
  base: PersistedUIState,
  updates: Partial<PersistedUIState>
): PersistedUIState {
  const {
    featureInteractionTelemetryBuckets: _reserved,
    _worktreeCardModeDefaulted: _retiredCardModeMarker,
    ...safeUpdates
  } = updates as Partial<PersistedUIState> & {
    featureInteractionTelemetryBuckets?: unknown
    _worktreeCardModeDefaulted?: unknown
  }
  void _reserved
  void _retiredCardModeMarker
  return {
    ...base,
    ...safeUpdates,
    worktreeCardProperties: normalizeWorktreeCardProperties(
      safeUpdates.worktreeCardProperties ?? base.worktreeCardProperties
    ),
    workspacePanelTitlebarPinnedIds: normalizeWorkspacePanelTitlebarPinnedIds(
      safeUpdates.workspacePanelTitlebarPinnedIds ?? base.workspacePanelTitlebarPinnedIds
    ),
    agentActivityDisplayMode: normalizeAgentActivityDisplayMode(
      safeUpdates.agentActivityDisplayMode ?? base.agentActivityDisplayMode
    ),
    usagePercentageDisplay: normalizeUsagePercentageDisplay(
      safeUpdates.usagePercentageDisplay ?? base.usagePercentageDisplay
    ),
    statusBarUsageMode: normalizeStatusBarUsageMode(
      safeUpdates.statusBarUsageMode ?? base.statusBarUsageMode
    )
  }
}

export function mergeWebFeatureInteractionState(
  current: PersistedUIState['featureInteractions'],
  incoming: PersistedUIState['featureInteractions']
): FeatureInteractionState {
  const currentNormalized = normalizeFeatureInteractions(current)
  const incomingNormalized = normalizeFeatureInteractions(incoming)
  const merged: FeatureInteractionState = { ...currentNormalized }
  for (const [id, incomingRecord] of Object.entries(incomingNormalized)) {
    const featureId = id as FeatureInteractionId
    const currentRecord = currentNormalized[featureId]
    merged[featureId] = currentRecord
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

export function mergeWebContextualTourSeenIds(
  current: PersistedUIState['contextualToursSeenIds'],
  incoming: PersistedUIState['contextualToursSeenIds']
): ContextualTourId[] {
  const merged = new Set<ContextualTourId>(normalizeContextualTourIds(current))
  for (const id of normalizeContextualTourIds(incoming)) {
    merged.add(id)
  }
  return [...merged]
}
