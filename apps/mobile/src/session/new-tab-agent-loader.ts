import { getRepoIdFromMobileWorktreeId } from '~/worktree/id'

import type { RpcClient } from '../transport/rpc-client'
import { callRuntimeOrpc } from '../transport/runtime-orpc-client'
import { isFloatingWorkspaceWorktreeId } from './floating-workspace'
import {
  buildMobileNewTabAgentOptions,
  type MobileNewTabAgentOption,
  type MobileNewTabAgentSettings
} from './new-tab-agent-options'

type RuntimeRepoSummary = {
  id: string
  connectionId?: string | null
}

export async function loadMobileNewTabAgentOptions(args: {
  client: RpcClient
  worktreeId: string
}): Promise<MobileNewTabAgentOption[]> {
  const { client, worktreeId } = args
  // Why: the floating workspace runs on the paired host, so there is no repo connection to resolve.
  const detectedAgentsRequest = isFloatingWorkspaceWorktreeId(worktreeId)
    ? callRuntimeOrpc(client, (runtime) => runtime.preflight.detectAgents, undefined)
    : loadWorkspaceDetectedAgents(client, worktreeId)
  const [settingsResponse, detectedResponse] = await Promise.all([
    callRuntimeOrpc(client, (runtime) => runtime.settings.get, undefined),
    detectedAgentsRequest
  ])
  const settings: MobileNewTabAgentSettings | undefined = settingsResponse.settings
  return buildMobileNewTabAgentOptions(settings, detectedResponse)
}

async function loadWorkspaceDetectedAgents(client: RpcClient, worktreeId: string) {
  const repoResponse = await callRuntimeOrpc(client, (runtime) => runtime.repo.list, undefined)
  const repoId = getRepoIdFromMobileWorktreeId(worktreeId)
  const repos: RuntimeRepoSummary[] = repoResponse.repos
  const repo = repos.find((candidate) => candidate.id === repoId)
  if (!repo) {
    throw new Error('worktree_repo_not_found')
  }
  const connectionId = repo.connectionId?.trim() || null
  return connectionId
    ? callRuntimeOrpc(client, (runtime) => runtime.preflight.detectRemoteAgents, { connectionId })
    : callRuntimeOrpc(client, (runtime) => runtime.preflight.detectAgents, undefined)
}
