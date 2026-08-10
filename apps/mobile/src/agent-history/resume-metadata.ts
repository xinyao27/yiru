import {
  RESUME_RPC_TIMEOUT_MS,
  type MobileAiVaultResumeSettings
} from '../session/ai-vault-resume-launch'
import type { RpcClient } from '../transport/rpc-client'
import { callRuntimeOrpc } from '../transport/runtime-orpc-client'
import type { Worktree } from '../workspace/list-types'
import type {
  MobileAiVaultResumeFolderWorkspace,
  MobileAiVaultResumeProjectGroup,
  MobileAiVaultResumeRepo
} from './resume-target'

export async function loadMobileResumeMetadata(client: RpcClient): Promise<{
  repos: MobileAiVaultResumeRepo[]
  folderWorkspaces: MobileAiVaultResumeFolderWorkspace[]
  projectGroups: MobileAiVaultResumeProjectGroup[]
  settings: MobileAiVaultResumeSettings | null
  worktrees: Worktree[] | null
}> {
  // Why: repo.list can enrich repo remote identities, so fetch resume-only
  // metadata after explicit user intent instead of delaying history browsing.
  // timeoutMs: without it a socket drop parks these on the reconnect waiter
  // for minutes, pinning the resume spinner (see RESUME_RPC_TIMEOUT_MS).
  const [
    repoResponse,
    folderWorkspaceResponse,
    projectGroupResponse,
    settingsResponse,
    worktreeResponse
  ] = await Promise.all([
    callRuntimeOrpc(client, (runtime) => runtime.repo.list, undefined, {
      timeoutMs: RESUME_RPC_TIMEOUT_MS
    }),
    callRuntimeOrpc(client, (runtime) => runtime.folderWorkspace.list, undefined, {
      timeoutMs: RESUME_RPC_TIMEOUT_MS
    }).catch(() => null),
    callRuntimeOrpc(client, (runtime) => runtime.projectGroup.list, undefined, {
      timeoutMs: RESUME_RPC_TIMEOUT_MS
    }).catch(() => null),
    callRuntimeOrpc(client, (runtime) => runtime.settings.get, undefined, {
      timeoutMs: RESUME_RPC_TIMEOUT_MS
    }).catch(() => null),
    callRuntimeOrpc(
      client,
      (runtime) => runtime.worktree.ps,
      { limit: 10000 },
      {
        timeoutMs: RESUME_RPC_TIMEOUT_MS
      }
    ).catch(() => null)
  ])
  return {
    repos: repoResponse.repos,
    folderWorkspaces: folderWorkspaceResponse?.folderWorkspaces ?? [],
    projectGroups: projectGroupResponse?.groups ?? [],
    settings: settingsResponse?.settings ?? null,
    worktrees: worktreeResponse?.worktrees ?? null
  }
}

export function createMobileAiVaultResumeMutationId(sessionId: string): string {
  const sessionPart = sessionId.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 64) || 'session'
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `ai-vault-resume:${sessionPart}:${Date.now().toString(36)}:${randomPart}`
}
