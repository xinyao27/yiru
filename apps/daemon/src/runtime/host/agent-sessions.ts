import {
  AGENT_STATUS_STALE_AFTER_MS,
  agentPhaseFromStatus,
  type AgentPhase,
  type AgentStatusIpcPayload
} from '@yiru/runtime-protocol/model/agent'
import type { RuntimeTerminalListResult } from '@yiru/runtime-protocol/workbench/runtime-types'

type AgentSessionRuntime = {
  listTerminals: (worktreeSelector?: string, limit?: number) => Promise<RuntimeTerminalListResult>
}

export type WorkbenchAgentSession = {
  agentType: string | null
  phase: AgentPhase
  receivedAt: number
  startedAt: number
  terminalHandle: string
  title: string | null
  worktreeId: string
}

export async function listWorkbenchAgentSessions(
  runtime: AgentSessionRuntime,
  statuses: AgentStatusIpcPayload[],
  worktreeId?: string
): Promise<WorkbenchAgentSession[]> {
  const result = await runtime.listTerminals(worktreeId ? `id:${worktreeId}` : undefined, 500)
  const terminals = new Map(result.terminals.map((terminal) => [terminal.handle, terminal]))
  const sessions = new Map<string, WorkbenchAgentSession>()
  for (const status of statuses) {
    if (
      status.providerSessionOnly === true ||
      !status.terminalHandle ||
      !status.worktreeId ||
      Date.now() - status.receivedAt > AGENT_STATUS_STALE_AFTER_MS
    ) {
      continue
    }
    const terminal = terminals.get(status.terminalHandle)
    if (!terminal?.connected || terminal.worktreeId !== status.worktreeId) {
      continue
    }
    const current = sessions.get(status.terminalHandle)
    if (current && current.receivedAt >= status.receivedAt) {
      continue
    }
    sessions.set(status.terminalHandle, {
      agentType: typeof status.agentType === 'string' ? status.agentType : null,
      phase: agentPhaseFromStatus(status),
      receivedAt: status.receivedAt,
      startedAt: status.stateStartedAt,
      terminalHandle: status.terminalHandle,
      title: terminal.title,
      worktreeId: status.worktreeId
    })
  }
  return [...sessions.values()].sort((left, right) => right.receivedAt - left.receivedAt)
}
