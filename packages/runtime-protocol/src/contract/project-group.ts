import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  ProjectGroupCancelNestedScanInputSchema,
  ProjectGroupCreateInputSchema,
  ProjectGroupImportNestedInputSchema,
  ProjectGroupMoveProjectInputSchema,
  ProjectGroupScanNestedInputSchema,
  ProjectGroupSelectorInputSchema,
  ProjectGroupUpdateInputSchema
} from './project-group-input.js'
import type {
  RuntimeNestedRepoScanProgressSubscriptionEvent,
  RuntimeNestedRepoScanResult,
  RuntimeNullableProjectGroupResult,
  RuntimeProjectGroupCancelNestedScanResult,
  RuntimeProjectGroupDeleteResult,
  RuntimeProjectGroupImportResult,
  RuntimeProjectGroupListResult,
  RuntimeProjectGroupMoveProjectResult,
  RuntimeProjectGroupResult
} from './project-group-types.js'

const PROJECT_READ_ACCESS = { scope: 'project', tier: 'read' } as const
const PROJECT_CONTROL_ACCESS = { scope: 'project', tier: 'control' } as const
const HOST_ACCESS = { scope: 'host', tier: 'host' } as const
const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const MOBILE = { mobile: true } as const

export const projectGroupContract = {
  list: withAccess(PROJECT_READ_ACCESS, MOBILE).output(type<RuntimeProjectGroupListResult>()),
  create: withAccess(HOST_ACCESS)
    .input(ProjectGroupCreateInputSchema)
    .output(type<RuntimeProjectGroupResult>()),
  update: withAccess(PROJECT_CONTROL_ACCESS)
    .input(ProjectGroupUpdateInputSchema)
    .output(type<RuntimeNullableProjectGroupResult>()),
  delete: withAccess(PROJECT_CONTROL_ACCESS)
    .input(ProjectGroupSelectorInputSchema)
    .output(type<RuntimeProjectGroupDeleteResult>()),
  moveProject: withAccess(PROJECT_CONTROL_ACCESS)
    .input(ProjectGroupMoveProjectInputSchema)
    .output(type<RuntimeProjectGroupMoveProjectResult>()),
  scanNested: withAccess(HOST_ACCESS)
    .input(ProjectGroupScanNestedInputSchema)
    .output(type<RuntimeNestedRepoScanResult>()),
  cancelNestedScan: withAccess(HOST_ACCESS)
    .input(ProjectGroupCancelNestedScanInputSchema)
    .output(type<RuntimeProjectGroupCancelNestedScanResult>()),
  importNested: withAccess(HOST_ACCESS)
    .input(ProjectGroupImportNestedInputSchema)
    .output(type<RuntimeProjectGroupImportResult>()),
  // Why: nested-scan progress is per-scanId, not host-wide, but there is no
  // narrower audience to scope the stream to than "this host" — the client
  // filters ticks by the scanId it started, same as the preload event this
  // replaces (`projectGroups.onNestedScanProgress`).
  events: {
    subscribe: withAccess(HOST_READ_ACCESS, MOBILE)
      .input(type<void>())
      .output(eventIterator(type<RuntimeNestedRepoScanProgressSubscriptionEvent>()))
  }
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './project-group-input.js'
export type * from './project-group-types.js'
