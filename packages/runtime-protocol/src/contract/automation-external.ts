import { z } from 'zod'

import { requiredNumber, requiredString } from './input-schema.js'

// Why: Hermes/OpenClaw cron jobs live on whichever machine has the CLI on
// PATH — a paired client managing a remote runtime host needs this surface,
// not just the desktop shell that happens to be open on that machine.

export type RuntimeExternalAutomationProvider = 'hermes' | 'openclaw'
export type RuntimeExternalAutomationManagerStatus = 'available' | 'unavailable'
export type RuntimeExternalAutomationAction = 'pause' | 'resume' | 'run' | 'delete'
export type RuntimeExternalAutomationRunStatus = 'completed' | 'failed' | 'unknown'

// Why: every external manager today runs on the host answering the RPC; the
// literal keeps room to add a routed variant later without reshaping callers.
export type RuntimeExternalAutomationTarget = { type: 'local' }

export type RuntimeExternalAutomationRun = {
  id: string
  managerId: string
  provider: RuntimeExternalAutomationProvider
  jobId: string
  runAt: string | null
  status: RuntimeExternalAutomationRunStatus
  outputPreview: string | null
  outputContent: string | null
  error: string | null
  outputPath: string | null
}

export type RuntimeExternalAutomationJob = {
  id: string
  managerId: string
  provider: RuntimeExternalAutomationProvider
  name: string
  schedule: string
  rawSchedule: string | null
  enabled: boolean
  state: string
  prompt: string | null
  promptPreview: string
  nextRunAt: string | null
  lastRunAt: string | null
  lastStatus: string | null
  lastError: string | null
  workdir: string | null
  runCount: number
  runs: RuntimeExternalAutomationRun[]
}

export type RuntimeExternalAutomationManager = {
  id: string
  provider: RuntimeExternalAutomationProvider
  label: string
  targetLabel: string
  target: RuntimeExternalAutomationTarget
  status: RuntimeExternalAutomationManagerStatus
  error: string | null
  canManage: boolean
  jobs: RuntimeExternalAutomationJob[]
}

export type RuntimeExternalAutomationRunsPage = {
  managerId: string
  provider: RuntimeExternalAutomationProvider
  target: RuntimeExternalAutomationTarget
  jobId: string
  page: number
  pageSize: number
  total: number
  runs: RuntimeExternalAutomationRun[]
}

export type RuntimeExternalAutomationManagersResult = {
  managers: RuntimeExternalAutomationManager[]
}
export type RuntimeExternalAutomationMutationResult = { ok: true }
export type RuntimeAutomationWorkspaceNameSnapshotResult = { updatedRunCount: number }

const ExternalAutomationTargetSchema = z.object({ type: z.literal('local') })
const ExternalAutomationProviderSchema = z.enum(['hermes', 'openclaw'])

export const ExternalAutomationRunsInputSchema = z.object({
  managerId: requiredString('Missing manager id'),
  provider: ExternalAutomationProviderSchema,
  target: ExternalAutomationTargetSchema,
  jobId: requiredString('Missing job id'),
  page: requiredNumber('Missing page'),
  pageSize: requiredNumber('Missing page size')
})

export const ExternalAutomationCreateInputSchema = z.object({
  managerId: requiredString('Missing manager id'),
  provider: ExternalAutomationProviderSchema,
  target: ExternalAutomationTargetSchema,
  name: requiredString('Missing automation name'),
  prompt: requiredString('Missing automation prompt'),
  schedule: requiredString('Missing schedule'),
  workdir: z.union([z.string(), z.null()])
})

export const ExternalAutomationUpdateInputSchema = ExternalAutomationCreateInputSchema.extend({
  jobId: requiredString('Missing job id')
})

export const ExternalAutomationActionInputSchema = z.object({
  managerId: requiredString('Missing manager id'),
  provider: ExternalAutomationProviderSchema,
  target: ExternalAutomationTargetSchema,
  jobId: requiredString('Missing job id'),
  action: z.enum(['pause', 'resume', 'run', 'delete'])
})

export const AutomationWorkspaceNameSnapshotInputSchema = z.object({
  workspaceId: requiredString('Missing workspace id'),
  displayName: requiredString('Missing display name')
})

export type ExternalAutomationRunsInput = z.infer<typeof ExternalAutomationRunsInputSchema>
export type ExternalAutomationCreateInput = z.infer<typeof ExternalAutomationCreateInputSchema>
export type ExternalAutomationUpdateInput = z.infer<typeof ExternalAutomationUpdateInputSchema>
export type ExternalAutomationActionInput = z.infer<typeof ExternalAutomationActionInputSchema>
export type AutomationWorkspaceNameSnapshotInput = z.infer<
  typeof AutomationWorkspaceNameSnapshotInputSchema
>
