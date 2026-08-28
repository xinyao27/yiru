import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import { isRuntimeSubscriptionReplayResponse } from '@yiru/runtime-protocol/subscription-replay'

import { callRuntimeOrpc, createRuntimeOrpcClient, isWebRuntimeClient } from '../orpc-client'
import { runtimeEnvironmentsClient } from '../runtime-environments-client'
import { toRuntimeWorktreeSelector } from '../worktree-selector'
import { createWebSessionTerminalCommand } from './commands'
import {
  applyFreshWebSessionTabsSnapshot,
  applyFreshWebSessionTabsSnapshots,
  applyWebSessionTabsStorePatch
} from './tabs-application'
import {
  registerWebSessionTabsRefreshHandler,
  requestWebSessionTabsRefresh,
  type WebSessionTabsRefreshRequest
} from './tabs-refresh-requests'
import { acceptReplayedWebSessionTabsSnapshot } from './tabs-tracking'
import type { SessionTabsStreamEvent } from './tabs-tracking'

async function refreshRequestedWebSessionTabs(
  request: WebSessionTabsRefreshRequest
): Promise<void> {
  try {
    const snapshot = await callRuntimeOrpc(
      { kind: 'environment', environmentId: request.environmentId },
      (client) => client.session.tabs.list,
      { worktree: toRuntimeWorktreeSelector(request.worktreeId) },
      { timeoutMs: 15_000 }
    )
    applyWebSessionTabsStorePatch((state) =>
      applyFreshWebSessionTabsSnapshot(state, snapshot, request.environmentId)
    )
  } catch (error) {
    // Why: the host command already succeeded; the live subscription remains
    // authoritative if this eager parity refresh cannot complete.
    console.warn(
      '[web-session-tabs-sync] failed to refresh session tabs:',
      error instanceof Error ? error.message : String(error)
    )
  }
}

// Why: command refreshes must work before React effects and across remounts;
// this runtime module is imported once by the renderer bootstrap.
registerWebSessionTabsRefreshHandler(refreshRequestedWebSessionTabs)

export async function createAndRefreshWebSessionTerminal(args: {
  environmentId: string
  worktreeId: string
}): Promise<boolean> {
  const result = await createWebSessionTerminalCommand({ ...args, activate: true })
  if (result.status === 'failed') {
    console.warn(
      '[web-session-tabs-sync] failed to create terminal:',
      result.error instanceof Error ? result.error.message : String(result.error)
    )
    return false
  }
  await requestWebSessionTabsRefresh(args)
  return true
}

// Why: browsers own their peer connection directly, while Electron routes a
// selected environment through the desktop runtime client. Both paths carry
// the same typed `session.tabs.subscribeAll` oRPC stream.
export function subscribeAllWebSessionTabs(
  environmentId: string,
  isDisposed: () => boolean,
  registerUnsubscribe: (unsubscribe: () => void) => void
): void {
  if (isWebRuntimeClient()) {
    const controller = new AbortController()
    registerUnsubscribe(() => controller.abort())
    void (async () => {
      let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
      try {
        connection = await createRuntimeOrpcClient(
          { kind: 'environment', environmentId },
          { signal: controller.signal }
        )
        const stream = await connection.client.session.tabs.subscribeAll(undefined, {
          signal: controller.signal
        })
        for await (const event of stream) {
          if (isDisposed() || controller.signal.aborted) {
            return
          }
          if (event.type === 'snapshots') {
            applyWebSessionTabsStorePatch((state) =>
              applyFreshWebSessionTabsSnapshots(state, event.snapshots, environmentId)
            )
          } else if (event.type === 'updated') {
            applyWebSessionTabsStorePatch((state) =>
              applyFreshWebSessionTabsSnapshot(state, event, environmentId)
            )
          }
        }
      } catch (error) {
        if (!isDisposed() && !controller.signal.aborted) {
          console.warn(
            '[web-session-tabs-sync] global subscription error:',
            error instanceof Error ? error.message : String(error)
          )
        }
      } finally {
        connection?.close()
      }
    })()
    return
  }

  void runtimeEnvironmentsClient
    .subscribe(
      {
        selector: environmentId,
        method: 'session.tabs.subscribeAll',
        params: {},
        timeoutMs: 15_000
      },
      {
        onResponse: (response: RuntimeRpcResponse<unknown>) => {
          if (isDisposed()) {
            return
          }
          if (response.ok === false) {
            console.warn(
              '[web-session-tabs-sync] global subscription failed:',
              response.error.message
            )
            return
          }
          const event = response.result as SessionTabsStreamEvent
          const replayed = isRuntimeSubscriptionReplayResponse(response)
          if (event.type === 'snapshots') {
            if (replayed) {
              for (const snapshot of event.snapshots) {
                acceptReplayedWebSessionTabsSnapshot(environmentId, snapshot.worktree)
              }
            }
            applyWebSessionTabsStorePatch((state) =>
              applyFreshWebSessionTabsSnapshots(state, event.snapshots, environmentId)
            )
            return
          }
          if (event.type !== 'snapshot' && event.type !== 'updated') {
            return
          }
          if (replayed) {
            acceptReplayedWebSessionTabsSnapshot(environmentId, event.worktree)
          }
          applyWebSessionTabsStorePatch((state) =>
            applyFreshWebSessionTabsSnapshot(state, event, environmentId)
          )
        },
        onError: (error) => {
          console.warn('[web-session-tabs-sync] global subscription error:', error.message)
        }
      }
    )
    .then((handle) => {
      if (isDisposed()) {
        handle.unsubscribe()
        return
      }
      registerUnsubscribe(handle.unsubscribe)
    })
    .catch((error) => {
      if (!isDisposed()) {
        console.warn(
          '[web-session-tabs-sync] failed to subscribe globally:',
          error instanceof Error ? error.message : String(error)
        )
      }
    })
}
