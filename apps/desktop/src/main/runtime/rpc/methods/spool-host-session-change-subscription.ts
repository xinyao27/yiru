import { randomUUID } from 'node:crypto'

import { SpoolPairedRuntimeSessionChangedEventSchema } from '../../../../shared/spool/spool-paired-runtime-session-contract'
import type { SpoolTerminalSessionBindings } from '../../../spool/spool-terminal-session-bindings'
import type { RpcContext } from '../core'
import type { resolveIncarnationBoundActualWorktree } from './spool-host-runtime-authority'
import { projectSpoolHostObservedProviderSessions } from './spool-host-session-change-projection'

type SessionChangeWorktree = Awaited<ReturnType<typeof resolveIncarnationBoundActualWorktree>> & {
  spoolIncarnationId: string
}

export async function runSpoolHostSessionChangesSubscription(
  context: RpcContext,
  worktree: SessionChangeWorktree,
  sessionBindings: SpoolTerminalSessionBindings,
  emit: (result: unknown) => void
): Promise<void> {
  const signal = context.signal ?? new AbortController().signal
  await new Promise<void>((resolve) => {
    let finished = false
    let unsubscribeTabs = (): void => {}
    let unsubscribeSessionBindings = (): void => {}
    const requestId = context.requestId ?? randomUUID()
    const cleanupId = spoolHostSessionChangesCleanupId(context.connectionId, requestId)
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
        providerSessions: ReturnType<typeof projectSpoolHostObservedProviderSessions> = []
      ): void => {
        if (finished) {
          return
        }
        try {
          // Why: the exact-worktree event carries only positive identity proof; locator data stays local.
          emit(
            SpoolPairedRuntimeSessionChangedEventSchema.parse({
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
        emitChange(projectSpoolHostObservedProviderSessions(snapshot, worktree, sessionBindings))
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
              projectSpoolHostObservedProviderSessions(snapshot, worktree, sessionBindings)
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

export function spoolHostSessionChangesCleanupId(
  connectionId: string | undefined,
  requestId: string
): string {
  return `spool.host.session-changes:${connectionId ?? 'local'}:${requestId}`
}
