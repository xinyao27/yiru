/* eslint-disable max-lines -- Why: PTY provider ownership, spawn environment,
runtime multiplex lifecycle, and process inspection share one teardown path. */
import { existsSync } from 'node:fs'
import { join, delimiter } from 'node:path'

import { type BrowserWindow, type WebContents, app } from 'electron'
export { getBashShellReadyRcfileContent } from '../providers/local-pty-shell-ready'
import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'
import { normalizeRuntimePathForComparison } from '@yiru/workbench-model/platform'
import { splitWorktreeIdForFilesystem } from '@yiru/workbench-model/workspace'
import { isRemoteAgentHooksEnabled } from '~shared/agent/hook-relay'
import { getCommandTokenPathBasename, getFirstCommandToken } from '~shared/command-token-scanner'
import {
  isWslShellName,
  resolveLocalWindowsTerminalRuntimeOptions
} from '~shared/local-windows-terminal-runtime'
import { buildConfiguredProxyEnv, type NetworkProxySettings } from '~shared/network-proxy'
import { detectPiAgentKindFromCommand, type PiAgentKind } from '~shared/pi-agent-kind'
import { resolveSetupAgentSequenceLaunchCommand } from '~shared/setup/agent-sequencing'
import { parseAppSshPtyId, toAppSshPtyId, toRelaySshPtyId } from '~shared/ssh-pty-id'
import { isTerminalLeafId, makePaneKey, parsePaneKey } from '~shared/stable-pane-id'
import { agentKindSchema, launchSourceSchema, requestKindSchema } from '~shared/telemetry-events'
import { createTerminalSessionStateSaveFailureMessage } from '~shared/terminal/session-state-save-failure'
import {
  resolveTerminalStartupCwdForWorkspace,
  type TerminalStartupCwdMissingDirFallback
} from '~shared/terminal/startup-cwd'
import { isValidTerminalTabId } from '~shared/terminal/tab-id'
import { isTuiAgent } from '~shared/tui-agent/config'
import type { GlobalSettings, TuiAgent } from '~shared/types'
import { parseWorkspaceKey } from '~shared/workspace/scope'
import {
  getYiruCliEnvironment,
  resolveYiruCliCommandName,
  rewriteYiruCliCommandPrefix
} from '~shared/yiru-cli-command-name'

import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import { clearMigrationUnsupportedPty } from '../agent-hooks/migration-unsupported-pty-state'
import { agentHookServer } from '../agent-hooks/server'
import { wslHookRelayManager } from '../agent-hooks/wsl-hook-relay-manager'
import {
  applyTerminalAttributionEnv,
  resolveAttributionShellFamily
} from '../attribution/terminal-attribution'
import { CLAUDE_AUTH_ENV_VARS, hasClaudeAuthEnvConflict } from '../claude/accounts/environment'
import {
  isClaudeAuthSwitchInProgress,
  markClaudePtyExited,
  markClaudePtySpawned
} from '../claude/accounts/live-pty-gate'
import type { ClaudeRuntimeAuthPreparation } from '../claude/accounts/runtime-auth-service'
import type { ClaudeAccountSelectionTarget } from '../claude/accounts/runtime-selection'
import type { CodexAccountSelectionTarget } from '../codex/accounts/runtime-selection'
import { isCodexSystemDefaultRealHomeEnabled } from '../codex/real-home-flag'
import { addNodePtyRecoveryHint } from '../daemon/node-pty-error-hints'
import { mintPtySessionId, isSafePtySessionId } from '../daemon/pty-session-id'
import { beginTerminalInstall } from '../filesystem/watcher-removal-gate'
import { resolveLocalProjectRuntimeForWorktreeId } from '../local-project-runtime-resolution'
import { registerPty, unregisterPty } from '../memory/pty-registry'
import { mimoCodeHookService } from '../mimo/hook-service'
import { openCodeHookService } from '../opencode/hook-service'
import type { Store } from '../persistence'
import { piTitlebarExtensionService } from '../pi/titlebar-extension-service'
import { advertisedUrlWatcher } from '../ports/advertised-url-watcher'
import {
  assertFolderWorkspacePathUsable,
  getFolderWorkspacePathStatus
} from '../project-groups/folder-workspace-path-status'
import { LocalPtyProvider } from '../providers/local-pty-provider'
import type { IPtyProvider, PtySpawnOptions, PtySpawnResult } from '../providers/types'
import { isPwshAvailable } from '../pwsh'
import {
  clearNativeWindowsConptyPty,
  isNativeWindowsLocalPtySpawn,
  markNativeWindowsConptyPty
} from '../runtime/terminal-model-query-authority'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { track } from '../telemetry/client'
import { getCohortAtEmit } from '../telemetry/cohort-classifier'
import { parseWslPath } from '../wsl'
import { isHostCodexHomeForWsl, isWslCodexHomeForHost } from './codex-home-wsl-env'
import {
  forgetPtyPaneKey,
  getPaneKeyOwner,
  getPtyIdForPaneKey,
  getPtyPaneKeyBinding,
  rememberPtyPaneKey
} from './pane-key-registry'
import {
  clearProviderPtyState,
  getLocalPtyProvider,
  installProviderStateCleanup,
  killAllPty,
  setLocalPtyProvider
} from './provider-registry'
import { readShellStartupEnvVar } from './shell-startup-env'
import { applyTerminalGitCredentialPromptGuard } from './terminal-git-credential-guard'
import { mergePersistedWindowsPath } from './windows-environment-path'
import { addYiruWslInteropEnv } from './wsl-yiru-env'

// ─── Provider Registry ──────────────────────────────────────────────
// Routes PTY operations by connectionId. null = local provider.

type FreshLocalFallbackProvider = IPtyProvider & {
  routesFreshSpawnsToLocalProvider?: true
}
// Why: the relay reported a vanished remote PTY by message, and both the
// expired-session marker and the identity-mismatch marker still arrive that
// way from persisted errors, so the predicates outlive the SSH transport.
const SSH_SESSION_EXPIRED_ERROR = 'SSH_SESSION_EXPIRED'
const SSH_PTY_IDENTITY_MISMATCH_ERROR = 'SSH_PTY_IDENTITY_MISMATCH'

function isSshPtyNotFoundError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /PTY ".+" not found/i.test(message)
}

function isSshPtyIdentityMismatchError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes(SSH_PTY_IDENTITY_MISMATCH_ERROR) || /identity mismatch/i.test(message)
}
// Why: PTY IDs are assigned at spawn time with a connectionId, but subsequent
// write/resize/kill calls only carry the PTY ID. This map lets us route
// post-spawn operations to the correct provider without the renderer needing
// to track connectionId per-PTY.
const ptyOwnership = new Map<string, string | null>()
// Why: mobile clients must mirror desktop PTY geometry even when the renderer
// cannot provide an xterm snapshot yet, such as immediately after tab creation.
const ptySizes = new Map<string, { cols: number; rows: number }>()
// Why: PTY data batching is window-bound, but the "recent user input" signal
// is PTY-scoped and must be cleared by every teardown path, including SSH and
// daemon shutdowns that do not flow through the local provider exit listener.
const trustedTerminalHandleEnv = new Set<string>()
const KEEP_HISTORY_STOP_SETTLE_MS = 1_000
const KEEP_HISTORY_STOP_POLL_MS = 100
// Why: the agent-hooks server caches per-paneKey state (last prompt, last
// tool) that otherwise grows unbounded as panes come and go. Track the
// spawn-time paneKey so clearProviderPtyState can clear that cache on PTY
// teardown — the renderer knows the paneKey but the PTY lifecycle does not
// without this mapping.
const AGENT_HOOK_RUNTIME_ENV_KEYS = [
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
type PaneKeyTeardownListener = (paneKey: string) => void
const paneKeyTeardownListeners = new Set<PaneKeyTeardownListener>()

export function registerPaneKeyTeardownListener(listener: PaneKeyTeardownListener): () => void {
  paneKeyTeardownListeners.add(listener)
  return () => paneKeyTeardownListeners.delete(listener)
}

type PaneSpawnReservation = {
  promise: Promise<PaneSpawnReservationResult>
  resolve: (result: PaneSpawnReservationResult) => void
  reject: (error: unknown) => void
}
type PaneSpawnReservationResult = {
  id: string
  launchConfig?: SleepingAgentLaunchConfig
} & Partial<PtySpawnResult>
// Why: mobile runtime materialization and a newly-focused renderer pane can
// race to spawn the same tab/leaf. Key by stable paneKey so the loser adopts
// the winner's PTY instead of creating a duplicate shell.
const paneSpawnReservationsByPaneKey = new Map<string, PaneSpawnReservation>()

function parseValidPaneKey(paneKey: unknown): ReturnType<typeof parsePaneKey> {
  if (typeof paneKey !== 'string' || paneKey.length > 256) {
    return null
  }
  return parsePaneKey(paneKey)
}

function isValidPaneKey(paneKey: unknown): paneKey is string {
  return parseValidPaneKey(paneKey) !== null
}

function rememberPaneKeyForPty(ptyId: string, paneKey: unknown): string | null {
  const normalizedPaneKey = typeof paneKey === 'string' ? paneKey.trim() : ''
  if (!isValidPaneKey(normalizedPaneKey)) {
    return null
  }
  rememberPtyPaneKey(ptyId, normalizedPaneKey)
  return normalizedPaneKey
}

function reservePaneSpawn(paneKey: string): PaneSpawnReservation {
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

function clearPaneSpawnReservation(paneKey: string, reservation: PaneSpawnReservation): void {
  if (paneSpawnReservationsByPaneKey.get(paneKey) === reservation) {
    paneSpawnReservationsByPaneKey.delete(paneKey)
  }
}

function rejectPaneSpawnReservation(
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

function resolvePaneSpawnReservation<T extends PaneSpawnReservationResult>(
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

function getProvider(connectionId: string | null | undefined): IPtyProvider {
  if (!connectionId) {
    return getLocalPtyProvider()
  }
  // Why: no transport registers a connection-scoped PTY provider (SSH removal,
  // #63), so every connectionId-bearing route fails closed.
  throw new Error(`No PTY provider for connection "${connectionId}"`)
}

function getProviderForPty(ptyId: string): IPtyProvider {
  const connectionId = ptyOwnership.get(ptyId)
  if (connectionId === undefined) {
    return getLocalPtyProvider()
  }
  return getProvider(connectionId)
}

function getAppPtyId(connectionId: string | null | undefined, ptyId: string): string {
  return connectionId ? toAppSshPtyId(connectionId, ptyId) : ptyId
}

function getRelayPtyId(connectionId: string | null | undefined, ptyId: string): string {
  return connectionId ? toRelaySshPtyId(connectionId, ptyId) : ptyId
}

function normalizePtyWorktreeInstanceId(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length <= 512 && !trimmed.includes('\0') ? trimmed : null
}

function readPersistedPtyWorktreeInstanceId(
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

function resolveSpawnPtyWorktreeInstanceId(
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

function stripRemotePaneEnvWhenHooksDisabled(
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

function normalizeNodePtySpawnError(err: unknown): Error {
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

function isPtyAlreadyGoneError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return isSshPtyNotFoundError(err) || /Session not found/i.test(message)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
  })
}

async function isProviderPtyLive(provider: IPtyProvider, ptyId: string): Promise<boolean> {
  return (await provider.listProcesses()).some((session) => session.id === ptyId)
}

async function verifyPtyStopped(
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

function finishPtyShutdown(id: string): void {
  clearProviderPtyState(id)
  ptyOwnership.delete(id)
  markClaudePtyExited(id)
}

// ─── Host PTY env assembly ──────────────────────────────────────────
// Why: both the LocalPtyProvider.buildSpawnEnv closure and the daemon-active
// fallback in pty:spawn need the same set of host-local env injections
// (OpenCode plugin dir, agent-hook server coordinates, Pi/OMP managed
// extensions, Codex account home, dev-mode CLI overrides, GitHub attribution
// shims). They used to be implemented twice, which silently drifted —
// daemon-backed PTYs never got the OpenCode plugin, Pi integration, Codex
// home, or dev CLI PATH prepend, so status dots, Pi state, Codex switching, and CLI→dev
// routing were all broken for daemon users (the common case).
//
// Centralizing the injections here makes future additions fail-safe: a new
// variable added to this function lands in BOTH spawn paths or NEITHER.

export type BuildPtyHostEnvOptions = {
  isPackaged: boolean
  userDataPath: string
  selectedCodexHomePath: string | null
  skipCodexHomeEnv?: boolean
  /** Real-home routing strips only a Yiru-owned inherited override. */
  stripInheritedYiruCodexHome?: boolean
  githubAttributionEnabled: boolean
  /** The launch command the renderer chose for this PTY (e.g. 'pi', 'omp',
   *  'claude'). Used to resolve the per-agent managed extension target for
   *  Pi / OMP - both consume `PI_CODING_AGENT_DIR` but default to different
   *  `~/.<kind>/agent` paths. Undefined for bare-shell spawns; defaults
   *  resolve to Pi for back-compat. NEVER infer from disk presence; that's
   *  the bug this option fixes (cross-agent shadowing when both dirs exist). */
  launchCommand?: string
  /** Trusted agent identity for wrapped commands that cannot be recognized from text. */
  launchAgent?: TuiAgent
  shellPath?: string
  isWsl?: boolean
  /** Distro for WSL spawns (null = Windows default distro). Drives the WSL
   *  hook relay ensure + guest endpoint repoint; only read when isWsl. */
  wslDistro?: string | null
  agentStatusHooksEnabled: boolean
  networkProxySettings?: NetworkProxySettings
  /** Keep indexed Git config off the sparse daemon wire; the daemon appends
   *  guard entries after merging its authoritative inherited environment. */
  deferGitConfigGuardToDaemon?: boolean
}

function readInheritedPath(baseEnv: Record<string, string>): string {
  return baseEnv.PATH ?? baseEnv.Path ?? process.env.PATH ?? process.env.Path ?? ''
}

function firstPathEntry(pathValue: string | undefined): string | null {
  const first = pathValue?.split(delimiter).find((entry) => entry.trim().length > 0)
  return first ?? null
}

function promoteAgentTeamsShimPath(
  env: Record<string, string> | undefined,
  requestedPath: string | undefined
): void {
  if (!env?.YIRU_AGENT_TEAMS_TEAM_ID) {
    return
  }
  const shimPath = firstPathEntry(requestedPath)
  if (!shimPath) {
    return
  }
  const currentPathKey = env.PATH !== undefined || env.Path === undefined ? 'PATH' : 'Path'
  const currentPath = env[currentPathKey] ?? ''
  const remaining = currentPath
    .split(delimiter)
    .filter((entry) => entry.length > 0 && entry !== shimPath)
  // Why: host env injection can prepend Yiru's attribution/dev shims. Claude
  // Agent Teams must still resolve our fake tmux before any real tmux.
  env[currentPathKey] = [shimPath, ...remaining].join(delimiter)
}

function deleteRequestedEnvKeys(
  env: Record<string, string> | undefined,
  keys: string[] | undefined
): void {
  if (!env || !keys) {
    return
  }
  for (const key of keys) {
    delete env[key]
  }
}

function shouldSkipCodexHomeEnvForWindowsShell(
  shellPath: string | undefined,
  cwd: string | undefined
): boolean {
  return isWslShellName(shellPath) || (typeof cwd === 'string' && parseWslPath(cwd) !== null)
}

const CODEX_HOME_ENV_KEYS = ['CODEX_HOME', 'YIRU_CODEX_HOME'] as const

function shouldStripInheritedYiruCodexHome(args: {
  target: CodexAccountSelectionTarget
  selectedCodexHomePath: string | null
  skipCodexHomeEnv: boolean
}): boolean {
  return (
    args.target.runtime === 'host' &&
    args.selectedCodexHomePath === null &&
    !args.skipCodexHomeEnv &&
    isCodexSystemDefaultRealHomeEnabled()
  )
}

function getLocalYiruCodexHomeEnvKeysToDelete(env: Record<string, string>): string[] {
  const inheritedYiruOverride = env.YIRU_CODEX_HOME ?? process.env.YIRU_CODEX_HOME
  const inheritedCodexHome = env.CODEX_HOME ?? process.env.CODEX_HOME
  const keys = ['YIRU_CODEX_HOME']
  if (inheritedYiruOverride && inheritedCodexHome === inheritedYiruOverride) {
    keys.push('CODEX_HOME')
  }
  return keys
}

type GetSelectedCodexHomePath = (
  target?: CodexAccountSelectionTarget,
  launchEnv?: NodeJS.ProcessEnv
) => string | null
type PrepareClaudeAuth = (
  target?: ClaudeAccountSelectionTarget
) => Promise<ClaudeRuntimeAuthPreparation>

function getCodexSelectionTargetForPty(
  shellPath: string | undefined,
  cwd: string | undefined,
  wslDistro?: string | null
): CodexAccountSelectionTarget {
  const wslPath = typeof cwd === 'string' ? parseWslPath(cwd) : null
  if (isWslShellName(shellPath) || wslPath) {
    return { runtime: 'wsl', wslDistro: wslPath?.distro ?? wslDistro ?? null }
  }
  return { runtime: 'host' }
}

function getCompatibleSelectedCodexHomePath(
  target: CodexAccountSelectionTarget,
  selectedCodexHomePath: string | null
): string | null {
  if (!selectedCodexHomePath) {
    return null
  }
  const wslInfo = parseWslPath(selectedCodexHomePath)
  if (target.runtime === 'wsl') {
    return wslInfo || !isHostCodexHomeForWsl(selectedCodexHomePath) ? selectedCodexHomePath : null
  }
  return wslInfo || (process.platform === 'win32' && isWslCodexHomeForHost(selectedCodexHomePath))
    ? null
    : selectedCodexHomePath
}

function readEnvWithProcessFallback(
  baseEnv: Record<string, string>,
  key: string
): string | undefined {
  return baseEnv[key] ?? process.env[key]
}

function resolvePiAgentSourceDir(
  baseEnv: Record<string, string>,
  kind: PiAgentKind
): string | undefined {
  const sourceKey = kind === 'omp' ? 'YIRU_OMP_SOURCE_AGENT_DIR' : 'YIRU_PI_SOURCE_AGENT_DIR'
  const overlayKey = kind === 'omp' ? 'YIRU_OMP_CODING_AGENT_DIR' : 'YIRU_PI_CODING_AGENT_DIR'
  const otherOverlayKey = kind === 'omp' ? 'YIRU_PI_CODING_AGENT_DIR' : 'YIRU_OMP_CODING_AGENT_DIR'

  const sourceDir = readEnvWithProcessFallback(baseEnv, sourceKey)
  if (sourceDir) {
    return sourceDir
  }

  const publicDir = readEnvWithProcessFallback(baseEnv, 'PI_CODING_AGENT_DIR')
  const ownOverlayDir = readEnvWithProcessFallback(baseEnv, overlayKey)
  const otherOverlayDir = readEnvWithProcessFallback(baseEnv, otherOverlayKey)
  // Why: if PI_CODING_AGENT_DIR is just a restored Yiru overlay from either
  // kind and the matching source shadow is absent, remirroring it would leak
  // another agent's overlay tree into this launch. Fall through to defaults.
  if (publicDir && publicDir !== ownOverlayDir && publicDir !== otherOverlayDir) {
    return publicDir
  }

  return readShellStartupEnvVar(
    'PI_CODING_AGENT_DIR',
    baseEnv.HOME ?? process.env.HOME,
    baseEnv.SHELL ?? process.env.SHELL
  )
}

function resolveScopedPiAgentSourceDir(
  baseEnv: Record<string, string>,
  kind: PiAgentKind
): string | undefined {
  const sourceKey = kind === 'omp' ? 'YIRU_OMP_SOURCE_AGENT_DIR' : 'YIRU_PI_SOURCE_AGENT_DIR'
  return readEnvWithProcessFallback(baseEnv, sourceKey)
}

function clearPiAgentShadowEnv(baseEnv: Record<string, string>, kind: PiAgentKind): void {
  if (kind === 'omp') {
    delete baseEnv.YIRU_OMP_CODING_AGENT_DIR
    delete baseEnv.YIRU_OMP_SOURCE_AGENT_DIR
    delete baseEnv.YIRU_OMP_STATUS_EXTENSION
    return
  }
  delete baseEnv.YIRU_PI_CODING_AGENT_DIR
  delete baseEnv.YIRU_PI_SOURCE_AGENT_DIR
}

function exposePiManagedExtensionEnv(
  baseEnv: Record<string, string>,
  kind: PiAgentKind,
  managedEnv: Record<string, string>
): void {
  if (kind === 'omp') {
    delete baseEnv.YIRU_OMP_CODING_AGENT_DIR
    if (managedEnv.YIRU_OMP_SOURCE_AGENT_DIR) {
      baseEnv.YIRU_OMP_SOURCE_AGENT_DIR = managedEnv.YIRU_OMP_SOURCE_AGENT_DIR
    } else {
      delete baseEnv.YIRU_OMP_SOURCE_AGENT_DIR
    }
    if (managedEnv.YIRU_OMP_STATUS_EXTENSION) {
      baseEnv.YIRU_OMP_STATUS_EXTENSION = managedEnv.YIRU_OMP_STATUS_EXTENSION
    } else {
      delete baseEnv.YIRU_OMP_STATUS_EXTENSION
    }
    return
  }
  delete baseEnv.YIRU_PI_CODING_AGENT_DIR
  if (managedEnv.YIRU_PI_SOURCE_AGENT_DIR) {
    baseEnv.YIRU_PI_SOURCE_AGENT_DIR = managedEnv.YIRU_PI_SOURCE_AGENT_DIR
  } else {
    delete baseEnv.YIRU_PI_SOURCE_AGENT_DIR
  }
}

function mergePtyEnvDeletions(
  existingKeys: string[] | undefined,
  additionalKeys: readonly string[]
): string[] | undefined {
  if (!existingKeys && additionalKeys.length === 0) {
    return undefined
  }
  return Array.from(new Set([...(existingKeys ?? []), ...additionalKeys]))
}

function getInheritedAgentHookEnvKeysToDelete(
  spawnEnv: Record<string, string> | undefined
): string[] {
  const env = spawnEnv ?? {}
  // Why: daemon/local providers merge process.env after main-process cleanup.
  // Delete reverted or unavailable hook env keys there without dropping fresh
  // receiver coordinates that buildPtyHostEnv intentionally set.
  return AGENT_HOOK_RUNTIME_ENV_KEYS.filter((key) => env[key] === undefined)
}

// Why: when agent status is disabled, a nested Yiru terminal can still pass
// through prior OpenCode or legacy Pi/OMP overlay env. Restore the user's
// original source dir when Yiru recorded one, otherwise strip only values
// known to be ours.
function restoreOrStripOverlayEnv(
  baseEnv: Record<string, string>,
  keys: {
    primary: string
    overlay: string
    source: string
  }
): void {
  const sourceValue = baseEnv[keys.source] ?? process.env[keys.source]
  const overlayValue = baseEnv[keys.overlay] ?? process.env[keys.overlay]
  if (sourceValue) {
    baseEnv[keys.primary] = sourceValue
  } else if (overlayValue && baseEnv[keys.primary] === overlayValue) {
    delete baseEnv[keys.primary]
  }
  delete baseEnv[keys.overlay]
  delete baseEnv[keys.source]
}

function isMimoLaunchCommand(launchCommand: string | undefined): boolean {
  const binary = getCommandTokenPathBasename(getFirstCommandToken(launchCommand ?? ''))
    .toLowerCase()
    .replace(/\.(?:cmd|exe|sh)$/, '')
  return binary === 'mimo'
}

function resolveMimocodeSourceHome(baseEnv: Record<string, string>): string | undefined {
  const sourceHome = baseEnv.YIRU_MIMOCODE_SOURCE_HOME ?? process.env.YIRU_MIMOCODE_SOURCE_HOME
  if (sourceHome) {
    return sourceHome
  }
  const configHome = baseEnv.MIMOCODE_HOME ?? process.env.MIMOCODE_HOME
  const yiruHome = baseEnv.YIRU_MIMOCODE_HOME ?? process.env.YIRU_MIMOCODE_HOME
  if (configHome && yiruHome && configHome === yiruHome) {
    return undefined
  }
  return configHome
}

function resolveOpenCodeSourceConfigDir(baseEnv: Record<string, string>): string | undefined {
  const sourceDir =
    baseEnv.YIRU_OPENCODE_SOURCE_CONFIG_DIR ?? process.env.YIRU_OPENCODE_SOURCE_CONFIG_DIR
  if (sourceDir) {
    return sourceDir
  }

  const configDir = baseEnv.OPENCODE_CONFIG_DIR ?? process.env.OPENCODE_CONFIG_DIR
  const yiruConfigDir = baseEnv.YIRU_OPENCODE_CONFIG_DIR ?? process.env.YIRU_OPENCODE_CONFIG_DIR
  // Why: nested Yiru terminals inherit OPENCODE_CONFIG_DIR from the parent
  // PTY. If there is no recorded source dir, that value is Yiru-owned, not a
  // user config. Treating it as user config makes child Yirus mirror Yiru's
  // hook dir and can create large OpenCode runtime trees per terminal.
  if (configDir && yiruConfigDir && configDir === yiruConfigDir) {
    return undefined
  }

  return (
    configDir ??
    readShellStartupEnvVar(
      'OPENCODE_CONFIG_DIR',
      baseEnv.HOME ?? process.env.HOME,
      baseEnv.SHELL ?? process.env.SHELL
    )
  )
}

/**
 * Mutates `baseEnv` in place with all host-local PTY env vars and returns it.
 *
 * This is the single source of truth for the env shape a Yiru PTY needs
 * BEFORE the provider-specific wrapper (LocalPtyProvider's TERM/LANG defaults,
 * DaemonPtyAdapter's subprocess env). Callers are responsible for the SSH
 * guard — if `args.connectionId` is set, do NOT call this function, because
 * every injection here is either host-loopback (hook server, attribution
 * shims) or references paths on the local filesystem that would be meaningless
 * to a remote shell.
 */
export function buildPtyHostEnv(
  id: string,
  baseEnv: Record<string, string>,
  opts: BuildPtyHostEnvOptions
): Record<string, string> {
  mergePersistedWindowsPath(baseEnv)
  Object.assign(baseEnv, buildConfiguredProxyEnv(opts.networkProxySettings))

  // Why: the Local path passes a baseEnv that already includes process.env
  // (LocalPtyProvider.spawn merges it before calling buildSpawnEnv). The
  // daemon path passes only args.env since process.env propagates to the
  // daemon subprocess via fork inheritance, not the IPC wire. Checking both
  // sources when reading a potentially-user-provided value keeps the guards
  // in lock-step across spawn paths without pushing process.env onto the
  // IPC wire unnecessarily.
  const preexistingOpenCodeConfigDir = resolveOpenCodeSourceConfigDir(baseEnv)
  const launchCommandHint = resolveSetupAgentSequenceLaunchCommand(baseEnv, opts.launchCommand)
  const piAgentKind = detectPiAgentKindFromCommand(launchCommandHint)
  const hasLaunchCommand =
    typeof launchCommandHint === 'string' && launchCommandHint.trim().length > 0

  // Why: unattended agents must fail instead of opening OS credential UI and
  // retrying auth in a loop; ordinary user terminals keep normal Git behavior.
  applyTerminalGitCredentialPromptGuard(baseEnv, {
    launchCommand: launchCommandHint,
    isUnattended: opts.launchAgent !== undefined,
    deferGitConfigGuardToHost: opts.deferGitConfigGuardToDaemon
  })

  const shouldPrepareOmpShadow = piAgentKind === 'omp' || !hasLaunchCommand
  // Why: source shadows are agent-scoped. Trusting the other kind's source
  // would reintroduce the exact Pi/OMP extension-state shadowing this PR fixes.
  const preexistingPiAgentDir = resolvePiAgentSourceDir(baseEnv, 'pi')
  const preexistingOmpAgentDir =
    piAgentKind === 'omp'
      ? resolvePiAgentSourceDir(baseEnv, 'omp')
      : resolveScopedPiAgentSourceDir(baseEnv, 'omp')

  if (opts.agentStatusHooksEnabled) {
    // Why: OPENCODE_CONFIG_DIR is a singular path, not a colon-list, so a user
    // value cannot coexist with a Yiru-only injection. Hand the user's value
    // (when present) to the hook service and let it materialize a source-scoped
    // mirror overlay that lets the user's plugins and Yiru's status plugin
    // load together. See docs/opencode-config-dir-collision.md.
    Object.assign(baseEnv, openCodeHookService.buildPtyEnv(id, preexistingOpenCodeConfigDir))
    if (baseEnv.OPENCODE_CONFIG_DIR) {
      // Why: ~/.zshrc can re-export the user's default after spawn; shell-ready
      // wrappers restore this PTY-scoped value after user startup files run.
      baseEnv.YIRU_OPENCODE_CONFIG_DIR = baseEnv.OPENCODE_CONFIG_DIR
      if (preexistingOpenCodeConfigDir) {
        // Why: terminals launched from another Yiru terminal inherit the overlay
        // as OPENCODE_CONFIG_DIR; keep the original source so overlays do not
        // mirror overlays and drop the user's real config.
        baseEnv.YIRU_OPENCODE_SOURCE_CONFIG_DIR = preexistingOpenCodeConfigDir
      } else {
        delete baseEnv.YIRU_OPENCODE_SOURCE_CONFIG_DIR
      }
    }
    if (isMimoLaunchCommand(launchCommandHint)) {
      const preexistingMimocodeHome = resolveMimocodeSourceHome(baseEnv)
      Object.assign(baseEnv, mimoCodeHookService.buildPtyEnv(id, preexistingMimocodeHome))
      if (baseEnv.MIMOCODE_HOME) {
        baseEnv.YIRU_MIMOCODE_HOME = baseEnv.MIMOCODE_HOME
        if (preexistingMimocodeHome) {
          baseEnv.YIRU_MIMOCODE_SOURCE_HOME = preexistingMimocodeHome
        } else {
          delete baseEnv.YIRU_MIMOCODE_SOURCE_HOME
        }
      }
    }
  } else {
    restoreOrStripOverlayEnv(baseEnv, {
      primary: 'OPENCODE_CONFIG_DIR',
      overlay: 'YIRU_OPENCODE_CONFIG_DIR',
      source: 'YIRU_OPENCODE_SOURCE_CONFIG_DIR'
    })
    restoreOrStripOverlayEnv(baseEnv, {
      primary: 'MIMOCODE_HOME',
      overlay: 'YIRU_MIMOCODE_HOME',
      source: 'YIRU_MIMOCODE_SOURCE_HOME'
    })
  }

  // Why: Claude/Codex native hooks run inside the shell process, so Yiru
  // must inject the loopback receiver coordinates before the agent starts.
  // Without these env vars the global hook config cannot map callbacks back
  // to the correct Yiru pane.
  // Why: nested Yiru terminals can inherit another process's hook endpoint or
  // token. Strip all hook runtime coordinates before injecting this PTY's fresh
  // server values so callbacks route to the owning app/runtime.
  for (const key of AGENT_HOOK_RUNTIME_ENV_KEYS) {
    delete baseEnv[key]
  }
  if (opts.agentStatusHooksEnabled) {
    Object.assign(baseEnv, agentHookServer.buildPtyEnv())
    if (opts.isWsl === true) {
      // Why: hook POSTs to 127.0.0.1 die inside WSL's NAT namespace. Ensure
      // the guest-resident relay for this distro (covers fresh spawns and
      // post-restart reattach re-spawns), and once the relay has reported the
      // guest home, point restart re-coordination at the relay-written
      // guest-side endpoint file instead of the /p-translated Windows one.
      const distro = opts.wslDistro ?? null
      wslHookRelayManager.ensureForDistro(distro)
      const guestEndpoint = wslHookRelayManager.getGuestEndpointFilePath(distro)
      if (guestEndpoint) {
        baseEnv.YIRU_AGENT_HOOK_ENDPOINT = guestEndpoint
      }
    }
  }

  // Why: PI_CODING_AGENT_DIR owns Pi's / OMP's full config/session root. Keep
  // that home as the user's normal source of truth and install only Yiru-owned,
  // env-guarded extension files into the selected agent's extension dir.
  if (opts.agentStatusHooksEnabled) {
    clearPiAgentShadowEnv(baseEnv, 'pi')
    clearPiAgentShadowEnv(baseEnv, 'omp')
    if (piAgentKind === 'pi') {
      const piEnv = piTitlebarExtensionService.buildPtyEnv(id, preexistingPiAgentDir, 'pi')
      Object.assign(baseEnv, piEnv)
      exposePiManagedExtensionEnv(baseEnv, 'pi', piEnv)
    }

    if (shouldPrepareOmpShadow) {
      const ompEnv = piTitlebarExtensionService.buildPtyEnv(id, preexistingOmpAgentDir, 'omp')
      Object.assign(baseEnv, ompEnv)
      exposePiManagedExtensionEnv(baseEnv, 'omp', ompEnv)
    }
  } else {
    // Why: when agent status is disabled we must strip BOTH kinds' shadow vars
    // so a nested PTY does not inherit a stale overlay from either agent.
    restoreOrStripOverlayEnv(baseEnv, {
      primary: 'PI_CODING_AGENT_DIR',
      overlay: 'YIRU_PI_CODING_AGENT_DIR',
      source: 'YIRU_PI_SOURCE_AGENT_DIR'
    })
    restoreOrStripOverlayEnv(baseEnv, {
      primary: 'PI_CODING_AGENT_DIR',
      overlay: 'YIRU_OMP_CODING_AGENT_DIR',
      source: 'YIRU_OMP_SOURCE_AGENT_DIR'
    })
    delete baseEnv.YIRU_OMP_STATUS_EXTENSION
  }

  // Why: Codex account switching now materializes auth into a Yiru-scoped
  // runtime home, and Codex launched inside Yiru terminals must use that same
  // prepared home as quota fetches and other entry points. Keep the override
  // PTY-scoped so dev/prod Yirus do not share hooks through ~/.codex.
  if (opts.skipCodexHomeEnv) {
    delete baseEnv.CODEX_HOME
    delete baseEnv.YIRU_CODEX_HOME
  } else if (opts.selectedCodexHomePath) {
    baseEnv.CODEX_HOME = opts.selectedCodexHomePath
    // Why: user startup files may re-export CODEX_HOME; shell-ready wrappers
    // restore this runtime home before Codex can be launched from the prompt.
    baseEnv.YIRU_CODEX_HOME = opts.selectedCodexHomePath
  } else if (opts.stripInheritedYiruCodexHome) {
    // Why: nested Yiru panes inherit the private marker; a user-owned custom
    // CODEX_HOME has no matching marker and must survive real-home routing.
    for (const key of getLocalYiruCodexHomeEnvKeysToDelete(baseEnv)) {
      delete baseEnv[key]
    }
  }

  // Why: every Yiru-owned terminal carries an exact runtime identity. Replacing
  // inherited values prevents a production PTY opened from a dev shell (or the
  // inverse) from reusing the other app's metadata, daemon socket, or CLI.
  baseEnv.YIRU_USER_DATA_PATH = opts.userDataPath
  const cliEnvironment = getYiruCliEnvironment(opts.isPackaged)
  baseEnv.YIRU_CLI_ENVIRONMENT = cliEnvironment
  baseEnv.YIRU_CLI_COMMAND = resolveYiruCliCommandName({
    environment: cliEnvironment,
    executionHost: opts.isWsl ? 'wsl' : 'native',
    platform: process.platform
  })
  // Why: dev mode needs its launcher on PATH for the resolved `yiru-dev`
  // command; the directory intentionally contains no production-name alias.
  if (!opts.isPackaged) {
    const devCliBin = join(opts.userDataPath, 'cli', 'bin')
    const inheritedPath = readInheritedPath(baseEnv)
    // Why: avoid a trailing delimiter when PATH is empty — some shells
    // treat an empty segment as `.`, which would let commands resolve from
    // the current working directory (a foot-gun we don't want to create
    // for dev terminals).
    baseEnv.PATH = inheritedPath ? `${devCliBin}${delimiter}${inheritedPath}` : devCliBin
  }

  // Why: GitHub attribution should only affect commands launched from
  // Yiru's own PTYs. Injecting lightweight PATH shims at spawn-time keeps
  // the behavior local to Yiru instead of rewriting user git config or
  // touching external shells.
  if (!opts.githubAttributionEnabled) {
    delete baseEnv.YIRU_ENABLE_GIT_ATTRIBUTION
    delete baseEnv.YIRU_GIT_COMMIT_TRAILER
    delete baseEnv.YIRU_GH_PR_FOOTER
    delete baseEnv.YIRU_ATTRIBUTION_SHIM_DIR
  }
  applyTerminalAttributionEnv(baseEnv, {
    enabled: opts.githubAttributionEnabled,
    userDataPath: opts.userDataPath,
    shellFamily: resolveAttributionShellFamily({
      shellPath: opts.shellPath,
      isWsl: opts.isWsl
    })
  })

  return baseEnv
}

function isClaudeLaunchCommand(command: string | undefined): boolean {
  if (!command) {
    return false
  }
  return /(^|[\s;&|('"`])(?:[^\s;&|('"`]*[\\/])?claude(?:\.cmd|\.exe)?($|[\s;&|)'"`])/i.test(
    command
  )
}

function routesFreshSpawnsToLocalProvider(
  provider: IPtyProvider
): provider is FreshLocalFallbackProvider {
  return (provider as FreshLocalFallbackProvider).routesFreshSpawnsToLocalProvider === true
}

function beginPtySpawnForWorktree(
  worktreeId: string | undefined,
  cwd: string | undefined,
  connectionId: string | null | undefined
): () => void {
  const worktreePath = worktreeId
    ? splitWorktreeIdForFilesystem(worktreeId)?.worktreePath
    : undefined
  const installPaths = new Map<string, string>()
  for (const candidate of [worktreePath, cwd]) {
    if (candidate) {
      installPaths.set(normalizeRuntimePathForComparison(candidate), candidate)
    }
  }
  const finishes: (() => void)[] = []
  try {
    for (const candidate of installPaths.values()) {
      finishes.push(beginTerminalInstall(candidate, connectionId ?? undefined))
    }
  } catch (error) {
    // Why: the worktree ID and actual cwd can belong to different roots. If
    // either is deleting, release any earlier admission before rejecting.
    finishes.toReversed().forEach((finish) => finish())
    throw error
  }
  return () => finishes.toReversed().forEach((finish) => finish())
}

/** Get all PTY IDs owned by a given connectionId (for reconnection reattach). */
export function getPtyIdsForConnection(connectionId: string): string[] {
  const ids: string[] = []
  for (const [ptyId, connId] of ptyOwnership) {
    if (connId === connectionId) {
      ids.push(ptyId)
    }
  }
  return ids
}

/**
 * Remove all PTY ownership entries for a given connectionId.
 * Why: when an SSH connection is closed, the remote PTYs are gone but their
 * ownership entries linger. Without cleanup, subsequent spawn calls could
 * look up a stale provider for those PTY IDs, and the map grows unboundedly.
 */
export function clearPtyOwnershipForConnection(connectionId: string): void {
  for (const [ptyId, connId] of ptyOwnership) {
    if (connId === connectionId) {
      // Why: remote PTYs are gone after the SSH connection closes — their
      // paneKey-scoped caches (agent-hooks server, OpenCode, Pi) must be swept
      // the same way a local onExit would, otherwise they leak indefinitely
      // for the process lifetime.
      clearProviderPtyState(ptyId)
      ptyOwnership.delete(ptyId)
    }
  }
}

// ─── Provider-scoped PTY state cleanup ──────────────────────────────

function clearPtyModuleState(id: string): void {
  // Why: OpenCode and Pi both allocate PTY-scoped runtime state outside the
  // node-pty process table. Centralizing provider cleanup avoids drift where a
  // new teardown path forgets to remove one provider's overlay/hook state.
  openCodeHookService.clearPty(id)
  piTitlebarExtensionService.clearPty(id)
  // Why: SSH exit and connection-teardown paths bypass pty.ts's local onExit
  // callback but still need to release Claude account-switch guards.
  markClaudePtyExited(id)
  ptySizes.delete(id)
  providerSnapshotRequiredPtys.delete(id)
  // Why: the Phase-5 ConPTY DA1 spawn record must not leak onto a reused id.
  clearNativeWindowsConptyPty(id)
  const paneKeyBinding = getPtyPaneKeyBinding(id)
  const paneKey = paneKeyBinding?.paneKey
  const stillOwnsPaneKey = paneKeyBinding?.isOwner ?? false
  // Why: drop the memory-collector registration so a dead PTY does not keep
  // trying to resolve its (now-dead) pid on every snapshot. Safe no-op for
  // PTYs that were never registered (SSH-owned).
  unregisterPty(id)
  // Why: cover lifecycle paths that bypass runtime.onPtyExit — SSH reattach
  // failures, SSH connection shutdown (clearPtyOwnershipForConnection), and
  // daemon spawn-failure cleanup all funnel through here. Without this the
  // watcher's per-PTY buffer and worktree binding outlive the PTY.
  advertisedUrlWatcher.unbindPty(id)
  clearMigrationUnsupportedPty(id)
  agentHookServer.clearPaneKeyAliasesForPty(id, {
    shouldClearStablePaneKey: (stablePaneKey) => {
      // Why: when this PTY never rebuilt ptyPaneKey after restart, alias
      // ownership is our only proof. Once a newer PTY owns the same stable
      // paneKey, alias teardown must not erase that newer status.
      const stablePaneOwner = getPaneKeyOwner(stablePaneKey)
      if (stablePaneOwner && stablePaneOwner !== id) {
        return false
      }
      return !paneKey || (stillOwnsPaneKey && stablePaneKey === paneKey)
    }
  })
  // Why: the hook server's per-paneKey caches (lastPrompt / lastTool) would
  // otherwise accumulate entries for dead panes over the process lifetime.
  // Use the spawn-time paneKey mapping since the server has no other way to
  // correlate a ptyId back to its paneKey.
  if (paneKeyBinding) {
    const boundPaneKey = paneKeyBinding.paneKey
    if (stillOwnsPaneKey) {
      agentHookServer.clearPaneState(boundPaneKey)
    }
    forgetPtyPaneKey(id, paneKeyBinding)
    if (stillOwnsPaneKey) {
      // Why: notify registered consumers AFTER we've dropped the paneKey↔ptyId
      // entries so a listener that re-reads the map sees the post-teardown
      // state. Wrap each call so one throwing listener cannot block the rest.
      for (const listener of paneKeyTeardownListeners) {
        try {
          listener(boundPaneKey)
        } catch (err) {
          console.error('[pty] paneKey teardown listener threw', err)
        }
      }
    }
  }
}

installProviderStateCleanup(clearPtyModuleState)

export function deletePtyOwnership(id: string): void {
  ptyOwnership.delete(id)
}

export function setPtyOwnership(id: string, connectionId: string | null): void {
  ptyOwnership.set(id, connectionId)
}

// Why: localProvider.onData/onExit return unsubscribe functions. Without
// storing and calling these on re-registration, macOS app re-activation
// creates a new BrowserWindow and re-calls registerPtyHandlers, leaking
// duplicate listeners that forward every event twice.
let localDataUnsub: (() => void) | null = null
let localExitUnsub: (() => void) | null = null
let localBackgroundStreamUnsub: (() => void) | null = null
let didFinishLoadHandler: (() => void) | null = null
let didFinishLoadWebContents: WebContents | null = null
// Why: after daemon keep-tail thinning, main's mirror contains only the kept
// tail. Recovery must keep consulting the daemon's complete model until exit.
const providerSnapshotRequiredPtys = new Set<string>()

// Why: the "Restart daemon" path needs to re-bind provider→renderer listeners
// against the freshly-created adapter after replaceDaemonProvider swaps the
// module-level `localProvider` pointer. Without this, old subscribers stay
// bound to the disposed adapter and new PTY data silently drops. Saved at
// module scope so the restart flow (src/main/daemon/init.ts) can
// trigger a rebind without re-running the full registerPtyHandlers setup.
let rebindProviderListeners: (() => void) | null = null

export function rebindLocalProviderListeners(): void {
  rebindProviderListeners?.()
}

function clearDidFinishLoadHandler(): void {
  if (didFinishLoadHandler && didFinishLoadWebContents) {
    didFinishLoadWebContents.removeListener('did-finish-load', didFinishLoadHandler)
  }
  didFinishLoadHandler = null
  didFinishLoadWebContents = null
}

// Why: the "Restart daemon" flow needs to detach listeners from the current
// adapter *after* synthetic pty:exit events fan out (so the renderer receives
// them) but *before* replaceDaemonProvider swaps in the new adapter (so the
// new provider isn't missing bindings). This export narrows that window to
// the caller.
export function unbindLocalProviderListeners(): void {
  localDataUnsub?.()
  localExitUnsub?.()
  localBackgroundStreamUnsub?.()
  localDataUnsub = null
  localExitUnsub = null
  localBackgroundStreamUnsub = null
}

// ─── IPC Registration ───────────────────────────────────────────────

export function registerPtyHandlers(
  mainWindow: BrowserWindow,
  runtime?: YiruRuntimeService,
  getSelectedCodexHomePath?: GetSelectedCodexHomePath,
  getSettings?: () => GlobalSettings,
  prepareClaudeAuth?: PrepareClaudeAuth,
  store?: Store,
  options?: {
    awaitLocalPtyStartup?: () => Promise<void>
    // Why: returns true (once, consuming the flag) for the crash-recovery reload
    // so its did-finish-load skips the orphan sweep and keeps live PTYs (#5787).
    isRecoveryReloadInFlight?: (webContentsId: number) => boolean
  }
): void {
  const getLocalPtyStartupPromise = (connectionId?: string | null): Promise<void> | undefined => {
    if (connectionId) {
      return undefined
    }
    // Why: during desktop cold start the daemon provider swap now overlaps
    // first paint. Local spawns must wait before resolving getProvider(), while
    // SSH/headless paths do not use the desktop daemon.
    return options?.awaitLocalPtyStartup?.()
  }

  // Configure the local provider with app-specific hooks.
  // Why: only LocalPtyProvider has the configure() method — daemon-backed
  // providers handle subprocess spawning internally and don't need main-process
  // hook injection. The hooks (buildSpawnEnv, onSpawned, etc.) only make sense
  // when the PTY lives in the Electron main process.
  const configuredProvider = getLocalPtyProvider()
  if (configuredProvider instanceof LocalPtyProvider) {
    configuredProvider.configure({
      isHistoryEnabled: () => getSettings?.()?.terminalScopeHistoryByWorktree ?? true,
      getWindowsShell: () => getSettings?.()?.terminalWindowsShell,
      getWindowsPowerShellImplementation: () =>
        getSettings
          ? (getSettings()?.terminalWindowsPowerShellImplementation ?? 'auto')
          : undefined,
      pwshAvailable: () => isPwshAvailable(),
      buildSpawnEnv: (id, baseEnv, ctx) => {
        const codexSelectionTarget: CodexAccountSelectionTarget =
          ctx?.isWsl === true
            ? { runtime: 'wsl', wslDistro: ctx.wslDistro ?? null }
            : { runtime: 'host' }
        const selectedCodexHomePath = getCompatibleSelectedCodexHomePath(
          codexSelectionTarget,
          getSelectedCodexHomePath?.(codexSelectionTarget, baseEnv) ?? null
        )
        const skipCodexHomeEnv = ctx?.isWsl === true && !selectedCodexHomePath
        const env = buildPtyHostEnv(id, baseEnv, {
          isPackaged: app.isPackaged,
          userDataPath: app.getPath('userData'),
          selectedCodexHomePath,
          skipCodexHomeEnv,
          stripInheritedYiruCodexHome: shouldStripInheritedYiruCodexHome({
            target: codexSelectionTarget,
            selectedCodexHomePath,
            skipCodexHomeEnv
          }),
          githubAttributionEnabled: getSettings?.()?.enableGitHubAttribution ?? false,
          launchCommand: ctx?.command,
          launchAgent: ctx?.launchAgent,
          shellPath: ctx?.shellPath,
          isWsl: ctx?.isWsl,
          wslDistro: ctx?.wslDistro ?? null,
          agentStatusHooksEnabled: isAgentStatusHooksEnabled(getSettings?.()),
          networkProxySettings: getSettings?.()
        })
        // Why: agents need their own terminal handle at process start so they
        // can self-identify in orchestration messages without an extra RPC.
        const requestedHandle = baseEnv.YIRU_TERMINAL_HANDLE
        const preAllocatedHandle =
          requestedHandle && trustedTerminalHandleEnv.has(requestedHandle)
            ? requestedHandle
            : runtime?.preAllocateHandleForPty(id)
        if (requestedHandle && requestedHandle !== preAllocatedHandle) {
          delete env.YIRU_TERMINAL_HANDLE
        }
        if (preAllocatedHandle) {
          env.YIRU_TERMINAL_HANDLE = preAllocatedHandle
        }
        if (ctx?.isWsl === true) {
          addYiruWslInteropEnv(env)
        }
        return env
      },
      onSpawned: (id) => runtime?.onPtySpawned(id),
      onExit: (id, code) => {
        clearProviderPtyState(id)
        ptyOwnership.delete(id)
        markClaudePtyExited(id)
        runtime?.onPtyExit(id, code)
      }
    })
  }

  async function shutdownProviderAndDetectExit(
    provider: IPtyProvider,
    id: string,
    opts: { immediate?: boolean; keepHistory?: boolean }
  ): Promise<boolean> {
    let providerExitObserved = false
    const unsubscribe = provider.onExit((payload) => {
      if (payload.id === id) {
        providerExitObserved = true
      }
    })
    try {
      await provider.shutdown(id, opts)
    } finally {
      unsubscribe()
    }
    return providerExitObserved
  }

  // Why: extracted so the "Restart daemon" flow can rebind against the fresh
  // adapter after replaceDaemonProvider runs. Both the startup registration
  // and the post-restart rebind go through the same code path — no risk of
  // drift between the two entry points.
  const bindProviderListeners = (): void => {
    localDataUnsub?.()
    localExitUnsub?.()
    localBackgroundStreamUnsub?.()

    const provider = getLocalPtyProvider()
    const isLocalProvider = provider instanceof LocalPtyProvider
    localBackgroundStreamUnsub =
      provider.onBackgroundStreamEvent?.((payload) => {
        if (payload.kind === 'backgroundMarker') {
          runtime?.setPtyTransientFactDelegation(
            payload.id,
            payload.background,
            payload.scanSeedAnsi
          )
          return
        }
        if (payload.kind === 'dataGap') {
          providerSnapshotRequiredPtys.add(payload.id)
          runtime?.notePtyDataGap(payload.id, payload.sequenceChars ?? payload.droppedChars)
          return
        }
        runtime?.emitDaemonPtyTransientFact(payload.id, payload.fact)
      }) ?? null
    localDataUnsub = provider.onData((payload) => {
      const queryReplyOwner = runtime?.getTerminalQueryReplyOwnerForLiveChunk(payload.id) ?? 'model'
      runtime?.onPtyData(
        payload.id,
        payload.data,
        Date.now(),
        payload.sequenceChars ?? payload.data.length,
        queryReplyOwner
      )
    })
    localExitUnsub = provider.onExit((payload) => {
      if (!isLocalProvider) {
        clearProviderPtyState(payload.id)
        ptyOwnership.delete(payload.id)
        markClaudePtyExited(payload.id)
        runtime?.onPtyExit(payload.id, payload.code)
      }
    })
  }

  bindProviderListeners()
  rebindProviderListeners = bindProviderListeners

  // Kill orphaned PTY processes from previous page loads when the renderer reloads.
  // Why: only applies to LocalPtyProvider where PTYs live in the Electron main
  // process and can become orphaned on page reload. Daemon-backed sessions
  // survive renderer restarts by design — orphan cleanup would kill them.
  clearDidFinishLoadHandler()
  const rendererProvider = getLocalPtyProvider()
  if (rendererProvider instanceof LocalPtyProvider) {
    const lp = rendererProvider
    didFinishLoadHandler = () => {
      // Why: always advance so the load generation stays monotonic, but skip the
      // sweep (and its per-PTY cleanup) on the crash/freeze-recovery reload — it
      // would kill live LOCAL PTYs across the single window before session
      // restore re-attaches them (#5787). The getter consumes the flag, so the
      // next genuine reload still reclaims genuinely-orphaned PTYs.
      const generation = lp.advanceGeneration()
      if (options?.isRecoveryReloadInFlight?.(mainWindow.webContents.id)) {
        return
      }
      // Why: the retained provider onExit callback is the only physical-exit
      // proof; it clears ownership and notifies runtime after the OS reaps it.
      lp.killOrphanedPtys(generation - 1)
    }
    didFinishLoadWebContents = mainWindow.webContents
    mainWindow.webContents.on('did-finish-load', didFinishLoadHandler)
  }

  const assertFolderWorkspacePtyPathUsable = async (
    worktreeId: string | undefined
  ): Promise<void> => {
    const workspaceScope = typeof worktreeId === 'string' ? parseWorkspaceKey(worktreeId) : null
    if (!store || workspaceScope?.type !== 'folder') {
      return
    }
    const status = await getFolderWorkspacePathStatus(store, {
      scope: 'folder-workspace',
      folderWorkspaceId: workspaceScope.folderWorkspaceId
    })
    assertFolderWorkspacePathUsable(status)
  }

  const resolvePtySpawnStartupCwd = (
    worktreeId: string | undefined,
    cwd: string | undefined,
    missingDirFallback?: TerminalStartupCwdMissingDirFallback
  ): string | undefined =>
    resolveTerminalStartupCwdForWorkspace({
      workspaceId: worktreeId,
      requestedCwd: cwd,
      missingDirFallback,
      resolveFolderWorkspacePath: (folderWorkspaceId) =>
        store?.getFolderWorkspace(folderWorkspaceId)?.folderPath
    })

  // Why: the runtime controller must route through getProviderForPty() so that
  // CLI commands (terminal.send, terminal.stop) work for both local and remote PTYs.
  // Hardcoding localProvider.getPtyProcess() would silently fail for remote PTYs.
  runtime?.setPtyController({
    spawn: async (args) => {
      const startupPromise = getLocalPtyStartupPromise(args.connectionId)
      if (startupPromise) {
        await startupPromise
      }
      await assertFolderWorkspacePtyPathUsable(args.worktreeId)
      let startupCwdFallback: { kind: 'worktree'; cwd: string } | undefined
      const cwd = resolvePtySpawnStartupCwd(
        args.worktreeId,
        args.cwd,
        args.cwdFallback === 'worktree' && !args.connectionId
          ? {
              directoryExists: existsSync,
              onFallbackToWorkspaceRoot: (fallbackCwd) => {
                startupCwdFallback = { kind: 'worktree', cwd: fallbackCwd }
              }
            }
          : undefined
      )
      const provider = getProvider(args.connectionId)
      const isClaudeLaunch = !args.connectionId && isClaudeLaunchCommand(args.command)
      if (isClaudeLaunch && isClaudeAuthSwitchInProgress()) {
        throw new Error('A Claude account switch is in progress. Try again after it finishes.')
      }
      // Why: runtime-created terminals do not carry renderer-computed
      // projectRuntime, so resolve from worktreeId to honor project Windows runtime.
      const terminalRuntimeOptions =
        process.platform === 'win32' && !args.connectionId
          ? resolveLocalWindowsTerminalRuntimeOptions({
              requestedShellOverride: undefined,
              settings: getSettings?.(),
              projectRuntime: resolveLocalProjectRuntimeForWorktreeId(store, args.worktreeId),
              fallbackHostShell: process.env.COMSPEC || 'powershell.exe'
            })
          : { shellOverride: undefined, terminalWindowsWslDistro: null }
      const daemonShellOverride = terminalRuntimeOptions.shellOverride
      const codexSelectionTarget = getCodexSelectionTargetForPty(
        daemonShellOverride,
        cwd,
        terminalRuntimeOptions.terminalWindowsWslDistro ?? null
      )
      const claudeAuth =
        isClaudeLaunch && prepareClaudeAuth ? await prepareClaudeAuth(codexSelectionTarget) : null
      if (isClaudeLaunch && isClaudeAuthSwitchInProgress()) {
        throw new Error('A Claude account switch is in progress. Try again after it finishes.')
      }
      if (claudeAuth?.stripAuthEnv && hasClaudeAuthEnvConflict(args.env)) {
        throw new Error(
          'This Claude launch defines explicit Anthropic auth environment variables. Remove those overrides before using a managed Claude account.'
        )
      }

      const isDaemonHostSpawn =
        !args.connectionId &&
        !(provider instanceof LocalPtyProvider) &&
        !routesFreshSpawnsToLocalProvider(provider)
      const requestedSessionId = args.sessionId?.trim()
      const sessionId =
        requestedSessionId ?? (isDaemonHostSpawn ? mintPtySessionId(args.worktreeId) : undefined)
      const effectiveSessionRelayId =
        sessionId !== undefined ? getRelayPtyId(args.connectionId, sessionId) : undefined
      const effectiveSessionAppId =
        sessionId !== undefined ? getAppPtyId(args.connectionId, sessionId) : undefined
      const isMintedSessionId = requestedSessionId === undefined && isDaemonHostSpawn
      const shouldPersistHostSessionBinding = args.persistHostSessionBinding === true
      let hostSessionBinding: {
        store: NonNullable<typeof store>
        worktreeId: string
        tabId: string
        leafId: string
      } | null = null
      if (shouldPersistHostSessionBinding) {
        if (
          !store ||
          typeof args.worktreeId !== 'string' ||
          typeof args.tabId !== 'string' ||
          !isValidTerminalTabId(args.tabId) ||
          typeof args.leafId !== 'string' ||
          !isTerminalLeafId(args.leafId)
        ) {
          throw new Error(
            'Cannot persist runtime PTY binding without worktreeId, tabId, and leafId'
          )
        }
        hostSessionBinding = {
          store,
          worktreeId: args.worktreeId,
          tabId: args.tabId,
          leafId: args.leafId
        }
      }
      const sshScopedEnv = stripRemotePaneEnvWhenHooksDisabled(args.connectionId, args.env)
      let env: Record<string, string> | undefined = claudeAuth
        ? { ...sshScopedEnv, ...claudeAuth.envPatch }
        : sshScopedEnv
      const requestedAgentTeamsPath = env?.YIRU_AGENT_TEAMS_TEAM_ID ? env.PATH : undefined
      const terminalCommand =
        args.command && args.launchAgent === 'claude-agent-teams'
          ? rewriteYiruCliCommandPrefix(args.command, {
              environment: getYiruCliEnvironment(Boolean(args.connectionId) || app.isPackaged),
              executionHost: codexSelectionTarget.runtime === 'wsl' ? 'wsl' : 'native',
              platform: process.platform
            })
          : args.command
      if (args.preAllocatedHandle) {
        env = { ...env, YIRU_TERMINAL_HANDLE: args.preAllocatedHandle }
      }
      const selectedCodexHomePath = isDaemonHostSpawn
        ? getCompatibleSelectedCodexHomePath(
            codexSelectionTarget,
            getSelectedCodexHomePath?.(codexSelectionTarget, env) ?? null
          )
        : null
      const skipCodexHomeEnv =
        isDaemonHostSpawn &&
        shouldSkipCodexHomeEnvForWindowsShell(daemonShellOverride, cwd) &&
        !selectedCodexHomePath
      const stripInheritedYiruCodexHome =
        isDaemonHostSpawn &&
        shouldStripInheritedYiruCodexHome({
          target: codexSelectionTarget,
          selectedCodexHomePath,
          skipCodexHomeEnv
        })
      if (isDaemonHostSpawn && sessionId) {
        if (!isSafePtySessionId(sessionId, app.getPath('userData'))) {
          throw new Error('Invalid PTY session id')
        }
        env = buildPtyHostEnv(sessionId, env ?? {}, {
          isPackaged: app.isPackaged,
          userDataPath: app.getPath('userData'),
          selectedCodexHomePath,
          skipCodexHomeEnv,
          stripInheritedYiruCodexHome,
          githubAttributionEnabled: getSettings?.()?.enableGitHubAttribution ?? false,
          launchCommand: terminalCommand,
          launchAgent: isTuiAgent(args.launchAgent) ? args.launchAgent : undefined,
          shellPath: daemonShellOverride ?? process.env.COMSPEC,
          isWsl: shouldSkipCodexHomeEnvForWindowsShell(daemonShellOverride, cwd),
          wslDistro: codexSelectionTarget.runtime === 'wsl' ? codexSelectionTarget.wslDistro : null,
          agentStatusHooksEnabled: isAgentStatusHooksEnabled(getSettings?.()),
          networkProxySettings: getSettings?.(),
          deferGitConfigGuardToDaemon: provider.supportsGitCredentialGuardHost?.(sessionId) === true
        })
        promoteAgentTeamsShimPath(env, requestedAgentTeamsPath)
      }

      const authEnvToDelete = claudeAuth?.stripAuthEnv
        ? [...CLAUDE_AUTH_ENV_VARS, 'ANTHROPIC_CUSTOM_HEADERS']
        : undefined
      const spawnOptions: PtySpawnOptions = {
        cols: args.cols,
        rows: args.rows,
        cwd,
        env,
        ...(isMintedSessionId ? { isNewSession: true } : {})
      }
      spawnOptions.envToDelete = mergePtyEnvDeletions(
        mergePtyEnvDeletions(authEnvToDelete, args.envToDelete ?? []),
        isDaemonHostSpawn ? getInheritedAgentHookEnvKeysToDelete(env) : []
      )
      if (skipCodexHomeEnv) {
        spawnOptions.envToDelete = mergePtyEnvDeletions(
          spawnOptions.envToDelete,
          CODEX_HOME_ENV_KEYS
        )
      } else if (stripInheritedYiruCodexHome) {
        // Why: the persistent daemon must compare against its own inherited
        // marker; Electron cannot safely decide ownership for that process.
        spawnOptions.envToDelete = mergePtyEnvDeletions(spawnOptions.envToDelete, [
          'YIRU_CODEX_HOME'
        ])
      }
      deleteRequestedEnvKeys(env, spawnOptions.envToDelete)
      promoteAgentTeamsShimPath(env, requestedAgentTeamsPath)
      if (terminalCommand !== undefined) {
        spawnOptions.command = terminalCommand
      }
      if (args.commandDelivery !== undefined) {
        spawnOptions.commandDelivery = args.commandDelivery
      }
      if (args.startupCommandDelivery !== undefined) {
        spawnOptions.startupCommandDelivery = args.startupCommandDelivery
      }
      if (isTuiAgent(args.launchAgent)) {
        spawnOptions.launchAgent = args.launchAgent
      }
      if (args.worktreeId !== undefined) {
        spawnOptions.worktreeId = args.worktreeId
      }
      const hadSessionSizeBeforeAttach =
        effectiveSessionAppId !== undefined ? ptySizes.has(effectiveSessionAppId) : false
      const sessionSizeBeforeAttach =
        effectiveSessionAppId !== undefined ? ptySizes.get(effectiveSessionAppId) : undefined
      if (sessionId !== undefined) {
        spawnOptions.sessionId = sessionId
        ptySizes.set(effectiveSessionAppId ?? sessionId, { cols: args.cols, rows: args.rows })
      }
      const materializedPaneKey = hostSessionBinding
        ? makePaneKey(hostSessionBinding.tabId, hostSessionBinding.leafId)
        : null
      const metadataLeafId =
        typeof args.leafId === 'string' && isTerminalLeafId(args.leafId) ? args.leafId : null
      const metadataPaneKey =
        typeof args.tabId === 'string' &&
        isValidTerminalTabId(args.tabId) &&
        args.tabId.length <= 512 &&
        metadataLeafId
          ? makePaneKey(args.tabId, metadataLeafId)
          : null
      const spawnIdentityPaneKey = materializedPaneKey ?? metadataPaneKey
      if (spawnIdentityPaneKey) {
        spawnOptions.paneKey = spawnIdentityPaneKey
      }
      if (typeof args.tabId === 'string' && args.tabId.length > 0 && args.tabId.length <= 512) {
        spawnOptions.tabId = args.tabId
      }
      if (process.platform === 'win32' && !args.connectionId) {
        spawnOptions.shellOverride = terminalRuntimeOptions.shellOverride
        spawnOptions.terminalWindowsWslDistro =
          terminalRuntimeOptions.terminalWindowsWslDistro ?? null
        spawnOptions.terminalWindowsPowerShellImplementation = getSettings
          ? (getSettings()?.terminalWindowsPowerShellImplementation ?? 'auto')
          : undefined
      }

      const existingPaneSpawn = materializedPaneKey
        ? paneSpawnReservationsByPaneKey.get(materializedPaneKey)
        : undefined
      if (existingPaneSpawn) {
        return await existingPaneSpawn.promise
      }
      const finishTerminalInstall = beginPtySpawnForWorktree(
        args.worktreeId,
        cwd,
        args.connectionId
      )
      const paneSpawnReservation = materializedPaneKey
        ? reservePaneSpawn(materializedPaneKey)
        : null
      let result: PtySpawnResult
      try {
        try {
          if (args.preAllocatedHandle) {
            trustedTerminalHandleEnv.add(args.preAllocatedHandle)
          }
          const expectedPtyId = effectiveSessionAppId ?? sessionId
          const sequenceBeforeProviderSpawn = expectedPtyId
            ? (runtime?.getPtyOutputSequence?.(expectedPtyId) ?? 0)
            : 0
          result = await provider.spawn(spawnOptions)
          if (result.providerSequence) {
            runtime?.synchronizePtyOutputSequenceFromProvider?.(
              result.id,
              result.providerSequence,
              sequenceBeforeProviderSpawn
            )
          }
        } catch (err) {
          const rawMessage = err instanceof Error ? err.message : String(err)
          const spawnError = normalizeNodePtySpawnError(err)
          const isIdentityMismatch =
            isSshPtyIdentityMismatchError(spawnError) || isSshPtyIdentityMismatchError(rawMessage)
          if (effectiveSessionAppId !== undefined) {
            if (isIdentityMismatch && hadSessionSizeBeforeAttach && sessionSizeBeforeAttach) {
              ptySizes.set(effectiveSessionAppId, sessionSizeBeforeAttach)
            } else {
              ptySizes.delete(effectiveSessionAppId)
            }
          }
          if (
            args.connectionId &&
            effectiveSessionRelayId !== undefined &&
            (spawnError.message.includes(SSH_SESSION_EXPIRED_ERROR) ||
              rawMessage.includes(SSH_SESSION_EXPIRED_ERROR))
          ) {
            if (effectiveSessionAppId !== undefined && !isIdentityMismatch) {
              clearProviderPtyState(effectiveSessionAppId)
              deletePtyOwnership(effectiveSessionAppId)
            }
          }
          if (isMintedSessionId && sessionId !== undefined) {
            clearProviderPtyState(sessionId)
          }
          throw spawnError
        } finally {
          if (args.preAllocatedHandle) {
            trustedTerminalHandleEnv.delete(args.preAllocatedHandle)
          }
        }
        const worktreeInstanceId = resolveSpawnPtyWorktreeInstanceId(store, {
          ...(args.worktreeId ? { worktreeId: args.worktreeId } : {}),
          ...(args.tabId ? { tabId: args.tabId } : {}),
          ...(metadataLeafId ? { leafId: metadataLeafId } : {}),
          ptyId: result.id,
          connectionId: args.connectionId,
          isReattach: result.isReattach === true
        })
        ptyOwnership.set(result.id, args.connectionId ?? null)
        // Why: Phase-5 ConPTY DA1 — record the native-Windows-local-PTY
        // determination from the spawn record before any byte reaches the
        // runtime emulator, so its DA1 override exists from byte zero.
        if (
          isNativeWindowsLocalPtySpawn({
            connectionId: args.connectionId,
            cwd: args.cwd,
            shellOverride: daemonShellOverride
          })
        ) {
          markNativeWindowsConptyPty(result.id)
        }
        ptySizes.set(result.id, { cols: args.cols, rows: args.rows })
        if (effectiveSessionAppId !== undefined && effectiveSessionAppId !== result.id) {
          ptySizes.delete(effectiveSessionAppId)
        }
        if (hostSessionBinding) {
          try {
            hostSessionBinding.store.persistPtyBinding({
              worktreeId: hostSessionBinding.worktreeId,
              worktreeInstanceId,
              tabId: hostSessionBinding.tabId,
              leafId: hostSessionBinding.leafId,
              ptyId: result.id,
              ...(cwd ? { startupCwd: cwd } : {})
            })
          } catch (err) {
            console.error('[pty] failed to persist runtime PTY binding after spawn:', err)
            deletePtyOwnership(result.id)
            if (!result.isReattach) {
              try {
                await provider.shutdown(result.id, { immediate: true })
              } catch (shutdownErr) {
                console.warn('[pty] failed to clean up PTY after persistence failure:', shutdownErr)
              }
              clearProviderPtyState(result.id)
            }
            throw new Error(createTerminalSessionStateSaveFailureMessage())
          }
        }
        if (args.preAllocatedHandle) {
          runtime?.registerPreAllocatedHandleForPty(result.id, args.preAllocatedHandle)
        }
        if (args.worktreeId) {
          runtime?.registerPty(
            result.id,
            args.worktreeId,
            args.connectionId ?? null,
            // Why: thread the validated pane identity so main can back a pending
            // mobile create from this live spawn even if graph-sync stalls (#7587).
            // Bound tabId like the sibling metadataPaneKey/spawnOptions.tabId here.
            typeof args.tabId === 'string' &&
              isValidTerminalTabId(args.tabId) &&
              args.tabId.length <= 512 &&
              metadataLeafId !== null
              ? { tabId: args.tabId, leafId: metadataLeafId }
              : undefined,
            !args.connectionId
              ? shouldSkipCodexHomeEnvForWindowsShell(daemonShellOverride, cwd)
              : undefined,
            worktreeInstanceId
          )
        }
        // Why: arms main's per-PTY Command Code output detector from the launch
        // command (renderer startupCommand parity); banner detection covers
        // PTYs spawned without one.
        runtime?.noteTerminalSpawnCommand?.(result.id, args.command ?? null)
        if (isClaudeLaunch) {
          markClaudePtySpawned(result.id)
        }
        if (args.telemetry) {
          const agentKindParse = agentKindSchema.safeParse(args.telemetry.agent_kind)
          const launchSourceParse = launchSourceSchema.safeParse(args.telemetry.launch_source)
          const requestKindParse = requestKindSchema.safeParse(args.telemetry.request_kind)
          if (agentKindParse.success && launchSourceParse.success && requestKindParse.success) {
            track('agent_started', {
              agent_kind: agentKindParse.data,
              launch_source: launchSourceParse.data,
              request_kind: requestKindParse.data,
              ...getCohortAtEmit()
            })
          }
        }
        // Why: runtime-owned CLI PTYs bypass the renderer `pty:spawn` handler,
        // so record their spawn-time paneKey here too. Synthetic hook titles and
        // paneKey-scoped cache cleanup both depend on this reverse lookup.
        const paneKey = rememberPaneKeyForPty(result.id, env?.YIRU_PANE_KEY)
        if (!args.connectionId) {
          registerPty({
            ptyId: result.id,
            worktreeId: args.worktreeId ?? null,
            sessionId: sessionId ?? null,
            paneKey,
            pid:
              typeof result.pid === 'number' && Number.isFinite(result.pid) && result.pid > 0
                ? result.pid
                : null
          })
        }
        const response = { id: result.id, ...(startupCwdFallback ? { startupCwdFallback } : {}) }
        return resolvePaneSpawnReservation(materializedPaneKey, paneSpawnReservation, response)
      } catch (err) {
        // Why: once the reservation is created, any later throw — spawn
        // failure, persist failure, or a post-spawn helper such as
        // registerPty/rememberPaneKeyForPty/track — must settle it. Otherwise
        // it lingers in paneSpawnReservationsByPaneKey and every future spawn
        // for this pane awaits a promise that never resolves. reject is a
        // no-op once the reservation has already resolved.
        rejectPaneSpawnReservation(materializedPaneKey, paneSpawnReservation, err)
        throw err
      } finally {
        finishTerminalInstall()
      }
    },
    write: (ptyId, data) => {
      const provider = getProviderForPty(ptyId)
      try {
        provider.write(ptyId, data)
        return true
      } catch {
        return false
      }
    },
    kill: (ptyId) => {
      let provider: IPtyProvider
      let connectionId: string | null | undefined = ptyOwnership.get(ptyId)
      const parsedSshId = connectionId === undefined ? parseAppSshPtyId(ptyId) : null
      connectionId ??= parsedSshId?.connectionId
      try {
        provider = connectionId ? getProvider(connectionId) : getProviderForPty(ptyId)
      } catch {
        if (connectionId) {
          // Why: runtime/CLI close can target a detached SSH PTY after its
          finishPtyShutdown(ptyId)
          runtime?.onPtyExit(ptyId, -1)
          return true
        }
        return false
      }
      // Why: shutdown() is async but the PtyController interface is sync. Defer
      // cleanup until shutdown resolves so transient SSH/daemon failures don't
      // hide a still-running remote process or local daemon session.
      //
      // Same synthetic-exit contract as the renderer pty:kill handler: when the
      // provider emitted its own exit during shutdown, the exit listener already
      // delivered runtime + renderer exits — synthesizing again would double-fire.
      void shutdownProviderAndDetectExit(provider, ptyId, { immediate: false })
        .then((providerExitObserved) => {
          finishPtyShutdown(ptyId)
          if (!providerExitObserved) {
            runtime?.onPtyExit(ptyId, -1)
          }
        })
        .catch((err) => {
          if (isPtyAlreadyGoneError(err)) {
            finishPtyShutdown(ptyId)
            runtime?.onPtyExit(ptyId, -1)
            return
          }
          console.warn(
            `[pty] Failed to stop PTY ${ptyId}: ${err instanceof Error ? err.message : String(err)}`
          )
          // Why: callers of controller.kill must observe a kill→exit pair so
          // runtime tail buffers close and agents stop treating the pane as
          // live. Preserve provider/lease state so a retry can still target
          // the remote PTY if it survived the transient failure.
          runtime?.onPtyExit(ptyId, -1)
        })
      return true
    },
    stopAndWait: async (ptyId, opts) => {
      let provider: IPtyProvider
      let connectionId: string | null | undefined = ptyOwnership.get(ptyId)
      const parsedSshId = connectionId === undefined ? parseAppSshPtyId(ptyId) : null
      connectionId ??= parsedSshId?.connectionId
      try {
        provider = connectionId ? getProvider(connectionId) : getProviderForPty(ptyId)
      } catch {
        if (connectionId) {
          finishPtyShutdown(ptyId)
          runtime?.onPtyExit(ptyId, -1)
          return true
        }
        return false
      }
      let providerExitObserved = false
      try {
        providerExitObserved = await shutdownProviderAndDetectExit(provider, ptyId, {
          immediate: true,
          keepHistory: opts?.keepHistory ?? false
        })
      } catch (err) {
        if (!isPtyAlreadyGoneError(err)) {
          console.warn(
            `[pty] Failed to stop PTY ${ptyId}: ${err instanceof Error ? err.message : String(err)}`
          )
          return false
        }
      }
      try {
        if (!(await verifyPtyStopped(provider, ptyId, opts))) {
          return false
        }
      } catch (err) {
        console.warn(
          `[pty] Failed to verify PTY ${ptyId} stopped: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
        return false
      }
      finishPtyShutdown(ptyId)
      if (!providerExitObserved) {
        runtime?.onPtyExit(ptyId, -1)
      }
      return true
    },
    getForegroundProcess: async (ptyId) => {
      try {
        return await getProviderForPty(ptyId).getForegroundProcess(ptyId)
      } catch {
        return null
      }
    },
    confirmForegroundProcess: async (ptyId) => {
      try {
        const provider = getProviderForPty(ptyId)
        // Why: cached foreground evidence cannot resolve a fresh shell conflict.
        return (await provider.confirmForegroundProcess?.(ptyId)) ?? null
      } catch {
        return null
      }
    },
    getCwd: async (ptyId) => {
      try {
        const cwd = await getProviderForPty(ptyId).getCwd(ptyId)
        return cwd || null
      } catch {
        return null
      }
    },
    hasChildProcesses: async (ptyId) => {
      try {
        return await getProviderForPty(ptyId).hasChildProcesses(ptyId)
      } catch {
        return false
      }
    },
    clearBuffer: async (ptyId) => {
      try {
        await getProviderForPty(ptyId).clearBuffer(ptyId)
      } catch {
        /* best effort: renderer clear still handles local PTYs */
      }
    },
    hasPty: (ptyId) => {
      const ownedConnectionId = ptyOwnership.get(ptyId)
      const parsedSshId = ownedConnectionId === undefined ? parseAppSshPtyId(ptyId) : null
      try {
        const provider = parsedSshId
          ? getProvider(parsedSshId.connectionId)
          : getProviderForPty(ptyId)
        return provider.hasPty?.(ptyId) ?? null
      } catch {
        // Why: only an authoritative false may retire a restored Mobile terminal.
        return null
      }
    },
    listProcesses: async () => {
      // Why: no transport registers a connection-scoped PTY provider (SSH
      // removal, #63), so the local provider is the only source left.
      return getLocalPtyProvider().listProcesses()
    },
    serializeProviderBuffer: async (ptyId, opts) => {
      try {
        // Why: restored daemon PTYs can be live while their desktop pane stays
        // unmounted; query the provider model so phone-local navigation works.
        return (await getProviderForPty(ptyId).getBufferSnapshot?.(ptyId, opts)) ?? null
      } catch {
        return null
      }
    },
    getSize: (ptyId) => ptySizes.get(ptyId) ?? null,
    resize: (ptyId, cols, rows) => {
      try {
        getProviderForPty(ptyId).resize(ptyId, cols, rows)
        ptySizes.set(ptyId, { cols, rows })
        return true
      } catch {
        return false
      }
    }
  })
}

export function registerHeadlessPtyRuntime(
  runtime: YiruRuntimeService,
  getSelectedCodexHomePath?: GetSelectedCodexHomePath,
  getSettings?: () => GlobalSettings,
  prepareClaudeAuth?: PrepareClaudeAuth,
  store?: Store
): void {
  // Why: headless `yiru serve` has no renderer window, but the runtime still
  // needs the same PTY controller and provider listeners as desktop so remote
  // clients can create, stream, inspect, and stop terminals.
  const headlessWindow = {
    isDestroyed: () => true,
    webContents: {
      send: () => {},
      on: () => {},
      removeListener: () => {}
    }
  } as unknown as BrowserWindow
  registerPtyHandlers(
    headlessWindow,
    runtime,
    getSelectedCodexHomePath,
    getSettings,
    prepareClaudeAuth,
    store
  )
}

/**
 * Kill in-process local PTYs. Daemon-backed PTYs are preserved by daemon disconnect.
 */
