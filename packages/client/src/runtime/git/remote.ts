import type {
  GitForkSyncExpectedUpstream,
  GitForkSyncResult,
  GitPushTarget,
  GitUpstreamStatus
} from '~shared/types'

import { callRuntimeOrpc } from '../orpc-client'
import { getRuntimeGitTarget, getRuntimeGitWorktree, type RuntimeGitContext } from './context'

export async function getRuntimeGitUpstreamStatus(
  context: RuntimeGitContext,
  pushTarget?: GitPushTarget
): Promise<GitUpstreamStatus> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.upstreamStatus,
    {
      worktree: getRuntimeGitWorktree(context),
      ...(pushTarget ? { pushTarget } : {})
    },
    { timeoutMs: 15_000 }
  )
}

export async function fetchRuntimeGit(
  context: RuntimeGitContext,
  pushTarget?: GitPushTarget
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.fetch,
    {
      worktree: getRuntimeGitWorktree(context),
      ...(pushTarget ? { pushTarget } : {})
    },
    { timeoutMs: 30_000 }
  )
}

export async function syncRuntimeGitForkDefaultBranch(
  context: RuntimeGitContext,
  expectedUpstream: GitForkSyncExpectedUpstream
): Promise<GitForkSyncResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.forkSync,
    { worktree: getRuntimeGitWorktree(context), expectedUpstream },
    { timeoutMs: 60_000 }
  )
}

export async function pullRuntimeGit(
  context: RuntimeGitContext,
  pushTarget?: GitPushTarget
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.pull,
    {
      worktree: getRuntimeGitWorktree(context),
      ...(pushTarget ? { pushTarget } : {})
    },
    { timeoutMs: 30_000 }
  )
}

export async function fastForwardRuntimeGit(
  context: RuntimeGitContext,
  pushTarget?: GitPushTarget
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.fastForward,
    {
      worktree: getRuntimeGitWorktree(context),
      ...(pushTarget ? { pushTarget } : {})
    },
    { timeoutMs: 30_000 }
  )
}

export async function rebaseRuntimeGitFromBase(
  context: RuntimeGitContext,
  baseRef: string
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.rebaseFromBase,
    { worktree: getRuntimeGitWorktree(context), baseRef },
    { timeoutMs: 30_000 }
  )
}

export async function pushRuntimeGit(
  context: RuntimeGitContext,
  args: { publish?: boolean; pushTarget?: GitPushTarget; forceWithLease?: boolean } = {}
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.push,
    {
      worktree: getRuntimeGitWorktree(context),
      ...(args.publish !== undefined ? { publish: args.publish } : {}),
      ...(args.pushTarget !== undefined ? { pushTarget: args.pushTarget } : {}),
      ...(args.forceWithLease !== undefined ? { forceWithLease: args.forceWithLease } : {})
    },
    { timeoutMs: 30_000 }
  )
}
