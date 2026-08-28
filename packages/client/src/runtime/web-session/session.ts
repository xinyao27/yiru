import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import { isRuntimeSubscriptionReplayResponse } from '@yiru/runtime-protocol/subscription-replay'
import { useEffect } from 'react'
import { useAppStore } from '~renderer/store/state'
import {
  getExplicitRuntimeEnvironmentIdForWorktree,
  getRuntimeSessionMirrorEnvironmentIds
} from '~renderer/worktree/runtime-owner'

import { callRuntimeOrpc, createRuntimeOrpcClient, isWebRuntimeClient } from '../orpc-client'
import { runtimeEnvironmentsClient } from '../runtime-environments-client'
import {
  beginWebRuntimeWakeTerminalRespawn,
  endWebRuntimeWakeTerminalRespawn,
  shouldSkipWebRuntimeWakeTerminalRespawn
} from '../web-runtime-wake-terminal-respawn'
import { toRuntimeWorktreeSelector } from '../worktree-selector'
import {
  applyFreshWebSessionTabsSnapshots,
  applyWebSessionTabsSnapshot,
  applyWebSessionTabsStorePatch
} from './tabs-application'
import { createAndRefreshWebSessionTerminal, subscribeAllWebSessionTabs } from './tabs-subscription'
import {
  acceptReplayedWebSessionTabsSnapshot,
  clearWebSessionTabsTrackingForEnvironment,
  shouldApplyWebSessionTabsSnapshot,
  shouldBootstrapInitialWebRuntimeTerminal,
  shouldRespawnWebRuntimeTerminalAfterWake,
  shouldSyncAllRuntimeSessionTabs,
  shouldSyncRuntimeSessionTabs
} from './tabs-tracking'
import type { SessionTabsStreamEvent } from './tabs-tracking'

export function useWebSessionTabsSync(): void {
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const runtimeSessionMirrorEnvironmentKey = useAppStore((state) =>
    getRuntimeSessionMirrorEnvironmentIds(state).join('\u0000')
  )
  const activeWorktreeRuntimeEnvironmentId = useAppStore((state) =>
    getExplicitRuntimeEnvironmentIdForWorktree(state, state.activeWorktreeId)
  )
  const workspaceSessionReady = useAppStore((state) => state.workspaceSessionReady)

  useEffect(() => {
    const environmentIds = runtimeSessionMirrorEnvironmentKey
      ? runtimeSessionMirrorEnvironmentKey.split('\u0000').filter((id) => id.trim())
      : []
    // Why: startup hydration writes browser-local session state; applying the
    // host snapshot before that point gets clobbered and leaves the sidebar stale.
    // Selectedness is not liveness: desktop and web clients both mirror the
    // runtime's session bindings so background worktrees do not look asleep.
    if (!workspaceSessionReady || environmentIds.length === 0) {
      return
    }

    let disposed = false
    const unsubscribes: (() => void)[] = []
    // Why: the streaming RPC emits an initial snapshots event, but startup can
    // render a paired web session before that event is applied. A one-shot
    // fetch makes initial parity deterministic; the stream remains the live
    // update path afterward.
    for (const environmentId of environmentIds) {
      if (
        !shouldSyncAllRuntimeSessionTabs({
          activeRuntimeEnvironmentId: environmentId,
          workspaceSessionReady
        })
      ) {
        continue
      }
      void callRuntimeOrpc(
        { kind: 'environment', environmentId },
        (client) => client.session.tabs.listAll,
        undefined,
        { timeoutMs: 15_000 }
      )
        .then((result) => {
          if (disposed) {
            return
          }
          applyWebSessionTabsStorePatch((state) =>
            applyFreshWebSessionTabsSnapshots(state, result.snapshots, environmentId)
          )
        })
        .catch((error) => {
          if (!disposed) {
            console.warn(
              '[web-session-tabs-sync] failed to load initial session tabs:',
              error instanceof Error ? error.message : String(error)
            )
          }
        })

      subscribeAllWebSessionTabs(
        environmentId,
        () => disposed,
        (unsubscribe) => unsubscribes.push(unsubscribe)
      )
    }

    return () => {
      disposed = true
      for (const unsubscribe of unsubscribes) {
        unsubscribe()
      }
      // Why: environment ids can churn as paired runtimes reconnect or switch;
      // stale freshness/mapping entries should not live for the renderer lifetime.
      for (const environmentId of environmentIds) {
        clearWebSessionTabsTrackingForEnvironment(environmentId)
      }
    }
  }, [runtimeSessionMirrorEnvironmentKey, workspaceSessionReady])

  useEffect(() => {
    const environmentId = activeWorktreeRuntimeEnvironmentId?.trim()
    if (
      !shouldSyncRuntimeSessionTabs({
        activeWorktreeId,
        activeWorktreeRuntimeEnvironmentId,
        workspaceSessionReady
      }) ||
      !environmentId ||
      !activeWorktreeId
    ) {
      return
    }

    let disposed = false
    const isDisposed = (): boolean => disposed
    const requestState = { initial: false, respawnAfterWake: false }
    const handleSessionTabsEvent = (event: SessionTabsStreamEvent, replayed: boolean): void => {
      if (event.type !== 'snapshot' && event.type !== 'updated') {
        return
      }
      if (replayed) {
        acceptReplayedWebSessionTabsSnapshot(environmentId, event.worktree)
      }
      const fresh = shouldApplyWebSessionTabsSnapshot(event, environmentId)
      const syncState = useAppStore.getState()
      const localWorktreeTabs = syncState.tabsByWorktree[activeWorktreeId] ?? []
      const localTerminalCount = localWorktreeTabs.length
      const hasLiveLocalPty = localWorktreeTabs.some(
        (tab) => (syncState.ptyIdsByTabId[tab.id] ?? []).length > 0
      )
      const shouldBootstrapInitialTerminal = shouldBootstrapInitialWebRuntimeTerminal({
        event,
        activeWorktreeId,
        requestedInitialTerminal: requestState.initial,
        snapshotIsFresh: fresh,
        localTerminalCount
      })
      const shouldRespawnAfterWake = shouldRespawnWebRuntimeTerminalAfterWake({
        event,
        activeWorktreeId,
        requestedRespawnAfterWake: requestState.respawnAfterWake,
        snapshotIsFresh: fresh,
        localTerminalCount,
        hasLiveLocalPty,
        skipWakeRespawn: shouldSkipWebRuntimeWakeTerminalRespawn(activeWorktreeId)
      })
      if (fresh) {
        applyWebSessionTabsStorePatch((state) =>
          applyWebSessionTabsSnapshot(state, event, environmentId)
        )
      }
      if (!isDisposed() && shouldBootstrapInitialTerminal) {
        requestState.initial = true
        void createAndRefreshWebSessionTerminal({
          worktreeId: activeWorktreeId,
          environmentId
        })
      } else if (
        !isDisposed() &&
        shouldRespawnAfterWake &&
        beginWebRuntimeWakeTerminalRespawn(activeWorktreeId)
      ) {
        requestState.respawnAfterWake = true
        // Why: wake recovery must recreate the terminal without changing
        // selected worktree to avoid re-triggering activation churn.
        void createAndRefreshWebSessionTerminal({
          worktreeId: activeWorktreeId,
          environmentId
        }).finally(() => {
          endWebRuntimeWakeTerminalRespawn(activeWorktreeId)
        })
      }
    }

    let unsubscribe: (() => void) | null = null
    // Why: the browser compatibility subscription skips capability negotiation,
    // while Electron's local shell transport already negotiates it. Web must use
    // the direct oRPC subscription after the legacy dispatcher retires this method.
    if (isWebRuntimeClient()) {
      const controller = new AbortController()
      unsubscribe = () => controller.abort()
      void (async () => {
        let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
        try {
          connection = await createRuntimeOrpcClient(
            { kind: 'environment', environmentId },
            { signal: controller.signal }
          )
          const stream = await connection.client.session.tabs.subscribe(
            { worktree: toRuntimeWorktreeSelector(activeWorktreeId) },
            { signal: controller.signal }
          )
          for await (const event of stream) {
            if (isDisposed() || controller.signal.aborted) {
              return
            }
            handleSessionTabsEvent(event, false)
          }
        } catch (error) {
          if (!isDisposed() && !controller.signal.aborted) {
            console.warn(
              '[web-session-tabs-sync] subscription error:',
              error instanceof Error ? error.message : String(error)
            )
          }
        } finally {
          connection?.close()
        }
      })()
    } else {
      void runtimeEnvironmentsClient
        .subscribe(
          {
            selector: environmentId,
            method: 'session.tabs.subscribe',
            params: { worktree: toRuntimeWorktreeSelector(activeWorktreeId) },
            timeoutMs: 15_000
          },
          {
            onResponse: (response: RuntimeRpcResponse<unknown>) => {
              if (isDisposed()) {
                return
              }
              if (response.ok === false) {
                console.warn('[web-session-tabs-sync] subscription failed:', response.error.message)
                return
              }
              handleSessionTabsEvent(
                response.result as SessionTabsStreamEvent,
                isRuntimeSubscriptionReplayResponse(response)
              )
            },
            onError: (error) => {
              console.warn('[web-session-tabs-sync] subscription error:', error.message)
            }
          }
        )
        .then((handle) => {
          if (isDisposed()) {
            handle.unsubscribe()
            return
          }
          unsubscribe = handle.unsubscribe
        })
        .catch((error) => {
          if (!isDisposed()) {
            console.warn(
              '[web-session-tabs-sync] failed to subscribe:',
              error instanceof Error ? error.message : String(error)
            )
          }
        })
    }

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [activeWorktreeId, activeWorktreeRuntimeEnvironmentId, workspaceSessionReady])
}
