import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  ProjectHostSetupCloneInputSchema,
  ProjectHostSetupCreateInputSchema,
  ProjectHostSetupDeleteInputSchema,
  ProjectHostSetupExistingFolderInputSchema,
  ProjectHostSetupUpdateInputSchema,
  ProjectUpdateInputSchema
} from './project-input.js'
import type {
  RuntimeProjectHostSetupCreateResultEnvelope,
  RuntimeProjectHostSetupDeleteResultEnvelope,
  RuntimeProjectHostSetupListResult,
  RuntimeProjectHostSetupResultEnvelope,
  RuntimeProjectHostSetupUpdateResultEnvelope,
  RuntimeProjectListResult,
  RuntimeProjectResult
} from './project-types.js'

const PROJECT_READ_ACCESS = { scope: 'project', tier: 'read' } as const
const PROJECT_CONTROL_ACCESS = { scope: 'project', tier: 'control' } as const
const PROJECT_HOST_ACCESS = { scope: 'project', tier: 'host' } as const
const HOST_ACCESS = { scope: 'host', tier: 'host' } as const

export const projectContract = {
  list: withAccess(PROJECT_READ_ACCESS).output(type<RuntimeProjectListResult>()),
  update: withAccess(PROJECT_CONTROL_ACCESS)
    .input(ProjectUpdateInputSchema)
    .output(type<RuntimeProjectResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const projectHostSetupContract = {
  list: withAccess(PROJECT_READ_ACCESS).output(type<RuntimeProjectHostSetupListResult>()),
  create: withAccess(HOST_ACCESS)
    .input(ProjectHostSetupCreateInputSchema)
    .output(type<RuntimeProjectHostSetupCreateResultEnvelope>()),
  setupExistingFolder: withAccess(HOST_ACCESS)
    .input(ProjectHostSetupExistingFolderInputSchema)
    .output(type<RuntimeProjectHostSetupResultEnvelope>()),
  clone: withAccess(HOST_ACCESS)
    .input(ProjectHostSetupCloneInputSchema)
    .output(type<RuntimeProjectHostSetupResultEnvelope>()),
  update: withAccess(HOST_ACCESS)
    .input(ProjectHostSetupUpdateInputSchema)
    .output(type<RuntimeProjectHostSetupUpdateResultEnvelope>()),
  delete: withAccess(PROJECT_HOST_ACCESS)
    .input(ProjectHostSetupDeleteInputSchema)
    .output(type<RuntimeProjectHostSetupDeleteResultEnvelope>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './project-input.js'
export type * from './project-types.js'
