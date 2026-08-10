import { randomUUID } from 'node:crypto'

import type { RuntimeCoworkingSessionChangedEvent } from '@yiru/runtime-protocol/contract'
import type { CoworkingTerminalSessionBindings } from '~main/coworking/terminal-session-bindings'
import { CoworkingPairedRuntimeSessionChangedEventSchema } from '~shared/coworking/paired-runtime-session-contract'

import type { RpcContext } from '../core'
import type { resolveIncarnationBoundActualWorktree } from './coworking-host-runtime-authority'
import { projectCoworkingHostObservedProviderSessions } from './coworking-host-session-change-projection'

type SessionChangeWorktree = Awaited<ReturnType<typeof resolveIncarnationBoundActualWorktree>> & {
  coworkingIncarnationId: string
}

export async function runCoworkingHostSessionChangesSubscription(
  context: RpcContext,
  worktree: SessionChangeWorktree,
  sessionBindings: CoworkingTerminalSessionBindings,
  emit: (result: RuntimeCoworkingSessionChangedEvent) => void
): Promise<void> {
  const signal = context.signal ?? new AbortController().signal
  await new Promise<void>((resolve) => {
    let finished = false
    let unsubscribeTabs = (): void => {}
    let unsubscribeSessionBindings = (): void => {}
    const requestId = context.requestId ?? randomUUID()
    const cleanupId = coworkingHostSessionChangesCleanupId(context.connectionId, requestId)
    const finish = (): void => {
      if (finished) {
        return
      }
      finished = true
      signal.removeEventListener('abort', finish)
      context.runtime.cleanupSubscription(cleanupId)
      unsubscribeTabs()
      unsubscribeSessionBindings()
      resolve()
    }
    // Why: logical subscriptions share the owner's physical runtime route and must clean up alone.
    context.runtime.registerSubscriptionCleanup(cleanupId, finish, context.connectionId)
    if (signal.aborted) {
      finish()
      return
    }
    signal.addEventListener('abort', finish, { once: true })
    try {
      const emitChange = (
        providerSessions: ReturnType<typeof projectCoworkingHostObservedProviderSessions> = []
      ): void => {
        if (finished) {
          return
        }
        try {
          // Why: the exact-worktree event carries only positive identity proof; locator data stays local.
          emit(
            CoworkingPairedRuntimeSessionChangedEventSchema.parse({
              kind: 'changed',
              providerSessions
            })
          )
        } catch {
          finish()
        }
      }
      unsubscribeTabs = context.runtime.onMobileSessionTabsChanged((snapshot) => {
        if (finished || snapshot.worktree !== worktree.worktreeId) {
          return
        }
        emitChange(
          projectCoworkingHostObservedProviderSessions(snapshot, worktree, sessionBindings)
        )
      })
      unsubscribeSessionBindings = sessionBindings.subscribe((changedInstanceId) => {
        if (changedInstanceId === worktree.instanceId) {
          // Why: createTerminal can publish before its stable session binding;
          // the later binding must cause a second projection.
          emitChange()
        }
      })
      // Why: subscribing before the initial snapshot closes the healthy-route read/subscribe gap.
      void context.runtime
        .listMobileSessionTabs(`id:${worktree.worktreeId}`)
        .then((snapshot) => {
          if (!finished) {
            emitChange(
              projectCoworkingHostObservedProviderSessions(snapshot, worktree, sessionBindings)
            )
          }
        })
        .catch(() => {
          // A later authoritative hook can still establish proof; absence remains fail-closed.
        })
    } catch {
      finish()
    }
    if (finished) {
      unsubscribeTabs()
      unsubscribeSessionBindings()
    }
  })
}

export function coworkingHostSessionChangesCleanupId(
  connectionId: string | undefined,
  requestId: string
): string {
  return `coworking.host.session-changes:${connectionId ?? 'local'}:${requestId}`
}
