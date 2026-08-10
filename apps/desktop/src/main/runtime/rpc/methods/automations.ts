import type { AutomationWorkspaceNameSnapshotInputSchema } from '@yiru/runtime-protocol/contract'
import type { AutomationIdInput, AutomationRunsInput } from '@yiru/runtime-protocol/contract'
import { normalizeExecutionHostId } from '@yiru/workbench-model/workspace'
import { z } from 'zod'
import {
  MAX_AUTOMATION_PRECHECK_TIMEOUT_SECONDS,
  normalizeAutomationPrecheckTimeoutSeconds
} from '~shared/automation/precheck'
import { isValidAutomationSchedule } from '~shared/automation/schedules'
import type { ProjectSourceIdentity as SharedProjectSourceIdentity } from '~shared/project-source-context'
import {
  OptionalBoolean,
  OptionalPlainString,
  OptionalPositiveInt,
  OptionalString,
  requiredNumber,
  requiredString
} from '~shared/runtime-method-contracts/runtime-method-params'
import { isTuiAgent } from '~shared/tui-agent/config'

import type { RpcContext } from '../core'

const TuiAgent = requiredString('Missing provider').refine(isTuiAgent, {
  message: 'Unknown provider'
})

const AutomationWorkspaceMode = z.enum(['existing', 'new_per_run']).optional()
const SetupDecision = z.enum(['inherit', 'run', 'skip']).optional()
const ExecutionHostId = requiredString('Missing host id').transform((value, ctx) => {
  const hostId = normalizeExecutionHostId(value)
  if (!hostId) {
    ctx.addIssue({ code: 'custom', message: 'Invalid host id' })
    return z.NEVER
  }
  return hostId
})

const AutomationSchedule = requiredString('Missing trigger').refine(isValidAutomationSchedule, {
  message: 'Invalid automation trigger'
})

const AutomationPrecheck = z
  .object({
    command: requiredString('Missing precheck command'),
    timeoutSeconds: OptionalPositiveInt.transform((value) =>
      normalizeAutomationPrecheckTimeoutSeconds(value)
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

const ProjectSourceIdentity = z
  .custom<SharedProjectSourceIdentity>(
    (value) =>
      value !== null &&
      typeof value === 'object' &&
      'provider' in value &&
      ['github', 'gitlab'].includes(String(value.provider))
  )
  .optional()
  .nullable()

const ProjectSourceContext = z
  .object({
    kind: z.literal('project-source'),
    provider: z.enum(['github', 'gitlab']),
    projectId: requiredString('Missing source project id'),
    hostId: ExecutionHostId,
    projectHostSetupId: OptionalNullablePlainString,
    repoId: OptionalNullablePlainString,
    providerIdentity: ProjectSourceIdentity,
    accountLabel: OptionalNullablePlainString
  })
  .optional()
  .nullable()

const WorkspaceRunContext = z
  .object({
    kind: z.literal('workspace-run'),
    projectId: requiredString('Missing run project id'),
    hostId: ExecutionHostId,
    projectHostSetupId: requiredString('Missing project host setup id'),
    repoId: requiredString('Missing repo id'),
    path: requiredString('Missing run path')
  })
  .optional()
  .nullable()

const AutomationCreate = z.object({
  name: requiredString('Missing automation name'),
  prompt: requiredString('Missing automation prompt'),
  precheck: AutomationPrecheck,
  agentId: TuiAgent,
  runContext: WorkspaceRunContext,
  sourceContext: ProjectSourceContext,
  repo: OptionalString,
  workspace: OptionalString,
  workspaceMode: AutomationWorkspaceMode,
  baseBranch: OptionalPlainString,
  setupDecision: SetupDecision,
  reuseSession: OptionalBoolean,
  timezone: OptionalString,
  rrule: AutomationSchedule,
  dtstart: requiredNumber('Missing trigger start time'),
  enabled: OptionalBoolean,
  missedRunGraceMinutes: OptionalPositiveInt
})

const AutomationUpdateFields = z.object({
  name: OptionalString,
  prompt: OptionalString,
  precheck: AutomationPrecheck,
  agentId: TuiAgent.optional(),
  runContext: WorkspaceRunContext,
  sourceContext: ProjectSourceContext,
  repo: OptionalString,
  workspace: OptionalString,
  workspaceMode: AutomationWorkspaceMode,
  // Why: update patches distinguish omitted from null so callers can clear a saved base branch.
  baseBranch: OptionalNullablePlainString,
  setupDecision: SetupDecision,
  reuseSession: OptionalBoolean,
  timezone: OptionalString,
  rrule: AutomationSchedule.optional(),
  dtstart: requiredNumber('Missing trigger start time').optional(),
  enabled: OptionalBoolean,
  missedRunGraceMinutes: OptionalPositiveInt
})

const AutomationUpdate = z.object({
  id: requiredString('Missing automation id'),
  updates: AutomationUpdateFields
})

type AutomationCreateInput = z.infer<typeof AutomationCreate>
type AutomationUpdateInput = z.infer<typeof AutomationUpdate>

// Why: the contract leaf has no `.input()`, so oRPC infers `unknown` rather
// than `void` — direct wiring checks the handler against that real shape
// (same class of gap as Phase 6 D-stage 切片 61/65/67's void→unknown fixes).
export function handleAutomationList(_params: unknown, { runtime }: RpcContext) {
  return { automations: runtime.listAutomations() }
}

export function handleAutomationShow(params: AutomationIdInput, { runtime }: RpcContext) {
  return { automation: runtime.showAutomation(params.id) }
}

export async function handleAutomationCreate(
  params: AutomationCreateInput,
  { runtime }: RpcContext
) {
  return { automation: await runtime.createAutomation(params) }
}

export async function handleAutomationUpdate(
  params: AutomationUpdateInput,
  { runtime }: RpcContext
) {
  return { automation: await runtime.updateAutomation(params.id, params.updates) }
}

export function handleAutomationDelete(params: AutomationIdInput, { runtime }: RpcContext) {
  return runtime.deleteAutomation(params.id)
}

export async function handleAutomationRunNow(params: AutomationIdInput, { runtime }: RpcContext) {
  return { run: await runtime.runAutomationNow(params.id) }
}

export function handleAutomationRuns(params: AutomationRunsInput, { runtime }: RpcContext) {
  return { runs: runtime.listAutomationRuns(params.automationId) }
}

export function handleAutomationSnapshotWorkspaceName(
  params: z.infer<typeof AutomationWorkspaceNameSnapshotInputSchema>,
  { runtime }: RpcContext
) {
  const { workspaceId, displayName } = params
  return { updatedRunCount: runtime.snapshotAutomationWorkspaceName(workspaceId, displayName) }
}
