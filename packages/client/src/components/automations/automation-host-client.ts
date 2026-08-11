import { parseExecutionHostId } from '@yiru/workbench-model/workspace'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import type {
  Automation,
  AutomationCreateInput,
  AutomationRun,
  AutomationUpdateInput,
  ExternalAutomationActionInput,
  ExternalAutomationCreateInput,
  ExternalAutomationManager,
  ExternalAutomationRunsInput,
  ExternalAutomationRunsPage,
  ExternalAutomationUpdateInput
} from '~shared/automations-types'
import type { GlobalSettings } from '~shared/types'

type RuntimeAutomationCreateInput = Omit<
  AutomationCreateInput,
  'projectId' | 'workspaceId' | 'timezone'
> & {
  repo?: string
  workspace?: string
  timezone?: string
}

type RuntimeAutomationUpdateInput = Omit<AutomationUpdateInput, 'projectId' | 'workspaceId'> & {
  repo?: string
  workspace?: string
}

export type AutomationHostTarget =
  | { kind: 'local' }
  | { kind: 'environment'; environmentId: string }

export function getAutomationTargetFromHostId(
  hostId: string | null | undefined
): AutomationHostTarget {
  const parsed = parseExecutionHostId(hostId)
  return parsed?.kind === 'runtime'
    ? { kind: 'environment', environmentId: parsed.environmentId }
    : { kind: 'local' }
}

export function getAutomationListTarget(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): AutomationHostTarget {
  const environmentId = settings?.activeRuntimeEnvironmentId?.trim()
  return environmentId ? { kind: 'environment', environmentId } : { kind: 'local' }
}

export function getAutomationOwnerTarget(
  automation: Pick<Automation, 'runContext'>,
  sourceTarget?: AutomationHostTarget | null
): AutomationHostTarget {
  if (sourceTarget?.kind === 'environment') {
    return sourceTarget
  }
  return getAutomationTargetFromHostId(automation.runContext?.hostId)
}

export function getAutomationCreateTarget(input: AutomationCreateInput): AutomationHostTarget {
  return getAutomationTargetFromHostId(input.runContext?.hostId)
}

function toRuntimeAutomationCreateInput(
  input: AutomationCreateInput
): RuntimeAutomationCreateInput {
  const { projectId, workspaceId, ...rest } = input
  return {
    ...rest,
    repo: projectId,
    workspace: input.workspaceMode === 'existing' ? (workspaceId ?? undefined) : undefined
  }
}

function toRuntimeAutomationUpdateInput(
  input: AutomationUpdateInput
): RuntimeAutomationUpdateInput {
  const { projectId, workspaceId, ...rest } = input
  return {
    ...rest,
    ...(projectId !== undefined ? { repo: projectId } : {}),
    ...(workspaceId !== undefined ? { workspace: workspaceId ?? undefined } : {})
  }
}

// Why: the local target used to shortcut through `rendererHostClient.automations.*`
// (raw preload IPC) instead of the oRPC contract, even though every one of
// these procedures is already direct-wired and the `environment` branch below
// proves the contract shape is correct. That left the local path as the only
// caller still on the legacy channel, and left automations unreachable from
// web builds (whose preload has no `automations` group at all). Routing local
// through the same `callRuntimeOrpc` client as remote hosts closes both gaps.
export async function listAutomationsForTarget(
  target: AutomationHostTarget
): Promise<Automation[]> {
  const result = await callRuntimeOrpc(target, (client) => client.automation.list, undefined, {
    timeoutMs: 15_000
  })
  return result.automations
}

export async function listAutomationRunsForTarget(
  target: AutomationHostTarget,
  automationId?: string
): Promise<AutomationRun[]> {
  const result = await callRuntimeOrpc(
    target,
    (client) => client.automation.runs,
    automationId ? { automationId } : {},
    { timeoutMs: 15_000 }
  )
  return result.runs
}

export async function createAutomationForTarget(input: AutomationCreateInput): Promise<Automation> {
  const target = getAutomationCreateTarget(input)
  const result = await callRuntimeOrpc(
    target,
    (client) => client.automation.create,
    toRuntimeAutomationCreateInput(input),
    { timeoutMs: 15_000 }
  )
  return result.automation
}

export async function updateAutomationForTarget(
  automation: Pick<Automation, 'id' | 'runContext'>,
  updates: AutomationUpdateInput,
  sourceTarget?: AutomationHostTarget | null
): Promise<Automation> {
  const target = getAutomationOwnerTarget(automation, sourceTarget)
  const result = await callRuntimeOrpc(
    target,
    (client) => client.automation.update,
    { id: automation.id, updates: toRuntimeAutomationUpdateInput(updates) },
    { timeoutMs: 15_000 }
  )
  return result.automation
}

export async function deleteAutomationForTarget(
  automation: Pick<Automation, 'id' | 'runContext'>,
  sourceTarget?: AutomationHostTarget | null
): Promise<void> {
  const target = getAutomationOwnerTarget(automation, sourceTarget)
  await callRuntimeOrpc(
    target,
    (client) => client.automation.delete,
    { id: automation.id },
    { timeoutMs: 15_000 }
  )
}

export async function runAutomationNowForTarget(
  automation: Pick<Automation, 'id' | 'runContext'>,
  sourceTarget?: AutomationHostTarget | null
): Promise<AutomationRun> {
  const target = getAutomationOwnerTarget(automation, sourceTarget)
  const result = await callRuntimeOrpc(
    target,
    (client) => client.automation.runNow,
    { id: automation.id },
    { timeoutMs: 15_000 }
  )
  return result.run
}

// Why: external (Hermes/OpenClaw) cron managers were still on raw preload IPC
// with no host-target concept at all — always asking whichever process the
// renderer happened to be running in. The contract's own `target: {type:
// 'local'}` field only means "the answering host's own managers"; which host
// answers is still this call's `AutomationHostTarget`, same as every other
// automation procedure above.
export async function listExternalAutomationManagersForTarget(
  target: AutomationHostTarget
): Promise<ExternalAutomationManager[]> {
  const result = await callRuntimeOrpc(
    target,
    (client) => client.automation.listExternalManagers,
    undefined,
    { timeoutMs: 15_000 }
  )
  return result.managers
}

export async function listExternalAutomationRunsForTarget(
  target: AutomationHostTarget,
  input: ExternalAutomationRunsInput
): Promise<ExternalAutomationRunsPage> {
  return await callRuntimeOrpc(target, (client) => client.automation.listExternalRuns, input, {
    timeoutMs: 15_000
  })
}

export async function createExternalAutomationForTarget(
  target: AutomationHostTarget,
  input: ExternalAutomationCreateInput
): Promise<void> {
  await callRuntimeOrpc(target, (client) => client.automation.createExternal, input, {
    timeoutMs: 15_000
  })
}

export async function updateExternalAutomationForTarget(
  target: AutomationHostTarget,
  input: ExternalAutomationUpdateInput
): Promise<void> {
  await callRuntimeOrpc(target, (client) => client.automation.updateExternal, input, {
    timeoutMs: 15_000
  })
}

export async function runExternalAutomationActionForTarget(
  target: AutomationHostTarget,
  input: ExternalAutomationActionInput
): Promise<void> {
  await callRuntimeOrpc(target, (client) => client.automation.runExternalAction, input, {
    timeoutMs: 15_000
  })
}

export async function snapshotAutomationWorkspaceNameForTarget(
  target: AutomationHostTarget,
  args: { workspaceId: string; displayName: string }
): Promise<number> {
  const result = await callRuntimeOrpc(
    target,
    (client) => client.automation.snapshotWorkspaceName,
    args,
    { timeoutMs: 15_000 }
  )
  return result.updatedRunCount
}
