import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc, isRuntimeOrpcErrorCode } from '~/transport/runtime-orpc-client'
import { getRepoIdFromMobileWorktreeId } from '~/worktree/id'

import { isMobileGitUnavailable } from './git-status'

type RuntimeRepoSummary = {
  id: string
  worktreeBaseRef?: string | null
}

type RuntimeWorktreeSummary = {
  baseRef?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readRepoSummaries(value: unknown): RuntimeRepoSummary[] {
  if (!isRecord(value) || !Array.isArray(value.repos)) {
    return []
  }
  return value.repos.flatMap((candidate): RuntimeRepoSummary[] => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string') {
      return []
    }
    return [
      {
        id: candidate.id,
        worktreeBaseRef:
          typeof candidate.worktreeBaseRef === 'string' ? candidate.worktreeBaseRef : null
      }
    ]
  })
}

function readDefaultBaseRef(value: unknown): string | null {
  if (!isRecord(value)) {
    return null
  }
  return typeof value.defaultBaseRef === 'string' ? value.defaultBaseRef.trim() || null : null
}

function readWorktreeSummary(value: unknown): RuntimeWorktreeSummary | null {
  if (!isRecord(value) || !isRecord(value.worktree)) {
    return null
  }
  return {
    baseRef: typeof value.worktree.baseRef === 'string' ? value.worktree.baseRef : null
  }
}

export async function resolveMobileBranchCompareBaseRef(
  client: RpcClient,
  worktreeId: string
): Promise<string | null> {
  const repoId = getRepoIdFromMobileWorktreeId(worktreeId)
  if (!repoId) {
    return null
  }

  const [worktreeResponse, repoResponse] = await Promise.all([
    callRuntimeOrpc(client, (runtime) => runtime.worktree.show, {
      worktree: `id:${worktreeId}`
    }).catch(() => null),
    callRuntimeOrpc(client, (runtime) => runtime.repo.list, undefined).catch(() => null)
  ])
  if (worktreeResponse) {
    const worktreeBaseRef = readWorktreeSummary(worktreeResponse)?.baseRef?.trim() || null
    if (worktreeBaseRef) {
      return worktreeBaseRef
    }
  }

  if (repoResponse) {
    const repo = readRepoSummaries(repoResponse).find((candidate) => candidate.id === repoId)
    const repoBaseRef = repo?.worktreeBaseRef?.trim() || null
    if (repoBaseRef) {
      return repoBaseRef
    }
  }

  try {
    const result = await callRuntimeOrpc(client, (runtime) => runtime.repo.baseRefDefault, {
      repo: `id:${repoId}`
    })
    return readDefaultBaseRef(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined
    if (
      isRuntimeOrpcErrorCode(error, 'forbidden') ||
      isRuntimeOrpcErrorCode(error, 'method_not_found') ||
      isMobileGitUnavailable(undefined, message)
    ) {
      return null
    }
    throw error
  }
}
