import { parseRuntimeTerminalPtyId, toRuntimeTerminalPtyId } from '../runtime-terminal-pty-id'
import type { RuntimeTerminalSummary } from '../runtime-types'
import type { TerminalLayoutSnapshot, WorkspaceSessionState } from '../types'

type SessionTerminalIdentity = Pick<
  RuntimeTerminalSummary,
  'connected' | 'handle' | 'leafId' | 'ptyId' | 'tabId'
>

type TerminalBinding = {
  leafId?: string
  tabId: string
}

export type WorkspaceSessionTerminalIdReconciliation = {
  migratedIdCount: number
  retiredIdCount: number
  session: WorkspaceSessionState
}

function isLegacyTerminalId(ptyId: string | null | undefined): ptyId is string {
  return typeof ptyId === 'string' && parseRuntimeTerminalPtyId(ptyId) === null
}

export function hasLegacyWorkspaceSessionTerminalIds(session: WorkspaceSessionState): boolean {
  for (const tabs of Object.values(session.tabsByWorktree)) {
    if (tabs.some((tab) => isLegacyTerminalId(tab.ptyId))) {
      return true
    }
  }
  return Object.values(session.terminalLayoutsByTabId).some((layout) =>
    Object.values(layout.ptyIdsByLeafId ?? {}).some(isLegacyTerminalId)
  )
}

function selectCanonicalTerminalId(
  terminals: readonly SessionTerminalIdentity[],
  environmentId: string | null
): string | null {
  const ids = new Set(
    terminals.map((terminal) => toRuntimeTerminalPtyId(terminal.handle, environmentId))
  )
  return ids.size === 1 ? ([...ids][0] ?? null) : null
}

function resolveLegacyTerminalId(
  ptyId: string,
  binding: TerminalBinding,
  terminalsByPtyId: ReadonlyMap<string, readonly SessionTerminalIdentity[]>,
  environmentId: string | null
): string | null {
  const candidates = terminalsByPtyId.get(ptyId) ?? []
  if (binding.leafId) {
    const exactLeaf = candidates.filter(
      (terminal) => terminal.tabId === binding.tabId && terminal.leafId === binding.leafId
    )
    const exactLeafId = selectCanonicalTerminalId(exactLeaf, environmentId)
    if (exactLeafId) {
      return exactLeafId
    }
  }
  const exactTabId = selectCanonicalTerminalId(
    candidates.filter((terminal) => terminal.tabId === binding.tabId),
    environmentId
  )
  return exactTabId ?? selectCanonicalTerminalId(candidates, environmentId)
}

function replaceLayoutTerminalIds(
  layout: TerminalLayoutSnapshot,
  tabId: string,
  replace: (ptyId: string, binding: TerminalBinding) => string | null
): TerminalLayoutSnapshot {
  if (!layout.ptyIdsByLeafId) {
    return layout
  }
  const ptyIdsByLeafId: Record<string, string> = {}
  for (const [leafId, ptyId] of Object.entries(layout.ptyIdsByLeafId)) {
    const nextPtyId = replace(ptyId, { tabId, leafId })
    if (nextPtyId) {
      ptyIdsByLeafId[leafId] = nextPtyId
    }
  }
  const next = { ...layout }
  if (Object.keys(ptyIdsByLeafId).length > 0) {
    next.ptyIdsByLeafId = ptyIdsByLeafId
  } else {
    delete next.ptyIdsByLeafId
  }
  return next
}

export function reconcileWorkspaceSessionTerminalIds(
  session: WorkspaceSessionState,
  terminals: readonly SessionTerminalIdentity[],
  environmentId: string | null = null
): WorkspaceSessionTerminalIdReconciliation {
  if (!hasLegacyWorkspaceSessionTerminalIds(session)) {
    return { session, migratedIdCount: 0, retiredIdCount: 0 }
  }

  const terminalsByPtyId = new Map<string, SessionTerminalIdentity[]>()
  for (const terminal of terminals) {
    if (!terminal.connected || !terminal.ptyId) {
      continue
    }
    const existing = terminalsByPtyId.get(terminal.ptyId)
    if (existing) {
      existing.push(terminal)
    } else {
      terminalsByPtyId.set(terminal.ptyId, [terminal])
    }
  }

  let migratedIdCount = 0
  let retiredIdCount = 0
  const replace = (ptyId: string, binding: TerminalBinding): string | null => {
    if (!isLegacyTerminalId(ptyId)) {
      return ptyId
    }
    const canonicalId = resolveLegacyTerminalId(ptyId, binding, terminalsByPtyId, environmentId)
    if (canonicalId) {
      migratedIdCount += 1
      return canonicalId
    }
    retiredIdCount += 1
    return null
  }

  const tabsByWorktree = Object.fromEntries(
    Object.entries(session.tabsByWorktree).map(([worktreeId, tabs]) => [
      worktreeId,
      tabs.map((tab) => ({
        ...tab,
        ptyId: tab.ptyId ? replace(tab.ptyId, { tabId: tab.id }) : null
      }))
    ])
  )
  const terminalLayoutsByTabId = Object.fromEntries(
    Object.entries(session.terminalLayoutsByTabId).map(([tabId, layout]) => [
      tabId,
      replaceLayoutTerminalIds(layout, tabId, replace)
    ])
  )

  return {
    session: { ...session, tabsByWorktree, terminalLayoutsByTabId },
    migratedIdCount,
    retiredIdCount
  }
}
