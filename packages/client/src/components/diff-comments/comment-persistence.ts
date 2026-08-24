import { getRuntimeEnvironmentIdForWorktree } from '~renderer/lib/worktree-runtime-owner'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget, settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'
import { getRepoIdFromWorktreeId } from '~renderer/store/slices/worktree-state'
import type { AppState } from '~renderer/store/types'

import { normalizeDiffComment } from './comment-model'

const persistQueueByWorktree = new Map<string, Promise<void>>()

async function persistLatestComments(get: () => AppState, worktreeId: string): Promise<void> {
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const targetWorktree = get().worktreesByRepo[repoId]?.find(
    (worktree) => worktree.id === worktreeId
  )
  const diffComments = (targetWorktree?.diffComments ?? []).map(normalizeDiffComment)
  const settings = settingsForRuntimeOwner(
    get().settings,
    getRuntimeEnvironmentIdForWorktree(get(), worktreeId)
  )
  const target = getActiveRuntimeTarget(settings)
  if (target.kind === 'local') {
    await workspaceHostClient.worktrees.updateMeta({ worktreeId, updates: { diffComments } })
    return
  }
  await callRuntimeOrpc(
    target,
    (client) => client.worktree.set,
    { worktree: toRuntimeWorktreeSelector(worktreeId), diffComments },
    { timeoutMs: 15_000 }
  )
}

export function enqueueDiffCommentPersistence(
  worktreeId: string,
  get: () => AppState
): Promise<void> {
  // Why: serialize per worktree and read state only when dequeued so older IPC writes
  // cannot overwrite newer snapshots and bursts collapse to the latest state.
  const prior = persistQueueByWorktree.get(worktreeId) ?? Promise.resolve()
  const run = (): Promise<void> => persistLatestComments(get, worktreeId)
  const next = prior.then(run, run)
  persistQueueByWorktree.set(worktreeId, next)
  const cleanup = (): void => {
    if (persistQueueByWorktree.get(worktreeId) === next) {
      persistQueueByWorktree.delete(worktreeId)
    }
  }
  // Why: two-handler then consumes rejection while preserving the caller's own promise.
  next.then(cleanup, cleanup)
  return next
}
