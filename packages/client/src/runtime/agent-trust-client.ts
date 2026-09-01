import type { AgentTrustInput } from '@yiru/runtime-protocol/contract'
import { useAppStore } from '~renderer/store/state'

import { callRuntimeOrpc, type RuntimeClientTarget } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

export function markAgentWorkspaceTrusted(
  input: AgentTrustInput,
  target: RuntimeClientTarget = getActiveRuntimeTarget(useAppStore.getState().settings)
): Promise<void> {
  return callRuntimeOrpc(target, (client) => client.host.agentTrust.markTrusted, input)
}
