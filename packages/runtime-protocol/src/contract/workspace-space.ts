import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import type {
  RuntimeWorkspaceSpaceAnalyzeResult,
  RuntimeWorkspaceSpaceCancelResult,
  RuntimeWorkspaceSpaceEventsSubscriptionEvent
} from './workspace-space-types.js'

const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const HOST_ACCESS = { scope: 'host', tier: 'host' } as const

export const workspaceSpaceContract = {
  analyze: withAccess(HOST_READ_ACCESS)
    .input(type<void>())
    .output(type<RuntimeWorkspaceSpaceAnalyzeResult>()),
  // Why: the scan is a shared host-wide singleton (duplicate calls join the
  // same IO); cancelling it can abort a scan another paired client started,
  // same destructive-to-others category as `terminal.management.killOne`.
  cancel: withAccess(HOST_ACCESS)
    .input(type<void>())
    .output(type<RuntimeWorkspaceSpaceCancelResult>()),
  events: {
    subscribe: withAccess(HOST_READ_ACCESS)
      .input(type<void>())
      .output(eventIterator(type<RuntimeWorkspaceSpaceEventsSubscriptionEvent>()))
  }
} satisfies ContractRouter<RuntimeProcedureMeta>

export type * from './workspace-space-types.js'
