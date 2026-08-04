import { z } from 'zod'
import type { AuthenticatedRpcPrincipal } from '~shared/rpc-principal'
import type { RuntimeClientEvent } from '~shared/runtime-client-events'

import { callerClassOf } from '../access'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'

let clientEventSubscriptionSeq = 0

const ClientEventsUnsubscribeParams = z.object({
  subscriptionId: z
    .unknown()
    .transform((value) => (typeof value === 'string' && value.length > 0 ? value : ''))
    .pipe(z.string().min(1, 'Missing subscriptionId'))
})

function projectClientEvent(
  event: RuntimeClientEvent,
  principal: AuthenticatedRpcPrincipal | undefined
): RuntimeClientEvent {
  switch (callerClassOf(principal)) {
    case 'local':
    case 'mobile':
    case 'runtime':
      return event
    case 'coworking-host':
      // Why: Coworking peers can refetch through scope-adjudicated methods.
      // Streaming launch payloads would otherwise export commands, env values,
      // launch tokens, and machine-wide repo/worktree identifiers.
      return { type: 'reposChanged' }
  }
}

export const CLIENT_EVENT_METHODS: readonly RpcAnyMethod[] = [
  defineStreamingMethod({
    name: 'runtime.clientEvents.subscribe',
    mobile: true,
    params: null,
    // Why: read-only, but the stream is host-wide — every repo/worktree id on
    // the machine plus SSH target ids and worktree launch payloads flow here,
    // so it can never be narrowed to a worktree-scoped grant.
    access: { scope: 'host', tier: 'read' },
    handler: async (_params, { runtime, connectionId, principal }, emit) => {
      await new Promise<void>((resolve) => {
        const unsubscribe = runtime.onClientEvent((event) => {
          emit(projectClientEvent(event, principal))
        })

        const seq = ++clientEventSubscriptionSeq
        const subscriptionId = `runtime-client-events-${connectionId ?? 'inproc'}-${seq}`
        runtime.registerSubscriptionCleanup(
          subscriptionId,
          () => {
            unsubscribe()
            emit({ type: 'end' })
            resolve()
          },
          connectionId
        )

        emit({ type: 'ready', subscriptionId })
      })
    }
  }),
  defineMethod({
    name: 'runtime.clientEvents.unsubscribe',
    mobile: true,
    params: ClientEventsUnsubscribeParams,
    access: { scope: 'host', tier: 'read' },
    handler: async (params, { runtime, connectionId }) => {
      const expectedPrefix = `runtime-client-events-${connectionId ?? 'inproc'}-`
      if (!params.subscriptionId.startsWith(expectedPrefix)) {
        return { unsubscribed: false }
      }
      runtime.cleanupSubscription(params.subscriptionId)
      return { unsubscribed: true }
    }
  })
]
