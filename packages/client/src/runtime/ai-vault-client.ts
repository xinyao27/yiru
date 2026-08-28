import type { AiVaultListSessionsInput } from '@yiru/runtime-protocol/ai-vault'
import type {
  AiVaultListResult,
  AiVaultSubagentListArgs,
  AiVaultSubagentListResult
} from '@yiru/runtime-protocol/model/agent'
import { toRuntimeExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import { useAppStore } from '~renderer/store/state'

import { callRuntimeOrpc, callShellOrpc, isWebRuntimeClient } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

export function listAiVaultSessions(input: AiVaultListSessionsInput): Promise<AiVaultListResult> {
  if (!isWebRuntimeClient()) {
    return callShellOrpc((client) => client.shell.aiVault.listSessions, input)
  }
  const target = getActiveRuntimeTarget(useAppStore.getState().settings)
  if (target.kind !== 'environment') {
    return Promise.reject(new Error('Connect this web client to a runtime host first.'))
  }
  return callRuntimeOrpc(target, (client) => client.aiVault.listSessions, {
    limit: input.limit,
    force: input.force,
    scopePaths: input.scopePaths,
    executionHostId: toRuntimeExecutionHostId(target.environmentId)
  })
}

export function listAiVaultSubagentSessions(
  input: AiVaultSubagentListArgs
): Promise<AiVaultSubagentListResult> {
  if (isWebRuntimeClient()) {
    return Promise.resolve({ sessions: [], issues: [] })
  }
  return callShellOrpc((client) => client.shell.aiVault.listSubagentSessions, input)
}
