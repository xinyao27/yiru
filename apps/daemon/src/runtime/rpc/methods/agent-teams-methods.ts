import type {
  AgentTeamsPrepareLaunchInput,
  AgentTeamsPrepareLaunchResult,
  AgentTeamsTmuxCompatInput,
  AgentTeamsTmuxCompatResult
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

export async function handleAgentTeamsTmuxCompat(
  params: AgentTeamsTmuxCompatInput,
  { runtime }: RpcContext
): Promise<AgentTeamsTmuxCompatResult> {
  return { tmux: await runtime.handleAgentTeamsTmuxCompat(params) }
}

export async function handleAgentTeamsPrepareLaunch(
  params: AgentTeamsPrepareLaunchInput,
  { runtime }: RpcContext
): Promise<AgentTeamsPrepareLaunchResult> {
  return {
    launch: await runtime.prepareClaudeAgentTeamsLeader({
      paneKey: params.paneKey,
      baseEnv: params.env
    })
  }
}
