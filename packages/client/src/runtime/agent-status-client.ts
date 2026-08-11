import type {
  AgentStatusIpcPayload,
  MigrationUnsupportedPtyEntry
} from '@yiru/workbench-model/agent'
import type { AgentInterruptInferenceRequest } from '~shared/agent/interrupt-intent'

import {
  callRuntimeOrpc,
  createLocalRuntimeOrpcClient,
  type RuntimeOrpcClient
} from './orpc-client'

// Why: every PTY host funnels hooks back to the shell runtime's one agent-status
// authority. On web, the local adapter intentionally resolves to the paired host.
const LOCAL_RUNTIME_TARGET = { kind: 'local' } as const

export function getAgentStatusSnapshot(): Promise<AgentStatusIpcPayload[]> {
  return callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.agentStatus.getSnapshot,
    undefined
  )
}

export function getMigrationUnsupportedAgentStatusSnapshot(): Promise<
  MigrationUnsupportedPtyEntry[]
> {
  return callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.agentStatus.getMigrationUnsupportedSnapshot,
    undefined
  )
}

export function inferAgentStatusInterrupt(
  request: AgentInterruptInferenceRequest
): Promise<boolean> {
  return callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.agentStatus.inferInterrupt,
    request
  )
}

export function dropAgentStatusOnHost(paneKey: string): void {
  dispatchAgentStatusMutation((client) => client.agentStatus.drop({ paneKey }))
}

export function dropAgentStatusesByTabPrefixOnHost(tabId: string): void {
  dispatchAgentStatusMutation((client) => client.agentStatus.dropByTabPrefix({ tabId }))
}

export function retireAgentPaneAuthorityOnHost(paneKey: string): void {
  dispatchAgentStatusMutation((client) => client.agentStatus.retirePaneAuthority({ paneKey }))
}

export function transferAgentPaneAuthorityOnHost(args: {
  fromPaneKey: string
  toPaneKey: string
  ptyId?: string
}): void {
  dispatchAgentStatusMutation((client) => client.agentStatus.transferPaneAuthority(args))
}

function dispatchAgentStatusMutation(mutate: (client: RuntimeOrpcClient) => Promise<void>): void {
  void Promise.resolve()
    .then(() => mutate(createLocalRuntimeOrpcClient().client))
    .catch(() => {
      // Why: these mirror the old fire-and-forget IPC teardown messages. A
      // disconnect must not turn routine pane disposal into an unhandled rejection.
    })
}
