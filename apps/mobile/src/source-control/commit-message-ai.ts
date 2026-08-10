import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

// Mirrors the host GenerateCommitMessageResult (src/main/text-generation/
// commit-message-text-generation.ts) — a single resolved result, not a stream.
export type MobileGenerateCommitMessageResult =
  | { success: true; message: string }
  | { success: false; error: string; canceled?: boolean }

// Normalizes the git.generateCommitMessage RPC into a discriminated result the
// UI can switch on. RPC transport failures and malformed payloads collapse to
// { success:false } so the caller never has to special-case them.
export async function requestMobileCommitMessage(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string
): Promise<MobileGenerateCommitMessageResult> {
  let result: MobileGenerateCommitMessageResult
  try {
    result = await callRuntimeOrpc(client, (runtime) => runtime.git.generateCommitMessage, {
      worktree: `id:${worktreeId}`
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate commit message'
    }
  }
  if (!result || typeof result !== 'object') {
    return { success: false, error: 'Failed to generate commit message' }
  }
  if (result.success === true && typeof result.message === 'string' && result.message.length > 0) {
    return { success: true, message: result.message }
  }
  // Why: a malformed `{ success:false }` payload could leave error undefined,
  // breaking the result contract — always coerce to a non-empty string.
  const hostError =
    result.success === false && typeof result.error === 'string' && result.error.length > 0
      ? result.error
      : 'No commit message generated'
  return {
    success: false,
    error: hostError,
    ...(result.success === false && result.canceled ? { canceled: true } : {})
  }
}

export async function cancelMobileCommitMessage(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string
): Promise<void> {
  await callRuntimeOrpc(client, (runtime) => runtime.git.cancelGenerateCommitMessage, {
    worktree: `id:${worktreeId}`
  })
}
