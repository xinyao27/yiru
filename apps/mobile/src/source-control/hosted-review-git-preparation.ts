import type {
  GitBulkPathsInput,
  GitPushInput,
  GitTargetedRemoteInput
} from '@yiru/runtime-protocol/contract'

import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

import { readMobileGitStatusResult } from '../session/diff/review-rpc'
import type { MobileGitStatusResult } from './git-status'

export type MobileHostedReviewStatusReadResult =
  | { ok: true; status: MobileGitStatusResult | null }
  | { ok: false; error: string }

export async function readMobileHostedReviewGitStatus(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string
): Promise<MobileHostedReviewStatusReadResult> {
  try {
    const result = await callRuntimeOrpc(client, (runtime) => runtime.git.status, {
      worktree: `id:${worktreeId}`
    })
    return { ok: true, status: readMobileGitStatusResult(result) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to refresh source control'
    }
  }
}

export function mobileHostedReviewBranchStillMatches(
  inputBranch: string,
  status: MobileGitStatusResult | null
): boolean {
  const branch = status?.branch
  return Boolean(branch && (branch === inputBranch || branch === `refs/heads/${inputBranch}`))
}

export type MobileHostedReviewGitMutation =
  | { kind: 'push'; input: GitPushInput }
  | { kind: 'fastForward'; input: GitTargetedRemoteInput }
  | { kind: 'bulkStage'; input: GitBulkPathsInput }

export async function sendMobileHostedReviewGitMutation(
  client: Pick<RpcClient, 'orpc'>,
  mutation: MobileHostedReviewGitMutation,
  fallback: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    switch (mutation.kind) {
      case 'push':
        await callRuntimeOrpc(client, (runtime) => runtime.git.push, mutation.input)
        break
      case 'fastForward':
        await callRuntimeOrpc(client, (runtime) => runtime.git.fastForward, mutation.input)
        break
      case 'bulkStage':
        await callRuntimeOrpc(client, (runtime) => runtime.git.bulkStage, mutation.input)
        break
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : fallback }
  }
}

export async function commitMobileHostedReviewStagedChanges(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  message: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await callRuntimeOrpc(client, (runtime) => runtime.git.commit, {
      worktree: `id:${worktreeId}`,
      message
    })
    if (result?.success !== true) {
      return { ok: false, error: result?.error || 'Commit failed' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Commit failed' }
  }
}
