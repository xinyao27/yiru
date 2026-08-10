import { type, type ContractRouter } from '@orpc/contract'
import { normalizeExecutionHostId } from '@yiru/workbench-model/workspace'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  AutomationWorkspaceNameSnapshotInputSchema,
  ExternalAutomationActionInputSchema,
  ExternalAutomationCreateInputSchema,
  ExternalAutomationRunsInputSchema,
  ExternalAutomationUpdateInputSchema
} from './automation-external.js'
import type {
  RuntimeAutomationWorkspaceNameSnapshotResult,
  RuntimeExternalAutomationManagersResult,
  RuntimeExternalAutomationMutationResult,
  RuntimeExternalAutomationRunsPage
} from './automation-external.js'
import { isValidAutomationSchedule } from './automation-schedule.js'
import type {
  RuntimeAutomationDeleteResult,
  RuntimeAutomationListResult,
  RuntimeAutomationResult,
  RuntimeAutomationRunResult,
  RuntimeAutomationRunsResult,
  RuntimeProjectSourceIdentity
} from './automation-types.js'
import {
  isRuntimeTuiAgent,
  OptionalBoolean,
  OptionalPlainString,
  OptionalPositiveInt,
  OptionalString,
  requiredNumber,
  requiredString
} from './input-schema.js'

const AUTOMATION_READ_ACCESS = { scope: 'project', tier: 'read' } as const
const AUTOMATION_HOST_ACCESS = { scope: 'host', tier: 'host' } as const
// Why: external cron managers (Hermes/OpenClaw) aren't tied to a project —
// they enumerate whatever the host's PATH exposes, same shape as `cli`'s
// install-status probes.
const AUTOMATION_EXTERNAL_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const MAX_AUTOMATION_PRECHECK_TIMEOUT_SECONDS = 600
const DEFAULT_AUTOMATION_PRECHECK_TIMEOUT_SECONDS = 60

const TuiAgentSchema = requiredString('Missing provider').refine(isRuntimeTuiAgent, {
  message: 'Unknown provider'
})

const ExecutionHostIdSchema = requiredString('Missing host id').transform((value, context) => {
  const hostId = normalizeExecutionHostId(value)
  if (!hostId) {
    context.addIssue({ code: 'custom', message: 'Invalid host id' })
    return z.NEVER
  }
  return hostId
})

const AutomationScheduleSchema = requiredString('Missing trigger').refine(
  isValidAutomationSchedule,
  { message: 'Invalid automation trigger' }
)

const AutomationPrecheckSchema = z
  .object({
    command: requiredString('Missing precheck command'),
    timeoutSeconds: OptionalPositiveInt.transform((value) =>
      typeof value !== 'number' || !Number.isFinite(value)
        ? DEFAULT_AUTOMATION_PRECHECK_TIMEOUT_SECONDS
        : Math.min(MAX_AUTOMATION_PRECHECK_TIMEOUT_SECONDS, Math.max(1, Math.floor(value)))
    ).refine((value) => value <= MAX_AUTOMATION_PRECHECK_TIMEOUT_SECONDS, {
      message: 'Precheck timeout is too large'
    })
  })
  .nullable()
  .optional()

const OptionalNullablePlainString = z
  .unknown()
  .transform((value) => (value === null || typeof value === 'string' ? value : undefined))
  .pipe(z.union([z.string(), z.null(), z.undefined()]))
  .optional()

const ProjectSourceIdentitySchema = z
  .custom<RuntimeProjectSourceIdentity>(
    (value) =>
      value !== null &&
      typeof value === 'object' &&
      'provider' in value &&
      ['github', 'gitlab'].includes(String(value.provider))
  )
  .optional()
  .nullable()

const ProjectSourceContextSchema = z
  .object({
    kind: z.literal('project-source'),
    provider: z.enum(['github', 'gitlab']),
    projectId: requiredString('Missing source project id'),
    hostId: ExecutionHostIdSchema,
    projectHostSetupId: OptionalNullablePlainString,
    repoId: OptionalNullablePlainString,
    providerIdentity: ProjectSourceIdentitySchema,
    accountLabel: OptionalNullablePlainString
  })
  .optional()
  .nullable()

const WorkspaceRunContextSchema = z
  .object({
    kind: z.literal('workspace-run'),
    projectId: requiredString('Missing run project id'),
    hostId: ExecutionHostIdSchema,
    projectHostSetupId: requiredString('Missing project host setup id'),
    repoId: requiredString('Missing repo id'),
    path: requiredString('Missing run path')
  })
  .optional()
  .nullable()

export const AutomationIdInputSchema = z.object({
  id: requiredString('Missing automation id')
})

export const AutomationRunsInputSchema = z.object({
  automationId: OptionalString
})

export const AutomationCreateInputSchema = z.object({
  name: requiredString('Missing automation name'),
  prompt: requiredString('Missing automation prompt'),
  precheck: AutomationPrecheckSchema,
  agentId: TuiAgentSchema,
  runContext: WorkspaceRunContextSchema,
  sourceContext: ProjectSourceContextSchema,
  repo: OptionalString,
  workspace: OptionalString,
  workspaceMode: z.enum(['existing', 'new_per_run']).optional(),
  baseBranch: OptionalPlainString,
  setupDecision: z.enum(['inherit', 'run', 'skip']).optional(),
  reuseSession: OptionalBoolean,
  timezone: OptionalString,
  rrule: AutomationScheduleSchema,
  dtstart: requiredNumber('Missing trigger start time'),
  enabled: OptionalBoolean,
  missedRunGraceMinutes: OptionalPositiveInt
})

export const AutomationUpdateFieldsInputSchema = z.object({
  name: OptionalString,
  prompt: OptionalString,
  precheck: AutomationPrecheckSchema,
  agentId: TuiAgentSchema.optional(),
  runContext: WorkspaceRunContextSchema,
  sourceContext: ProjectSourceContextSchema,
  repo: OptionalString,
  workspace: OptionalString,
  workspaceMode: z.enum(['existing', 'new_per_run']).optional(),
  baseBranch: OptionalNullablePlainString,
  setupDecision: z.enum(['inherit', 'run', 'skip']).optional(),
  reuseSession: OptionalBoolean,
  timezone: OptionalString,
  rrule: AutomationScheduleSchema.optional(),
  dtstart: requiredNumber('Missing trigger start time').optional(),
  enabled: OptionalBoolean,
  missedRunGraceMinutes: OptionalPositiveInt
})

export const AutomationUpdateInputSchema = z.object({
  id: requiredString('Missing automation id'),
  updates: AutomationUpdateFieldsInputSchema
})

export type AutomationIdInput = z.infer<typeof AutomationIdInputSchema>
export type AutomationRunsInput = z.infer<typeof AutomationRunsInputSchema>
export type AutomationCreateInput = z.infer<typeof AutomationCreateInputSchema>
export type AutomationUpdateInput = z.infer<typeof AutomationUpdateInputSchema>

export const automationContract = {
  list: withAccess(AUTOMATION_READ_ACCESS).output(type<RuntimeAutomationListResult>()),
  show: withAccess(AUTOMATION_READ_ACCESS)
    .input(AutomationIdInputSchema)
    .output(type<RuntimeAutomationResult>()),
  create: withAccess(AUTOMATION_HOST_ACCESS)
    .input(AutomationCreateInputSchema)
    .output(type<RuntimeAutomationResult>()),
  update: withAccess(AUTOMATION_HOST_ACCESS)
    .input(AutomationUpdateInputSchema)
    .output(type<RuntimeAutomationResult>()),
  delete: withAccess(AUTOMATION_HOST_ACCESS)
    .input(AutomationIdInputSchema)
    .output(type<RuntimeAutomationDeleteResult>()),
  runNow: withAccess(AUTOMATION_HOST_ACCESS)
    .input(AutomationIdInputSchema)
    .output(type<RuntimeAutomationRunResult>()),
  runs: withAccess(AUTOMATION_READ_ACCESS)
    .input(AutomationRunsInputSchema)
    .output(type<RuntimeAutomationRunsResult>()),
  listExternalManagers: withAccess(AUTOMATION_EXTERNAL_READ_ACCESS).output(
    type<RuntimeExternalAutomationManagersResult>()
  ),
  listExternalRuns: withAccess(AUTOMATION_EXTERNAL_READ_ACCESS)
    .input(ExternalAutomationRunsInputSchema)
    .output(type<RuntimeExternalAutomationRunsPage>()),
  createExternal: withAccess(AUTOMATION_HOST_ACCESS)
    .input(ExternalAutomationCreateInputSchema)
    .output(type<RuntimeExternalAutomationMutationResult>()),
  updateExternal: withAccess(AUTOMATION_HOST_ACCESS)
    .input(ExternalAutomationUpdateInputSchema)
    .output(type<RuntimeExternalAutomationMutationResult>()),
  runExternalAction: withAccess(AUTOMATION_HOST_ACCESS)
    .input(ExternalAutomationActionInputSchema)
    .output(type<RuntimeExternalAutomationMutationResult>()),
  snapshotWorkspaceName: withAccess(AUTOMATION_HOST_ACCESS)
    .input(AutomationWorkspaceNameSnapshotInputSchema)
    .output(type<RuntimeAutomationWorkspaceNameSnapshotResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export type {
  RuntimeAutomation,
  RuntimeAutomationDeleteResult,
  RuntimeAutomationListResult,
  RuntimeAutomationPrecheck,
  RuntimeAutomationPrecheckResult,
  RuntimeAutomationResult,
  RuntimeAutomationRun,
  RuntimeAutomationRunOutputSnapshot,
  RuntimeAutomationRunResult,
  RuntimeAutomationRunStatus,
  RuntimeAutomationRunUsage,
  RuntimeAutomationRunsResult,
  RuntimeProjectSourceContext,
  RuntimeProjectSourceIdentity,
  RuntimeWorkspaceRunContext
} from './automation-types.js'
export {
  AutomationWorkspaceNameSnapshotInputSchema,
  ExternalAutomationActionInputSchema,
  ExternalAutomationCreateInputSchema,
  ExternalAutomationRunsInputSchema,
  ExternalAutomationUpdateInputSchema
} from './automation-external.js'
export type {
  ExternalAutomationActionInput,
  ExternalAutomationCreateInput,
  ExternalAutomationRunsInput,
  ExternalAutomationUpdateInput,
  RuntimeAutomationWorkspaceNameSnapshotResult,
  RuntimeExternalAutomationAction,
  RuntimeExternalAutomationJob,
  RuntimeExternalAutomationManager,
  RuntimeExternalAutomationManagerStatus,
  RuntimeExternalAutomationManagersResult,
  RuntimeExternalAutomationMutationResult,
  RuntimeExternalAutomationProvider,
  RuntimeExternalAutomationRun,
  RuntimeExternalAutomationRunStatus,
  RuntimeExternalAutomationRunsPage,
  RuntimeExternalAutomationTarget
} from './automation-external.js'
