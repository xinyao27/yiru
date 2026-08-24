import { getRepoIdFromWorktreeId } from '@yiru/workbench-model/workspace'
import type { GitPushTarget, WorktreeHeadIdentity } from '~shared/types'

import { validateGitPushTarget } from '../git/push-target-validation'
import { gitExecFileAsync } from '../git/runner'
import { publishWorktreeChangeEvent } from './change-events'
import { publishWorktreeHeadIdentityEvent } from './head-identity-events'
import {
  cleanupUnusedWorktreePushTargetRemoteWithExec,
  sameGitHubRemoteUrl
} from './push-target-cleanup'
import type { WorktreePushTargetStore } from './push-target-cleanup'
import {
  configureCreatedWorktreePushTargetWithExec,
  prepareWorktreePushTargetWithExec
} from './push-target-setup'

function isPushTargetRemoteCreatedByKnownWorktree(
  store: WorktreePushTargetStore,
  target: GitPushTarget,
  repoId?: string
): boolean {
  return Object.entries(store.getAllWorktreeMeta()).some(([worktreeId, meta]) => {
    if (repoId && getRepoIdFromWorktreeId(worktreeId) !== repoId) {
      return false
    }
    if (!meta.pushTarget?.remoteCreated) {
      return false
    }
    const otherRemoteUrl = meta.pushTarget.remoteUrl
    const targetRemoteUrl = target.remoteUrl
    return (
      meta.pushTarget.remoteName === target.remoteName ||
      (typeof otherRemoteUrl === 'string' &&
        typeof targetRemoteUrl === 'string' &&
        sameGitHubRemoteUrl(otherRemoteUrl, targetRemoteUrl))
    )
  })
}

export async function prepareWorktreePushTarget(
  repoPath: string,
  target: GitPushTarget,
  store?: WorktreePushTargetStore,
  repoId?: string,
  gitOptions: { wslDistro?: string } = {}
): Promise<GitPushTarget> {
  await validateGitPushTarget(repoPath, target, gitOptions)
  return prepareWorktreePushTargetWithExec(
    (args, cwd) => gitExecFileAsync(args, { cwd, ...gitOptions }),
    repoPath,
    target,
    (existingRemote) =>
      store
        ? isPushTargetRemoteCreatedByKnownWorktree(
            store,
            { ...target, remoteName: existingRemote },
            repoId
          )
        : false
  )
}

export async function cleanupUnusedWorktreePushTargetRemote(
  repoPath: string,
  removedWorktreeId: string,
  target: GitPushTarget | undefined,
  store: WorktreePushTargetStore,
  gitOptions: { wslDistro?: string } = {}
): Promise<void> {
  try {
    await cleanupUnusedWorktreePushTargetRemoteWithExec(
      repoPath,
      removedWorktreeId,
      target,
      store,
      (args, cwd) => gitExecFileAsync(args, { cwd, ...gitOptions })
    )
  } catch (error) {
    console.warn(`[worktrees] Failed to clean up fork PR remote for ${removedWorktreeId}`, error)
  }
}

export async function configureCreatedWorktreePushTarget(
  worktreePath: string,
  branchName: string,
  target: GitPushTarget,
  gitOptions: { wslDistro?: string } = {}
): Promise<GitPushTarget> {
  return configureCreatedWorktreePushTargetWithExec(
    (args, cwd) => gitExecFileAsync(args, { cwd, ...gitOptions }),
    worktreePath,
    branchName,
    target
  )
}

export function notifyWorktreesChanged(repoId: string): void {
  publishWorktreeChangeEvent(repoId)
}

export function notifyWorktreeGitStatusMetadataChanged(repoId: string): void {
  publishWorktreeChangeEvent(repoId)
}

export function notifyWorktreeHeadIdentitiesChanged(
  repoId: string,
  identities: WorktreeHeadIdentity[]
): void {
  publishWorktreeHeadIdentityEvent(repoId, identities)
}
