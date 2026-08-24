import { normalizeRuntimePathForComparison } from '@yiru/workbench-model/platform'
import { splitWorktreeIdForFilesystem } from '@yiru/workbench-model/workspace'

import { clearMigrationUnsupportedPty } from '../agent-hooks/migration-unsupported-pty-state'
import { agentHookServer } from '../agent-hooks/server'
import { markClaudePtyExited } from '../claude/accounts/live-pty-gate'
import { beginTerminalInstall } from '../filesystem/watcher-removal-gate'
import { unregisterPty } from '../memory/pty-registry'
import { openCodeHookService } from '../opencode/hook-service'
import { piTitlebarExtensionService } from '../pi/titlebar-extension-service'
import { advertisedUrlWatcher } from '../ports/advertised-url-watcher'
import type { IPtyProvider } from '../providers/types'
import { clearNativeWindowsConptyPty } from '../runtime/terminal-model-query-authority'
import { forgetPtyPaneKey, getPaneKeyOwner, getPtyPaneKeyBinding } from './pane-key-registry'
import { clearProviderPtyState, installProviderStateCleanup } from './provider-registry'
import type { FreshLocalFallbackProvider } from './runtime-state'
import { ptyOwnership, ptySizes, paneKeyTeardownListeners } from './runtime-state'

export const providerSnapshotRequiredPtys = new Set<string>()

export function isClaudeLaunchCommand(command: string | undefined): boolean {
  if (!command) {
    return false
  }
  return /(^|[\s;&|('"`])(?:[^\s;&|('"`]*[\\/])?claude(?:\.cmd|\.exe)?($|[\s;&|)'"`])/i.test(
    command
  )
}

export function routesFreshSpawnsToLocalProvider(
  provider: IPtyProvider
): provider is FreshLocalFallbackProvider {
  return (provider as FreshLocalFallbackProvider).routesFreshSpawnsToLocalProvider === true
}

export function beginPtySpawnForWorktree(
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

export function clearPtyModuleState(id: string): void {
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
