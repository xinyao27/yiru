import { agentKindSchema, launchSourceSchema, requestKindSchema } from '~shared/telemetry-events'
import { createTerminalSessionStateSaveFailureMessage } from '~shared/terminal/session-state-save-failure'
import { isValidTerminalTabId } from '~shared/terminal/tab-id'

import { markClaudePtySpawned } from '../claude/accounts/live-pty-gate'
import { registerPty } from '../memory/pty-registry'
import type { PtySpawnResult } from '../providers/types'
import {
  isNativeWindowsLocalPtySpawn,
  markNativeWindowsConptyPty
} from '../runtime/terminal-model-query-authority'
import { track } from '../telemetry/client'
import { getCohortAtEmit } from '../telemetry/cohort-classifier'
import { shouldSkipCodexHomeEnvForWindowsShell } from './host-env-values'
import { deletePtyOwnership } from './provider-lifecycle'
import { clearProviderPtyState } from './provider-registry'
import { prepareRuntimePtySpawn } from './runtime-spawn'
import type { RuntimePtySpawnDependencies } from './runtime-spawn-model'
import {
  SSH_SESSION_EXPIRED_ERROR,
  isSshPtyIdentityMismatchError,
  ptyOwnership,
  ptySizes,
  trustedTerminalHandleEnv,
  rememberPaneKeyForPty,
  rejectPaneSpawnReservation,
  resolvePaneSpawnReservation,
  resolveSpawnPtyWorktreeInstanceId,
  normalizeNodePtySpawnError
} from './runtime-state'

export async function spawnRuntimePty(
  args: Parameters<typeof prepareRuntimePtySpawn>[0],
  deps: RuntimePtySpawnDependencies
) {
  const prepared = await prepareRuntimePtySpawn(args, deps)
  if (prepared.kind === 'existing') {
    return prepared.result
  }
  const {
    provider,
    cwd,
    daemonShellOverride,
    env,
    sessionId,
    effectiveSessionRelayId,
    effectiveSessionAppId,
    isMintedSessionId,
    hostSessionBinding,
    spawnOptions,
    materializedPaneKey,
    metadataLeafId,
    paneSpawnReservation,
    finishTerminalInstall,
    hadSessionSizeBeforeAttach,
    sessionSizeBeforeAttach,
    startupCwdFallback,
    isClaudeLaunch
  } = prepared
  const { runtime, store } = deps
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
}
