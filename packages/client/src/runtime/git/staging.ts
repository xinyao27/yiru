import { callRuntimeOrpc } from '../orpc-client'
import { getRuntimeGitTarget, getRuntimeGitWorktree, type RuntimeGitContext } from './context'

export async function commitRuntimeGit(
  context: RuntimeGitContext,
  message: string
): Promise<{ success: boolean; error?: string }> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.commit,
    { worktree: getRuntimeGitWorktree(context), message },
    { timeoutMs: 30_000 }
  )
}

export async function stageRuntimeGitPath(
  context: RuntimeGitContext,
  filePath: string
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.stage,
    { worktree: getRuntimeGitWorktree(context), filePath },
    { timeoutMs: 15_000 }
  )
}

export async function bulkStageRuntimeGitPaths(
  context: RuntimeGitContext,
  filePaths: string[]
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.bulkStage,
    { worktree: getRuntimeGitWorktree(context), filePaths },
    { timeoutMs: 15_000 }
  )
}

export async function unstageRuntimeGitPath(
  context: RuntimeGitContext,
  filePath: string
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.unstage,
    { worktree: getRuntimeGitWorktree(context), filePath },
    { timeoutMs: 15_000 }
  )
}

export async function bulkUnstageRuntimeGitPaths(
  context: RuntimeGitContext,
  filePaths: string[]
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.bulkUnstage,
    { worktree: getRuntimeGitWorktree(context), filePaths },
    { timeoutMs: 15_000 }
  )
}

export async function bulkDiscardRuntimeGitPaths(
  context: RuntimeGitContext,
  filePaths: string[]
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.bulkDiscard,
    { worktree: getRuntimeGitWorktree(context), filePaths },
    { timeoutMs: 15_000 }
  )
}

export async function discardRuntimeGitPath(
  context: RuntimeGitContext,
  filePath: string
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.discard,
    { worktree: getRuntimeGitWorktree(context), filePath },
    { timeoutMs: 15_000 }
  )
}

export async function appendRuntimeGitignore(
  context: RuntimeGitContext,
  folderName: string
): Promise<boolean> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.appendGitignore,
    { worktree: getRuntimeGitWorktree(context), folderName },
    { timeoutMs: 15_000 }
  )
}
