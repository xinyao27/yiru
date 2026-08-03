import type { CommitMessagePlan } from '~shared/commit-message/plan'

import type { RemoteHostPlatform } from '../ssh/remote/platform'
import type {
  RemoteCommitMessageExecResult,
  TextGenerationOperation
} from '../text-generation/commit-message-text-generation'
import type { IGitProvider } from './types'

/**
 * A git provider whose repository lives on another host: everything in
 * `IGitProvider`, plus the operations that only exist off-process — the host's
 * path/command flavor, the fetch RPCs the read-only `git.exec` channel rejects,
 * and the non-interactive exec channel text generation runs through.
 *
 * Why: the registry and its consumers must name this contract instead of a
 * concrete transport class, so the host implementation can be swapped or
 * removed without editing every signature it flows through. `RemoteHostPlatform`
 * is deliberately kept off `IGitProvider` in `providers/types.ts` — that file is
 * the process-neutral contract hub and must not depend on a host transport.
 */
export type IRemoteGitProvider = IGitProvider & {
  getHostPlatform(): RemoteHostPlatform | null
  // Why: optional on `IGitProvider` because the local exec-based path implements
  // them as free functions; a remote host has no such fallback and must answer.
  renameCurrentBranch(worktreePath: string, newBranch: string): Promise<void>
  forceDeletePreservedBranch(
    repoPath: string,
    branchName: string,
    expectedHead: string
  ): Promise<void>
  executeCommitMessagePlan(
    plan: CommitMessagePlan,
    cwd: string,
    timeoutMs: number,
    operation?: TextGenerationOperation
  ): Promise<RemoteCommitMessageExecResult>
  cancelGenerateCommitMessage(
    worktreePath: string,
    operation?: TextGenerationOperation
  ): Promise<void>
  execNonInteractive(
    binary: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
    signal?: AbortSignal,
    env?: Record<string, string>
  ): Promise<RemoteCommitMessageExecResult>
  fetchRemoteTrackingRef(
    worktreePath: string,
    remote: string,
    branch: string,
    ref: string,
    options?: { skipAutoMaintenance?: boolean }
  ): Promise<void>
  fetchGitLabMergeRequestHead(worktreePath: string, remote: string, mrIid: number): Promise<void>
  refreshLocalBaseRefForWorktreeCreate(args: {
    repoPath: string
    fullRef: string
    remoteTrackingRef: string
    ownerWorktreePath?: string
    checkOnly?: boolean
  }): Promise<void>
  clone(
    args: string[],
    cwd: string,
    options?: {
      signal?: AbortSignal
      timeoutMs?: number
      onProgress?: (progress: { phase: string; percent: number }) => void
    }
  ): Promise<{ stdout: string; stderr: string }>
}
