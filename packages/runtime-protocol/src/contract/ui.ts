import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import { FeatureInteractionIdInputSchema, UIUpdateInputSchema } from './ui-input.js'
import type { RuntimePersistedUIState, RuntimeUIResult } from './ui-types.js'

const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const HOST_ACCESS = { scope: 'host', tier: 'host' } as const
const MOBILE = { mobile: true } as const

export const uiContract = {
  get: withAccess(HOST_READ_ACCESS, MOBILE).output(type<RuntimeUIResult>()),
  set: withAccess(HOST_ACCESS, MOBILE).input(UIUpdateInputSchema).output(type<RuntimeUIResult>()),
  recordFeatureInteraction: withAccess(HOST_ACCESS, MOBILE)
    .input(FeatureInteractionIdInputSchema)
    .output(type<RuntimeUIResult>()),
  // Why: UI view-state is a single host-wide document (same shape as
  // `settings.events.subscribe`) — a change from any client or window must
  // reach every other paired client, mirroring the desktop-only
  // `ui:stateChanged` IPC broadcast this replaces for non-shell clients.
  events: {
    subscribe: withAccess(HOST_READ_ACCESS, MOBILE)
      .input(type<void>())
      .output(eventIterator(type<RuntimeUISubscriptionEvent>()))
  }
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './ui-input.js'
export type * from './ui-types.js'

export type RuntimeUIChangedEvent = {
  type: 'changed'
  ui: RuntimePersistedUIState
}

export type RuntimeUISubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeUIChangedEvent
  | { type: 'end' }
