import { randomUUID } from 'node:crypto'

import type { MigrationUnsupportedPtyEntry } from '@yiru/workbench-model/agent'
import { isTerminalLeafId, makePaneKey, parsePaneKey } from '~shared/stable-pane-id'
import type {
  LegacyPaneKeyAliasEntry,
  TerminalLayoutSnapshot,
  WorkspaceSessionState
} from '~shared/types'

import { agentHookServer } from './agent-hooks/server'
import { normalizePersistedMigrationUnsupportedPtyEntries as normalizeMigrationUnsupportedPtyEntries } from './persisted-state/persisted-terminal-session-codec'
import type {
  LayoutLeafNormalization,
  PaneIdentityMigrationEntries
} from './persistence-layout-tree'
import {
  collectLayoutLeafCounts,
  collectLayoutLeafIdsInOrder,
  firstLayoutLeafId,
  cloneLayoutNode,
  cloneLayoutWithLeafIds,
  remapLeafRecordForPersistence,
  leafRecordEquivalent,
  findWorktreeIdForTab
} from './persistence-layout-tree'

export function collectMigrationUnsupportedPtyEntries(args: {
  session: WorkspaceSessionState
  tabId: string
  inputLayout: TerminalLayoutSnapshot
  normalizedLayout: TerminalLayoutSnapshot
  leafIdByInputLeafId: Map<string, string>
}): PaneIdentityMigrationEntries {
  const worktreeId = findWorktreeIdForTab(args.session, args.tabId)
  const tab = worktreeId
    ? args.session.tabsByWorktree?.[worktreeId]?.find((entry) => entry.id === args.tabId)
    : undefined
  const legacyPaneKeyAliasEntries: LegacyPaneKeyAliasEntry[] = []
  const registeredLegacyPaneKeys = new Set<string>()
  const hasLeafPtyBindings = Object.keys(args.inputLayout.ptyIdsByLeafId ?? {}).length > 0
  const fallbackPtyId =
    !hasLeafPtyBindings && typeof tab?.ptyId === 'string' ? tab.ptyId : undefined
  const registerLegacyAlias = (inputLeafId: string, leafId: string, ptyId?: string): boolean => {
    if (!isTerminalLeafId(leafId)) {
      return false
    }
    let paneKey: string
    try {
      paneKey = makePaneKey(args.tabId, leafId)
    } catch {
      return false
    }
    const numeric = /^(?:pane:)?(\d+)$/.exec(inputLeafId)?.[1]
    if (!numeric) {
      return false
    }
    // Why: persisted PaneManager ids are 1-based. A zero-based alias in split
    // layouts would make tab:1 ambiguous and can route the first pane to the second.
    const legacyPaneKey = `${args.tabId}:${numeric}`
    agentHookServer.registerPaneKeyAlias(legacyPaneKey, paneKey, ptyId)
    registeredLegacyPaneKeys.add(legacyPaneKey)
    if (ptyId) {
      legacyPaneKeyAliasEntries.push({
        ptyId,
        legacyPaneKey,
        stablePaneKey: paneKey,
        updatedAt: Date.now()
      })
      return true
    }
    return false
  }
  const inputLeafIds = new Set([
    ...collectLayoutLeafIdsInOrder(args.inputLayout.root),
    ...Object.keys(args.inputLayout.ptyIdsByLeafId ?? {})
  ])
  for (const inputLeafId of inputLeafIds) {
    if (isTerminalLeafId(inputLeafId)) {
      continue
    }
    const leafId = args.leafIdByInputLeafId.get(inputLeafId)
    if (leafId) {
      registerLegacyAlias(
        inputLeafId,
        leafId,
        args.inputLayout.ptyIdsByLeafId?.[inputLeafId] ?? fallbackPtyId
      )
    }
  }
  if (tab?.ptyId && !hasLeafPtyBindings) {
    const fallbackLeafId =
      args.normalizedLayout.activeLeafId ?? firstLayoutLeafId(args.normalizedLayout.root)
    if (fallbackLeafId && isTerminalLeafId(fallbackLeafId)) {
      const paneKey = makePaneKey(args.tabId, fallbackLeafId)
      for (const legacyPaneKey of [`${args.tabId}:0`, `${args.tabId}:1`]) {
        if (registeredLegacyPaneKeys.has(legacyPaneKey)) {
          continue
        }
        agentHookServer.registerPaneKeyAlias(legacyPaneKey, paneKey, tab.ptyId)
        legacyPaneKeyAliasEntries.push({
          ptyId: tab.ptyId,
          legacyPaneKey,
          stablePaneKey: paneKey,
          updatedAt: Date.now()
        })
      }
    }
  }
  // Why: legacy numeric pane keys are now bridged by aliases instead of
  // persisted as restart-required rows. Existing saved rows are pruned during
  // normalizePersistedPaneIdentityState.
  return { migrationUnsupportedEntries: [], legacyPaneKeyAliasEntries }
}

export function legacyMigrationUnsupportedRowsToAliasEntries(
  entries: MigrationUnsupportedPtyEntry[]
): LegacyPaneKeyAliasEntry[] {
  const normalizedEntries = normalizeMigrationUnsupportedPtyEntries(entries).filter(
    (entry) => entry.tabId && entry.paneKey && parsePaneKey(entry.paneKey)
  )
  const entriesByTabId = new Map<string, MigrationUnsupportedPtyEntry[]>()
  for (const entry of normalizedEntries) {
    const tabId = entry.tabId
    if (!tabId) {
      continue
    }
    entriesByTabId.set(tabId, [...(entriesByTabId.get(tabId) ?? []), entry])
  }
  const aliasEntries: LegacyPaneKeyAliasEntry[] = []
  for (const [tabId, tabEntries] of entriesByTabId) {
    if (tabEntries.length !== 1) {
      continue
    }
    const [entry] = tabEntries
    if (!entry.paneKey) {
      continue
    }
    // Why: pre-stable dev/RC migration rows did not store the old numeric
    // key. Only synthesize the single-pane aliases when the row is unambiguous
    // for its tab; split rows need layout-derived aliases instead of a guess.
    for (const legacyPaneKey of [`${tabId}:0`, `${tabId}:1`]) {
      aliasEntries.push({
        ptyId: entry.ptyId,
        legacyPaneKey,
        stablePaneKey: entry.paneKey,
        updatedAt: entry.updatedAt
      })
    }
  }
  return aliasEntries
}

export function normalizeTerminalLayoutSnapshotForPersistence(
  snapshot: TerminalLayoutSnapshot,
  preferredLayout?: TerminalLayoutSnapshot
): LayoutLeafNormalization {
  let inputSnapshot = snapshot
  let changed = false
  if (!inputSnapshot.root) {
    if (!preferredLayout?.root) {
      return { snapshot, changed: false, leafIdByInputLeafId: new Map() }
    }
    const root = cloneLayoutNode(preferredLayout.root)
    const rootLeafIds = new Set(collectLayoutLeafIdsInOrder(root))
    const activeLeafId =
      (inputSnapshot.activeLeafId && rootLeafIds.has(inputSnapshot.activeLeafId)
        ? inputSnapshot.activeLeafId
        : null) ??
      (preferredLayout.activeLeafId && rootLeafIds.has(preferredLayout.activeLeafId)
        ? preferredLayout.activeLeafId
        : null) ??
      firstLayoutLeafId(root)
    const expandedLeafId =
      (inputSnapshot.expandedLeafId && rootLeafIds.has(inputSnapshot.expandedLeafId)
        ? inputSnapshot.expandedLeafId
        : null) ??
      (preferredLayout.expandedLeafId && rootLeafIds.has(preferredLayout.expandedLeafId)
        ? preferredLayout.expandedLeafId
        : null)
    inputSnapshot = { ...inputSnapshot, root, activeLeafId, expandedLeafId }
    // Why: a debounced renderer writer can still hold the createTab-era empty
    // layout after persistPtyBinding has already sync-flushed the UUID root.
    changed = true
  }
  const inputRoot = inputSnapshot.root
  if (!inputRoot) {
    return { snapshot, changed: false, leafIdByInputLeafId: new Map() }
  }
  const counts = collectLayoutLeafCounts(inputRoot)
  const duplicatedInputLeafIds = new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([leafId]) => leafId)
  )
  const inputLeafIdsInOrder = collectLayoutLeafIdsInOrder(inputRoot)
  const preferredLeafIdsInOrder = collectLayoutLeafIdsInOrder(preferredLayout?.root)
  const usePreferredLeafIds = preferredLeafIdsInOrder.length === inputLeafIdsInOrder.length
  const leafIdByInputLeafId = new Map<string, string>()
  for (const [index, leafId] of inputLeafIdsInOrder.entries()) {
    const count = counts.get(leafId) ?? 0
    if (count !== 1 || leafIdByInputLeafId.has(leafId)) {
      changed = true
      continue
    }
    if (isTerminalLeafId(leafId)) {
      leafIdByInputLeafId.set(leafId, leafId)
      continue
    }
    changed = true
    const preferredLeafId = usePreferredLeafIds ? preferredLeafIdsInOrder[index] : undefined
    leafIdByInputLeafId.set(
      leafId,
      preferredLeafId && isTerminalLeafId(preferredLeafId) ? preferredLeafId : randomUUID()
    )
  }
  const root = changed
    ? cloneLayoutWithLeafIds(inputRoot, leafIdByInputLeafId, duplicatedInputLeafIds)
    : inputRoot
  const activeLeafId =
    inputSnapshot.activeLeafId && !duplicatedInputLeafIds.has(inputSnapshot.activeLeafId)
      ? (leafIdByInputLeafId.get(inputSnapshot.activeLeafId) ?? firstLayoutLeafId(root))
      : inputSnapshot.activeLeafId === null
        ? null
        : firstLayoutLeafId(root)
  const expandedLeafId =
    inputSnapshot.expandedLeafId && !duplicatedInputLeafIds.has(inputSnapshot.expandedLeafId)
      ? (leafIdByInputLeafId.get(inputSnapshot.expandedLeafId) ?? null)
      : null
  const ptyIdsByLeafId = remapLeafRecordForPersistence(
    inputSnapshot.ptyIdsByLeafId,
    leafIdByInputLeafId,
    duplicatedInputLeafIds
  )
  const buffersByLeafId = remapLeafRecordForPersistence(
    inputSnapshot.buffersByLeafId,
    leafIdByInputLeafId,
    duplicatedInputLeafIds
  )
  const scrollbackRefsByLeafId = remapLeafRecordForPersistence(
    inputSnapshot.scrollbackRefsByLeafId,
    leafIdByInputLeafId,
    duplicatedInputLeafIds
  )
  const titlesByLeafId = remapLeafRecordForPersistence(
    inputSnapshot.titlesByLeafId,
    leafIdByInputLeafId,
    duplicatedInputLeafIds
  )
  const recordsChanged =
    !leafRecordEquivalent(inputSnapshot.ptyIdsByLeafId, ptyIdsByLeafId) ||
    !leafRecordEquivalent(inputSnapshot.buffersByLeafId, buffersByLeafId) ||
    !leafRecordEquivalent(inputSnapshot.scrollbackRefsByLeafId, scrollbackRefsByLeafId) ||
    !leafRecordEquivalent(inputSnapshot.titlesByLeafId, titlesByLeafId)
  const metadataChanged =
    activeLeafId !== inputSnapshot.activeLeafId || expandedLeafId !== inputSnapshot.expandedLeafId
  if (!changed && !recordsChanged && !metadataChanged) {
    return { snapshot, changed: false, leafIdByInputLeafId }
  }
  const {
    ptyIdsByLeafId: _oldPtyIdsByLeafId,
    buffersByLeafId: _oldBuffersByLeafId,
    scrollbackRefsByLeafId: _oldScrollbackRefsByLeafId,
    titlesByLeafId: _oldTitlesByLeafId,
    ...snapshotWithoutLeafRecords
  } = inputSnapshot
  return {
    snapshot: {
      ...snapshotWithoutLeafRecords,
      root,
      activeLeafId,
      expandedLeafId,
      ...(ptyIdsByLeafId ? { ptyIdsByLeafId } : {}),
      ...(buffersByLeafId ? { buffersByLeafId } : {}),
      ...(scrollbackRefsByLeafId ? { scrollbackRefsByLeafId } : {}),
      ...(titlesByLeafId ? { titlesByLeafId } : {})
    },
    changed: true,
    leafIdByInputLeafId
  }
}
