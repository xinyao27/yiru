import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  WorkspaceCleanupDismissInputSchema,
  WorkspaceCleanupScanInputSchema
} from './workspace-cleanup-input.js'
import type {
  RuntimeWorkspaceCleanupDismissResult,
  RuntimeWorkspaceCleanupEventsSubscriptionEvent,
  RuntimeWorkspaceCleanupScanResult
} from './workspace-cleanup-types.js'

const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
// Why: dismiss/clearDismissals persist into the host's shared UI document
// (same store field `ui.set` writes), so any client can retire another
// client's suggestion — same write weight as `ui.set` itself.
const HOST_ACCESS = { scope: 'host', tier: 'host' } as const

export const workspaceCleanupContract = {
  scan: withAccess(HOST_READ_ACCESS)
    .input(WorkspaceCleanupScanInputSchema)
    .output(type<RuntimeWorkspaceCleanupScanResult>()),
  dismiss: withAccess(HOST_ACCESS)
    .input(WorkspaceCleanupDismissInputSchema)
    .output(type<RuntimeWorkspaceCleanupDismissResult>()),
  clearDismissals: withAccess(HOST_ACCESS)
    .input(type<void>())
    .output(type<RuntimeWorkspaceCleanupDismissResult>()),
  events: {
    subscribe: withAccess(HOST_READ_ACCESS)
      .input(type<void>())
      .output(eventIterator(type<RuntimeWorkspaceCleanupEventsSubscriptionEvent>()))
  }
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './workspace-cleanup-input.js'
export type * from './workspace-cleanup-types.js'
