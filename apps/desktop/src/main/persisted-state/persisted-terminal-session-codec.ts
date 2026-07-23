import type { MigrationUnsupportedPtyEntry } from '@yiru/workbench-model/agent'

import {
  isTerminalLeafId,
  parseLegacyNumericPaneKey,
  parsePaneKey
} from '../../shared/stable-pane-id'
import type { LegacyPaneKeyAliasEntry, PersistedState } from '../../shared/types'

export const MAX_CLAUDE_LIVE_PTY_SESSION_IDS = 200

export function normalizePersistedClaudeLivePtySessionIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const ids: string[] = []
  // Why: scan newest-first so the cap retains the same recent ids as runtime eviction.
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const entry = value[index]
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 512) {
      continue
    }
    if (!ids.includes(entry)) {
      ids.push(entry)
    }
    if (ids.length >= MAX_CLAUDE_LIVE_PTY_SESSION_IDS) {
      break
    }
  }
  return ids.toReversed()
}

export function normalizePersistedMigrationUnsupportedPtyEntries(
  value: unknown
): MigrationUnsupportedPtyEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is MigrationUnsupportedPtyEntry => {
    if (!entry || typeof entry !== 'object') {
      return false
    }
    const candidate = entry as Partial<MigrationUnsupportedPtyEntry>
    return (
      typeof candidate.ptyId === 'string' &&
      candidate.ptyId.length > 0 &&
      (candidate.worktreeId === undefined || typeof candidate.worktreeId === 'string') &&
      (candidate.tabId === undefined || typeof candidate.tabId === 'string') &&
      (candidate.leafId === undefined || isTerminalLeafId(candidate.leafId)) &&
      (candidate.paneKey === undefined || typeof candidate.paneKey === 'string') &&
      candidate.reason === 'legacy-numeric-pane-key' &&
      (candidate.source === 'local' || candidate.source === 'ssh') &&
      Number.isFinite(candidate.updatedAt)
    )
  })
}

export function normalizePersistedLegacyPaneKeyAliasEntries(
  value: unknown
): LegacyPaneKeyAliasEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is LegacyPaneKeyAliasEntry => {
    if (!entry || typeof entry !== 'object') {
      return false
    }
    const candidate = entry as Partial<LegacyPaneKeyAliasEntry>
    if (
      typeof candidate.ptyId !== 'string' ||
      candidate.ptyId.trim().length === 0 ||
      typeof candidate.legacyPaneKey !== 'string' ||
      typeof candidate.stablePaneKey !== 'string' ||
      !Number.isFinite(candidate.updatedAt)
    ) {
      return false
    }
    const legacy = parseLegacyNumericPaneKey(candidate.legacyPaneKey)
    const relocatedSource = parsePaneKey(candidate.legacyPaneKey)
    const stable = parsePaneKey(candidate.stablePaneKey)
    return Boolean(stable && ((legacy && legacy.tabId === stable.tabId) || relocatedSource))
  })
}

export function decodePersistedTerminalSessionState(
  persisted: Partial<PersistedState> | null | undefined
): Pick<
  PersistedState,
  'claudeLivePtySessionIds' | 'migrationUnsupportedPtyEntries' | 'legacyPaneKeyAliasEntries'
> {
  return {
    claudeLivePtySessionIds: normalizePersistedClaudeLivePtySessionIds(
      persisted?.claudeLivePtySessionIds
    ),
    migrationUnsupportedPtyEntries: normalizePersistedMigrationUnsupportedPtyEntries(
      persisted?.migrationUnsupportedPtyEntries
    ),
    legacyPaneKeyAliasEntries: normalizePersistedLegacyPaneKeyAliasEntries(
      persisted?.legacyPaneKeyAliasEntries
    )
  }
}
