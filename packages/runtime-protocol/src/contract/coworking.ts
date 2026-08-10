import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  CoworkingPairedRuntimeCanonicalizeParamsSchema,
  CoworkingPairedRuntimeInspectParamsSchema,
  CoworkingPairedRuntimeInvokeParamsSchema,
  CoworkingPairedRuntimeReleaseChannelParamsSchema,
  CoworkingPairedRuntimeRevokeWorktreeParamsSchema,
  CoworkingPairedRuntimeSubscribeParamsSchema,
  CoworkingPairedRuntimeWorktreeCatalogParamsSchema
} from './coworking-input.js'
import {
  CoworkingPairedRuntimeListHistoricalSessionPageParamsSchema,
  CoworkingPairedRuntimeListLiveSessionsParamsSchema,
  CoworkingPairedRuntimeReleaseHistoricalSessionPageParamsSchema,
  CoworkingPairedRuntimeSessionInvokeParamsSchema,
  CoworkingPairedRuntimeSubscribeSessionChangesParamsSchema,
  CoworkingPairedRuntimeUnsubscribeSessionChangesParamsSchema
} from './coworking-session-input.js'
import type {
  RuntimeCoworkingHistoricalSessionPageResponse,
  RuntimeCoworkingLiveSessionsResponse,
  RuntimeCoworkingSessionChangedEvent,
  RuntimeCoworkingSessionInvokeResponse
} from './coworking-session-types.js'
import { coworkingSharingContract } from './coworking-sharing.js'
import type {
  RuntimeCoworkingCanonicalizeResult,
  RuntimeCoworkingInspection,
  RuntimeCoworkingInvokeResponse,
  RuntimeCoworkingMutationResponse,
  RuntimeCoworkingTerminalEvent,
  RuntimeCoworkingWorktreeCatalog
} from './coworking-types.js'

const PROJECT_READ_ACCESS = {
  scope: 'project',
  tier: 'read',
  principals: ['runtime']
} as const
const WORKTREE_READ_ACCESS = {
  scope: 'worktree',
  tier: 'read',
  principals: ['runtime']
} as const
const WORKTREE_CONTROL_ACCESS = {
  scope: 'worktree',
  tier: 'control',
  principals: ['runtime']
} as const

export const coworkingHostContract = {
  listWorktrees: withAccess(PROJECT_READ_ACCESS)
    .input(CoworkingPairedRuntimeWorktreeCatalogParamsSchema)
    .output(type<RuntimeCoworkingWorktreeCatalog>()),
  inspectWorktree: withAccess(WORKTREE_READ_ACCESS)
    .input(CoworkingPairedRuntimeInspectParamsSchema)
    .output(type<RuntimeCoworkingInspection>()),
  canonicalizePath: withAccess(WORKTREE_READ_ACCESS)
    .input(CoworkingPairedRuntimeCanonicalizeParamsSchema)
    .output(type<RuntimeCoworkingCanonicalizeResult>()),
  invoke: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(CoworkingPairedRuntimeInvokeParamsSchema)
    .output(type<RuntimeCoworkingInvokeResponse>()),
  subscribeTerminal: withAccess(WORKTREE_READ_ACCESS)
    .input(CoworkingPairedRuntimeSubscribeParamsSchema)
    .output(eventIterator(type<RuntimeCoworkingTerminalEvent>())),
  releaseChannel: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(CoworkingPairedRuntimeReleaseChannelParamsSchema)
    .output(type<RuntimeCoworkingMutationResponse>()),
  revokeWorktree: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(CoworkingPairedRuntimeRevokeWorktreeParamsSchema)
    .output(type<RuntimeCoworkingMutationResponse>()),
  listLiveSessions: withAccess(WORKTREE_READ_ACCESS)
    .input(CoworkingPairedRuntimeListLiveSessionsParamsSchema)
    .output(type<RuntimeCoworkingLiveSessionsResponse>()),
  listHistoricalSessionPage: withAccess(WORKTREE_READ_ACCESS)
    .input(CoworkingPairedRuntimeListHistoricalSessionPageParamsSchema)
    .output(type<RuntimeCoworkingHistoricalSessionPageResponse>()),
  releaseHistoricalSessionPage: withAccess(WORKTREE_READ_ACCESS)
    .input(CoworkingPairedRuntimeReleaseHistoricalSessionPageParamsSchema)
    .output(type<RuntimeCoworkingMutationResponse>()),
  subscribeSessionChanges: withAccess(WORKTREE_READ_ACCESS)
    .input(CoworkingPairedRuntimeSubscribeSessionChangesParamsSchema)
    .output(eventIterator(type<RuntimeCoworkingSessionChangedEvent>())),
  unsubscribeSessionChanges: withAccess(WORKTREE_READ_ACCESS)
    .input(CoworkingPairedRuntimeUnsubscribeSessionChangesParamsSchema)
    .output(type<RuntimeCoworkingMutationResponse>()),
  invokeSession: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(CoworkingPairedRuntimeSessionInvokeParamsSchema)
    .output(type<RuntimeCoworkingSessionInvokeResponse>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const coworkingContract = {
  host: coworkingHostContract,
  sharing: coworkingSharingContract
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './coworking-input.js'
export * from './coworking-session-input.js'
export type * from './coworking-session-types.js'
export type * from './coworking-types.js'
export type * from './coworking-sharing-types.js'
