import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'
import { isRemoteAgentHooksEnabled } from '~shared/agent/hook-relay'
import { toAppSshPtyId, toRelaySshPtyId } from '~shared/ssh-pty-id'
import { parsePaneKey } from '~shared/stable-pane-id'

import { markClaudePtyExited } from '../claude/accounts/live-pty-gate'
import { addNodePtyRecoveryHint } from '../daemon/node-pty-error-hints'
import type { Store } from '../persistence'
import type { IPtyProvider, PtySpawnResult } from '../providers/types'
import { getPtyIdForPaneKey, rememberPtyPaneKey } from './pane-key-registry'
import {
  clearProviderPtyState,
  getLocalPtyProvider,
  killAllPty,
  setLocalPtyProvider
} from './provider-registry'

export type FreshLocalFallbackProvider = IPtyProvider & {
  routesFreshSpawnsToLocalProvider?: true
}
// Why: the relay reported a vanished remote PTY by message, and both the
// expired-session marker and the identity-mismatch marker still arrive that
// way from persisted errors, so the predicates outlive the SSH transport.
export const SSH_SESSION_EXPIRED_ERROR = 'SSH_SESSION_EXPIRED'
export const SSH_PTY_IDENTITY_MISMATCH_ERROR = 'SSH_PTY_IDENTITY_MISMATCH'

export function isSshPtyNotFoundError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /PTY ".+" not found/i.test(message)
}

export function isSshPtyIdentityMismatchError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes(SSH_PTY_IDENTITY_MISMATCH_ERROR) || /identity mismatch/i.test(message)
}
// Why: PTY IDs are assigned at spawn time with a connectionId, but subsequent
// write/resize/kill calls only carry the PTY ID. This map lets us route
// post-spawn operations to the correct provider without the renderer needing
// to track connectionId per-PTY.
export const ptyOwnership = new Map<string, string | null>()
// Why: mobile clients must mirror desktop PTY geometry even when the renderer
// cannot provide an xterm snapshot yet, such as immediately after tab creation.
export const ptySizes = new Map<string, { cols: number; rows: number }>()
// Why: PTY data batching is window-bound, but the "recent user input" signal
// is PTY-scoped and must be cleared by every teardown path, including SSH and
// daemon shutdowns that do not flow through the local provider exit listener.
export const trustedTerminalHandleEnv = new Set<string>()
export const KEEP_HISTORY_STOP_SETTLE_MS = 1_000
export const KEEP_HISTORY_STOP_POLL_MS = 100
// Why: the agent-hooks server caches per-paneKey state (last prompt, last
// tool) that otherwise grows unbounded as panes come and go. Track the
// spawn-time paneKey so clearProviderPtyState can clear that cache on PTY
// teardown — the renderer knows the paneKey but the PTY lifecycle does not
// without this mapping.
export const AGENT_HOOK_RUNTIME_ENV_KEYS = [
  'YIRU_AGENT_HOOK_PORT',
  'YIRU_AGENT_HOOK_TOKEN',
  'YIRU_AGENT_HOOK_ENV',
  'YIRU_AGENT_HOOK_VERSION',
  'YIRU_AGENT_HOOK_ENDPOINT',
  // Why: PR 2778 briefly exported this scoped Claude settings path. Keep
  // deleting stale inherited values so older PTYs cannot leak the reverted path.
  'YIRU_CLAUDE_AGENT_STATUS_SETTINGS'
] as const

export { clearProviderPtyState, getLocalPtyProvider, getPtyIdForPaneKey, killAllPty }
export { setLocalPtyProvider }

// Why: consumers (currently the cursor-agent synthesized-spinner loop in
// main/index.ts) need to tear down paneKey-scoped state when a PTY exits so
// intervals / timers cannot leak for the process lifetime. A callback
// registry keeps the cross-module dependency narrow — clearProviderPtyState
// only has to know about "things to notify", not about every consumer's
// internals.
export type PaneKeyTeardownListener = (paneKey: string) => void
export const paneKeyTeardownListeners = new Set<PaneKeyTeardownListener>()

export function registerPaneKeyTeardownListener(listener: PaneKeyTeardownListener): () => void {
  paneKeyTeardownListeners.add(listener)
  return () => paneKeyTeardownListeners.delete(listener)
}

export type PaneSpawnReservation = {
  promise: Promise<PaneSpawnReservationResult>
  resolve: (result: PaneSpawnReservationResult) => void
  reject: (error: unknown) => void
}
export type PaneSpawnReservationResult = {
  id: string
  launchConfig?: SleepingAgentLaunchConfig
} & Partial<PtySpawnResult>
// Why: mobile runtime materialization and a newly-focused renderer pane can
// race to spawn the same tab/leaf. Key by stable paneKey so the loser adopts
// the winner's PTY instead of creating a duplicate shell.
export const paneSpawnReservationsByPaneKey = new Map<string, PaneSpawnReservation>()

export function parseValidPaneKey(paneKey: unknown): ReturnType<typeof parsePaneKey> {
  if (typeof paneKey !== 'string' || paneKey.length > 256) {
    return null
  }
  return parsePaneKey(paneKey)
}

export function isValidPaneKey(paneKey: unknown): paneKey is string {
  return parseValidPaneKey(paneKey) !== null
}

export function rememberPaneKeyForPty(ptyId: string, paneKey: unknown): string | null {
  const normalizedPaneKey = typeof paneKey === 'string' ? paneKey.trim() : ''
  if (!isValidPaneKey(normalizedPaneKey)) {
    return null
  }
  rememberPtyPaneKey(ptyId, normalizedPaneKey)
  return normalizedPaneKey
}

export function reservePaneSpawn(paneKey: string): PaneSpawnReservation {
  let resolve!: (result: PaneSpawnReservationResult) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<PaneSpawnReservationResult>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  promise.catch(() => {})
  const reservation = { promise, resolve, reject }
  paneSpawnReservationsByPaneKey.set(paneKey, reservation)
  return reservation
}

export function clearPaneSpawnReservation(
  paneKey: string,
  reservation: PaneSpawnReservation
): void {
  if (paneSpawnReservationsByPaneKey.get(paneKey) === reservation) {
    paneSpawnReservationsByPaneKey.delete(paneKey)
  }
}

export function rejectPaneSpawnReservation(
  paneKey: string | null | undefined,
  reservation: PaneSpawnReservation | null | undefined,
  error: unknown
): void {
  if (!reservation) {
    return
  }
  reservation.reject(error)
  if (paneKey) {
    clearPaneSpawnReservation(paneKey, reservation)
  }
}

export function resolvePaneSpawnReservation<T extends PaneSpawnReservationResult>(
  paneKey: string | null | undefined,
  reservation: PaneSpawnReservation | null | undefined,
  response: T
): T {
  if (!reservation) {
    return response
  }
  reservation.resolve(response)
  if (paneKey) {
    clearPaneSpawnReservation(paneKey, reservation)
  }
  return response
}

export function getProvider(connectionId: string | null | undefined): IPtyProvider {
  if (!connectionId) {
    return getLocalPtyProvider()
  }
  // Why: no transport registers a connection-scoped PTY provider (SSH removal,
  // #63), so every connectionId-bearing route fails closed.
  throw new Error(`No PTY provider for connection "${connectionId}"`)
}

export function getProviderForPty(ptyId: string): IPtyProvider {
  const connectionId = ptyOwnership.get(ptyId)
  if (connectionId === undefined) {
    return getLocalPtyProvider()
  }
  return getProvider(connectionId)
}

export function getAppPtyId(connectionId: string | null | undefined, ptyId: string): string {
  return connectionId ? toAppSshPtyId(connectionId, ptyId) : ptyId
}

export function getRelayPtyId(connectionId: string | null | undefined, ptyId: string): string {
  return connectionId ? toRelaySshPtyId(connectionId, ptyId) : ptyId
}

export function normalizePtyWorktreeInstanceId(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length <= 512 && !trimmed.includes('\0') ? trimmed : null
}

export function readPersistedPtyWorktreeInstanceId(
  store: Store,
  binding: {
    worktreeId: string
    tabId?: string
    leafId?: string | null
    ptyId: string
    connectionId?: string | null
  }
): string | null {
  const tab = binding.tabId
    ? store
        .getWorkspaceSession()
        .tabsByWorktree[binding.worktreeId]?.find((candidate) => candidate.id === binding.tabId)
    : undefined
  const layoutPtyId =
    tab && binding.leafId
      ? store.getWorkspaceSession().terminalLayoutsByTabId[tab.id]?.ptyIdsByLeafId?.[binding.leafId]
      : undefined
  const tabInstanceId =
    tab && (tab.ptyId === binding.ptyId || layoutPtyId === binding.ptyId)
      ? normalizePtyWorktreeInstanceId(tab.worktreeInstanceId)
      : null
  return tabInstanceId
}

export function resolveSpawnPtyWorktreeInstanceId(
  store: Store | undefined,
  binding: {
    worktreeId?: string
    tabId?: string
    leafId?: string | null
    ptyId: string
    connectionId?: string | null
    isReattach: boolean
  }
): string | null {
  if (!store || !binding.worktreeId) {
    return null
  }
  if (!binding.isReattach) {
    return normalizePtyWorktreeInstanceId(store.getWorktreeMeta(binding.worktreeId)?.instanceId)
  }
  // Why: a surviving PTY must keep its original instance instead of inheriting a reused path.
  return readPersistedPtyWorktreeInstanceId(store, {
    worktreeId: binding.worktreeId,
    tabId: binding.tabId,
    leafId: binding.leafId,
    ptyId: binding.ptyId,
    connectionId: binding.connectionId
  })
}

export function stripRemotePaneEnvWhenHooksDisabled(
  connectionId: string | null | undefined,
  env: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!connectionId || isRemoteAgentHooksEnabled()) {
    return env
  }
  if (
    !env ||
    (!('YIRU_PANE_KEY' in env) &&
      !('YIRU_TAB_ID' in env) &&
      !('YIRU_WORKTREE_ID' in env) &&
      !('YIRU_AGENT_LAUNCH_TOKEN' in env))
  ) {
    return env
  }
  const stripped = { ...env }
  delete stripped.YIRU_PANE_KEY
  delete stripped.YIRU_TAB_ID
  delete stripped.YIRU_WORKTREE_ID
  delete stripped.YIRU_AGENT_LAUNCH_TOKEN
  return stripped
}

export function normalizeNodePtySpawnError(err: unknown): Error {
  const rawMessage = err instanceof Error ? err.message : String(err)
  const hintedMessage = addNodePtyRecoveryHint(rawMessage)
  if (hintedMessage === rawMessage && err instanceof Error) {
    return err
  }
  if (err instanceof Error) {
    // Why: preserve the original stack/name/custom fields while returning the
    // same recovery guidance as the renderer-driven pty:spawn path.
    err.message = hintedMessage
    return err
  }
  return new Error(hintedMessage)
}

export function isPtyAlreadyGoneError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return isSshPtyNotFoundError(err) || /Session not found/i.test(message)
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
  })
}

export async function isProviderPtyLive(provider: IPtyProvider, ptyId: string): Promise<boolean> {
  return (await provider.listProcesses()).some((session) => session.id === ptyId)
}

export async function verifyPtyStopped(
  provider: IPtyProvider,
  ptyId: string,
  opts: { keepHistory?: boolean } | undefined
): Promise<boolean> {
  if (await isProviderPtyLive(provider, ptyId)) {
    return false
  }
  if (!opts?.keepHistory) {
    return true
  }
  const deadline = Date.now() + KEEP_HISTORY_STOP_SETTLE_MS
  while (Date.now() < deadline) {
    await delay(KEEP_HISTORY_STOP_POLL_MS)
    if (await isProviderPtyLive(provider, ptyId)) {
      return false
    }
  }
  return true
}

export function finishPtyShutdown(id: string): void {
  clearProviderPtyState(id)
  ptyOwnership.delete(id)
  markClaudePtyExited(id)
}
