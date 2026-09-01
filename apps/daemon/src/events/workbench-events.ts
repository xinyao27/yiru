import type {
  AgentPhase,
  RuntimeAgentStatusEvent,
  RuntimeHostProgressEvent
} from '@yiru/runtime-protocol/contract'
import { agentPhaseFromStatus } from '@yiru/runtime-protocol/model/agent'
import { getRepoIdFromWorktreeId } from '@yiru/runtime-protocol/model/workspace'

import type { WorkbenchRuntimeBridge } from '../workbench/runtime'
import type { WorkspaceEventLog } from './log'

type AgentPhaseListener = (input: {
  phase: AgentPhase
  terminal: string
  title: string | null
  worktreeId: string
}) => void

export function persistWorkbenchEvents(
  runtime: WorkbenchRuntimeBridge,
  events: WorkspaceEventLog,
  onAgentPhase: AgentPhaseListener
): () => void {
  const phases = new Map<string, AgentPhase>()
  const detachProgress = runtime.onHostProgressEvent((progress) => {
    if (progress.type === 'worktreeCreateProgress') {
      persistWorktreeProgress(events, progress)
    }
  })
  const detachAgentStatus = runtime.onAgentStatusEvent((event) => {
    persistAgentStatus(runtime, events, phases, event, onAgentPhase)
  })
  return () => {
    detachAgentStatus()
    detachProgress()
  }
}

function persistWorktreeProgress(
  events: WorkspaceEventLog,
  progress: Extract<RuntimeHostProgressEvent, { type: 'worktreeCreateProgress' }>
): void {
  try {
    events.append(
      progress.repoId,
      `worktree.create.${progress.phase}`,
      getWorktreeProgressPayload(progress)
    )
  } catch (error) {
    // Why: observability must never abort the authoritative worktree operation.
    console.error('[daemon] Failed to persist worktree progress', error)
  }
}

function persistAgentStatus(
  runtime: WorkbenchRuntimeBridge,
  events: WorkspaceEventLog,
  phases: Map<string, AgentPhase>,
  event: RuntimeAgentStatusEvent,
  onAgentPhase: AgentPhaseListener
): void {
  if (event.type === 'clear') {
    phases.delete(event.paneKey)
    return
  }
  if (event.type !== 'set' || event.status.providerSessionOnly || !event.status.worktreeId) {
    return
  }
  const phase = agentPhaseFromStatus(event.status)
  if (phases.get(event.status.paneKey) === phase) {
    return
  }
  phases.set(event.status.paneKey, phase)
  const scope = getRepoIdFromWorktreeId(event.status.worktreeId)
  events.append(scope, `agent.phase.${phase}`, {
    paneKey: event.status.paneKey,
    terminal: event.status.terminalHandle ?? null,
    worktreeId: event.status.worktreeId
  })
  if (event.status.terminalHandle) {
    onAgentPhase({
      phase,
      terminal: event.status.terminalHandle,
      title: null,
      worktreeId: event.status.worktreeId
    })
  }
  if (phase === 'waiting-decision' || phase === 'complete') {
    void persistWorktreeChangeCount(
      runtime,
      events,
      scope,
      event.status.paneKey,
      phase,
      event.status.worktreeId
    )
  }
}

async function persistWorktreeChangeCount(
  runtime: WorkbenchRuntimeBridge,
  events: WorkspaceEventLog,
  scope: string,
  paneKey: string,
  phase: 'complete' | 'waiting-decision',
  worktreeId: string
): Promise<void> {
  try {
    const changedFileCount = await runtime.readWorktreeChangeCount(worktreeId)
    events.append(scope, 'agent.workspace-changes', {
      changedFileCount,
      paneKey,
      phase,
      worktreeId
    })
  } catch (error) {
    // Why: status delivery is more important than an optional git summary.
    console.warn('[daemon] Failed to summarize agent workspace changes', error)
  }
}

function getWorktreeProgressPayload(
  progress: Extract<RuntimeHostProgressEvent, { type: 'worktreeCreateProgress' }>
) {
  return {
    operationId: progress.operationId ?? null,
    ...(progress.copiedFileCount === undefined
      ? {}
      : { copiedFileCount: progress.copiedFileCount }),
    ...(progress.setupConfigured === undefined ? {} : { setupConfigured: progress.setupConfigured })
  }
}
