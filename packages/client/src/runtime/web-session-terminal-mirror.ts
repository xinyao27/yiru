import type { AgentStatusEntry } from '@yiru/workbench-model/agent'
import {
  normalizeCompatibleAgentStatusEntryForOwner,
  normalizeCompatibleAgentTitleForOwner
} from '~shared/agent/title-owner'
import { resolvePaneAgentOwner } from '~shared/pane-agent-owner'
import type { RuntimeMobileSessionTabsResult } from '~shared/runtime-types'
import { isTerminalLeafId, makePaneKey, parsePaneKey } from '~shared/stable-pane-id'
import type { TerminalLayoutSnapshot, TerminalTab } from '~shared/types'

import { toRuntimeTerminalPtyId } from './terminal-stream'
import {
  agentStatusEntryEqual,
  isAgentStatusFresh,
  isMirroredCommandCodeTurnBump
} from './web-session-agent-status-equality'
import type {
  MirroredTerminalTab,
  ReadyTerminalSurface,
  TerminalSurface,
  WebSessionTabsSyncState
} from './web-session-tabs-state'
import { chooseRemoteTerminalLayout, isTerminalSurfaceTab } from './web-session-terminal-layout'
import { isWebTerminalSurfaceTabId, toWebTerminalSurfaceTabId } from './web-terminal-surface-id'

export function buildMirroredTerminalTabs(
  snapshot: RuntimeMobileSessionTabsResult,
  environmentId: string,
  existingById: ReadonlyMap<string, TerminalTab>,
  existingLayoutsByTabId: Readonly<Record<string, TerminalLayoutSnapshot>>,
  sortOffset: number,
  now: number
): MirroredTerminalTab[] {
  const groups = new Map<string, TerminalSurface[]>()
  for (const tab of snapshot.tabs.filter(isTerminalSurfaceTab)) {
    const group = groups.get(tab.parentTabId) ?? []
    group.push(tab)
    groups.set(tab.parentTabId, group)
  }

  return [...groups.entries()].map(([parentTabId, surfaces], index) => {
    const localTabId = toWebTerminalSurfaceTabId(parentTabId)
    const existingLayout = existingLayoutsByTabId[localTabId]
    const activeSurface =
      (existingLayout?.activeLeafId
        ? surfaces.find((surface) => surface.leafId === existingLayout.activeLeafId)
        : undefined) ??
      surfaces.find((surface) => surface.isActive) ??
      surfaces[0]!
    const ptyIdsByLeafId = Object.fromEntries(
      surfaces
        .filter((surface): surface is ReadyTerminalSurface => surface.status === 'ready')
        .map((surface) => [surface.leafId, toRuntimeTerminalPtyId(surface.terminal, environmentId)])
    )
    const ptyIds = surfaces
      .map((surface) => ptyIdsByLeafId[surface.leafId]!)
      .filter((ptyId): ptyId is string => typeof ptyId === 'string' && ptyId.length > 0)
    const launchAgent =
      activeSurface.launchAgent ?? surfaces.find((surface) => surface.launchAgent)?.launchAgent
    const ownerAgent = resolvePaneAgentOwner({
      launchAgent,
      hookAgent: activeSurface.agentStatus?.agentType,
      siblingHookAgent: surfaces.find((surface) => surface.agentStatus?.agentType)?.agentStatus
        ?.agentType
    })
    const title = normalizeCompatibleAgentTitleForOwner(
      activeSurface.title.trim() || surfaces[0]?.title.trim() || 'Terminal',
      ownerAgent
    )
    const existing =
      existingById.get(localTabId) ??
      existingById.get(parentTabId) ??
      surfaces
        .map((surface) => existingById.get(toWebTerminalSurfaceTabId(surface.id)))
        .find((tab): tab is TerminalTab => Boolean(tab))
    const quickCommandLabel =
      activeSurface.quickCommandLabel?.trim() ||
      surfaces.find((surface) => surface.quickCommandLabel?.trim())?.quickCommandLabel?.trim() ||
      existing?.quickCommandLabel?.trim()
    // Why: startup cwd is host-owned launch metadata; once the host omits it,
    // mirrored clients must not resurrect stale subdirectory intent.
    const startupCwd =
      activeSurface.startupCwd || surfaces.find((surface) => surface.startupCwd)?.startupCwd
    // Why: tab color/pin echo back through host snapshots, so prefer the client's
    // own record (kept authoritative in tabsByWorktree by the pin/color setters)
    // and fall back to the host value only when this client has no prior tab —
    // e.g. first reconcile or a change made on another client. Mirrors how
    // customTitle always prefers the client value to avoid echo-window reverts.
    const hostColorSurface = surfaces.find((surface) => surface.color != null)
    const color = existing ? (existing.color ?? null) : (hostColorSurface?.color ?? null)
    const isPinned = existing
      ? existing.isPinned === true
      : surfaces.some((surface) => surface.isPinned)
    return {
      tab: {
        id: localTabId,
        ptyId: ptyIdsByLeafId[activeSurface.leafId] ?? null,
        worktreeId: snapshot.worktree,
        title,
        defaultTitle: existing?.defaultTitle ?? title,
        ...(quickCommandLabel ? { quickCommandLabel } : {}),
        ...(startupCwd ? { startupCwd } : {}),
        customTitle: existing?.customTitle ?? null,
        color,
        isPinned,
        sortOrder: sortOffset + index,
        createdAt: existing?.createdAt ?? now + index,
        // Why: launchAgent is host-owned lifecycle metadata. If the host stops
        // publishing it, mirrored clients must not resurrect stale startup intent.
        ...(launchAgent ? { launchAgent } : {})
      },
      hostTabId: parentTabId,
      ptyIds,
      layout: chooseRemoteTerminalLayout(surfaces, ptyIdsByLeafId, existingLayout)
    }
  })
}

function toMirroredPaneKey(surface: TerminalSurface): string | null {
  if (!isTerminalLeafId(surface.leafId)) {
    return null
  }
  return makePaneKey(toWebTerminalSurfaceTabId(surface.parentTabId), surface.leafId)
}

/**
 * Normalises and mirrors agent status updates from the host payload,
 * preserving authoritative ownership metadata.
 */
function remapHostAgentStatus(surface: TerminalSurface): AgentStatusEntry | null {
  if (!surface.agentStatus) {
    return null
  }
  const paneKey = toMirroredPaneKey(surface)
  if (!paneKey) {
    return null
  }
  const ownerAgent = resolvePaneAgentOwner({
    launchAgent: surface.launchAgent,
    hookAgent: surface.agentStatus.agentType
  })
  return {
    ...normalizeCompatibleAgentStatusEntryForOwner(surface.agentStatus, ownerAgent),
    paneKey
  }
}

function isMirroredAgentPaneKeyForTabs(paneKey: string, tabIds: ReadonlySet<string>): boolean {
  const parsed = parsePaneKey(paneKey)
  return parsed !== null && tabIds.has(parsed.tabId)
}

/**
 * Generates a state patch for mirrored agent statuses, merging host
 * status entries with client overrides defensively.
 */
export function buildMirroredAgentStatusPatch(
  state: WebSessionTabsSyncState,
  currentTerminalTabs: readonly TerminalTab[],
  terminalSurfaceTabs: readonly TerminalSurface[],
  now: number
): Pick<WebSessionTabsSyncState, 'agentStatusByPaneKey' | 'agentStatusEpoch' | 'sortEpoch'> | null {
  const mirroredTabIds = new Set<string>()
  for (const tab of currentTerminalTabs) {
    if (isWebTerminalSurfaceTabId(tab.id)) {
      mirroredTabIds.add(tab.id)
    }
  }
  for (const surface of terminalSurfaceTabs) {
    mirroredTabIds.add(toWebTerminalSurfaceTabId(surface.parentTabId))
  }

  if (mirroredTabIds.size === 0) {
    return null
  }

  const nextByPaneKey = new Map<string, AgentStatusEntry>()
  for (const surface of terminalSurfaceTabs) {
    const entry = remapHostAgentStatus(surface)
    if (!entry) {
      continue
    }
    const existing = state.agentStatusByPaneKey[entry.paneKey]
    // Why: active web streams can report a fresher OSC 9999 status for the same
    // mirrored pane before the next host snapshot arrives. Do not rewind that
    // row with an older host publication.
    const nextEntry =
      existing && existing.updatedAt > entry.updatedAt
        ? normalizeCompatibleAgentStatusEntryForOwner(existing, entry.agentType)
        : entry
    nextByPaneKey.set(entry.paneKey, nextEntry)
  }

  let nextAgentStatusByPaneKey = state.agentStatusByPaneKey
  let changed = false
  let aggregateRelevantChange = false
  let sortRelevantChange = false

  for (const paneKey of Object.keys(state.agentStatusByPaneKey)) {
    if (!isMirroredAgentPaneKeyForTabs(paneKey, mirroredTabIds)) {
      continue
    }
    if (nextByPaneKey.has(paneKey)) {
      continue
    }
    if (nextAgentStatusByPaneKey === state.agentStatusByPaneKey) {
      nextAgentStatusByPaneKey = { ...state.agentStatusByPaneKey }
    }
    delete nextAgentStatusByPaneKey[paneKey]
    changed = true
    aggregateRelevantChange = true
    sortRelevantChange = true
  }

  for (const [paneKey, entry] of nextByPaneKey) {
    const existing = nextAgentStatusByPaneKey[paneKey]
    if (agentStatusEntryEqual(existing, entry)) {
      continue
    }
    if (nextAgentStatusByPaneKey === state.agentStatusByPaneKey) {
      nextAgentStatusByPaneKey = { ...state.agentStatusByPaneKey }
    }
    nextAgentStatusByPaneKey[paneKey] = entry
    changed = true
    const entryAttributionChanged =
      existing?.worktreeId !== entry.worktreeId || existing?.tabId !== entry.tabId
    const entrySortRelevantChange =
      !existing ||
      existing.state !== entry.state ||
      !isAgentStatusFresh(existing, now) ||
      entryAttributionChanged ||
      isMirroredCommandCodeTurnBump(existing, entry)
    aggregateRelevantChange = aggregateRelevantChange || entrySortRelevantChange
    sortRelevantChange = sortRelevantChange || entrySortRelevantChange
  }

  if (!changed) {
    return null
  }

  return {
    agentStatusByPaneKey: nextAgentStatusByPaneKey,
    agentStatusEpoch: aggregateRelevantChange ? state.agentStatusEpoch + 1 : state.agentStatusEpoch,
    sortEpoch: sortRelevantChange ? state.sortEpoch + 1 : state.sortEpoch
  }
}
