import { parseRuntimeTerminalPtyId, toRuntimeTerminalPtyId } from '../runtime-terminal-pty-id'
import type { RuntimeTerminalSummary } from '../runtime-types'
import { parseAppSshPtyId } from '../ssh-pty-id'
import type { TerminalLayoutSnapshot, WorkspaceSessionState } from '../types'

type SessionTerminalIdentity = Pick<
  RuntimeTerminalSummary,
  'connected' | 'handle' | 'leafId' | 'ptyId' | 'tabId'
>

export type TerminalBinding = {
  leafId?: string
  tabId: string
}

export type WorkspaceSessionTerminalIdFields = Pick<
  WorkspaceSessionState,
  'tabsByWorktree' | 'terminalLayoutsByTabId'
>

export type WorkspaceSessionTerminalIdExchange = {
  exchangedIdCount: number
  retiredIdCount: number
  session: WorkspaceSessionState
}

type TerminalIdentityIndexes = {
  byHandle: ReadonlyMap<string, readonly SessionTerminalIdentity[]>
  byPtyId: ReadonlyMap<string, readonly SessionTerminalIdentity[]>
}

export function hasExchangeableWorkspaceSessionTerminalIds(
  session: WorkspaceSessionState
): boolean {
  for (const tabs of Object.values(session.tabsByWorktree)) {
    if (tabs.some((tab) => isExchangeableTerminalId(tab.ptyId))) {
      return true
    }
  }
  return Object.values(session.terminalLayoutsByTabId).some((layout) =>
    Object.values(layout.ptyIdsByLeafId ?? {}).some(isExchangeableTerminalId)
  )
}

function isExchangeableTerminalId(ptyId: string | null | undefined): ptyId is string {
  return typeof ptyId === 'string' && parseAppSshPtyId(ptyId) === null
}

function selectRuntimeTerminalId(
  terminals: readonly SessionTerminalIdentity[],
  environmentId: string | null
): string | null {
  const ids = new Set(
    terminals.map((terminal) => toRuntimeTerminalPtyId(terminal.handle, environmentId))
  )
  return ids.size === 1 ? ([...ids][0] ?? null) : null
}

function selectBoundRuntimeTerminalId(
  candidates: readonly SessionTerminalIdentity[],
  binding: TerminalBinding,
  environmentId: string | null
): string | null {
  if (binding.leafId) {
    const exactLeaf = candidates.filter(
      (terminal) => terminal.tabId === binding.tabId && terminal.leafId === binding.leafId
    )
    const exactLeafId = selectRuntimeTerminalId(exactLeaf, environmentId)
    if (exactLeafId) {
      return exactLeafId
    }
  }
  const exactTabId = selectRuntimeTerminalId(
    candidates.filter((terminal) => terminal.tabId === binding.tabId),
    environmentId
  )
  return exactTabId ?? selectRuntimeTerminalId(candidates, environmentId)
}

function resolvePersistedTerminalId(
  ptyId: string,
  binding: TerminalBinding,
  indexes: TerminalIdentityIndexes,
  environmentId: string | null
): string | null {
  if (parseAppSshPtyId(ptyId)) {
    return ptyId
  }
  const runtimeId = parseRuntimeTerminalPtyId(ptyId)
  if (runtimeId) {
    if (runtimeId.environmentId !== environmentId) {
      return null
    }
    return selectBoundRuntimeTerminalId(
      indexes.byHandle.get(runtimeId.handle) ?? [],
      binding,
      environmentId
    )
  }
  return selectBoundRuntimeTerminalId(indexes.byPtyId.get(ptyId) ?? [], binding, environmentId)
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

export function replaceWorkspaceSessionTerminalIds(
  fields: WorkspaceSessionTerminalIdFields,
  replace: (ptyId: string, binding: TerminalBinding) => string | null
): WorkspaceSessionTerminalIdFields {
  const tabsByWorktree = Object.fromEntries(
    Object.entries(fields.tabsByWorktree).map(([worktreeId, tabs]) => [
      worktreeId,
      tabs.map((tab) => ({
        ...tab,
        ptyId: tab.ptyId ? replace(tab.ptyId, { tabId: tab.id }) : null
      }))
    ])
  )
  const terminalLayoutsByTabId = Object.fromEntries(
    Object.entries(fields.terminalLayoutsByTabId).map(([tabId, layout]) => [
      tabId,
      replaceLayoutTerminalIds(layout, tabId, replace)
    ])
  )
  return { tabsByWorktree, terminalLayoutsByTabId }
}

function indexTerminalIdentities(
  terminals: readonly SessionTerminalIdentity[]
): TerminalIdentityIndexes {
  const byHandle = new Map<string, SessionTerminalIdentity[]>()
  const byPtyId = new Map<string, SessionTerminalIdentity[]>()
  for (const terminal of terminals) {
    if (!terminal.connected || !terminal.ptyId) {
      continue
    }
    const handleEntries = byHandle.get(terminal.handle) ?? []
    handleEntries.push(terminal)
    byHandle.set(terminal.handle, handleEntries)
    const ptyEntries = byPtyId.get(terminal.ptyId) ?? []
    ptyEntries.push(terminal)
    byPtyId.set(terminal.ptyId, ptyEntries)
  }
  return { byHandle, byPtyId }
}

export function exchangeWorkspaceSessionTerminalIds(
  session: WorkspaceSessionState,
  terminals: readonly SessionTerminalIdentity[],
  environmentId: string | null = null
): WorkspaceSessionTerminalIdExchange {
  if (!hasExchangeableWorkspaceSessionTerminalIds(session)) {
    return { session, exchangedIdCount: 0, retiredIdCount: 0 }
  }

  const indexes = indexTerminalIdentities(terminals)
  let exchangedIdCount = 0
  let retiredIdCount = 0
  const fields = replaceWorkspaceSessionTerminalIds(session, (ptyId, binding) => {
    const runtimeId = resolvePersistedTerminalId(ptyId, binding, indexes, environmentId)
    if (runtimeId) {
      if (runtimeId !== ptyId || parseRuntimeTerminalPtyId(ptyId)) {
        exchangedIdCount += 1
      }
      return runtimeId
    }
    retiredIdCount += 1
    return null
  })

  return {
    session: { ...session, ...fields },
    exchangedIdCount,
    retiredIdCount
  }
}
