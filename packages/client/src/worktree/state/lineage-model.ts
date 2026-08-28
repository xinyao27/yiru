import {
  getRepoExecutionHostId,
  type ExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import { readWorktreeMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterWorktreeMutation } from '~renderer/project-catalog/mutation-refresh'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import { findRepoForHost } from '../../repo/state/host-identity'
import type { AppState } from '../../store/types'
import { findWorktreeById, getRepoIdFromWorktreeId } from './types'

export type WorktreeLineageUpdateResult = {
  target: ReturnType<typeof getActiveRuntimeTarget>
}

export async function setWorktreeLineageForRuntime(
  settings: AppState['settings'],
  worktreeId: string,
  args: { parentWorktreeId?: string; noParent?: boolean }
): Promise<WorktreeLineageUpdateResult> {
  const target = getActiveRuntimeTarget(settings)
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const expectedRevision = readWorktreeMutationRevision(target, repoId)
  // Why: the local IPC handler for `worktrees:updateLineage` already delegates
  // to `runtime.updateManagedWorktreeMeta` — the exact method `worktree.set`
  // calls on the environment path — so routing local through the same oRPC
  // call is not a behavior change, just one fewer preload channel.
  const result = await callRuntimeOrpc(
    target,
    (client) => client.worktree.set,
    {
      expectedRevision,
      worktree: toRuntimeWorktreeSelector(worktreeId),
      ...(args.parentWorktreeId
        ? { parentWorktree: toRuntimeWorktreeSelector(args.parentWorktreeId) }
        : {}),
      ...(args.noParent === true ? { noParent: true } : {})
    },
    { timeoutMs: 15_000 }
  )
  await refreshAfterWorktreeMutation(target, repoId, result.revision)
  return { target }
}

export function getWorktreeHostId(
  state: Pick<AppState, 'repos' | 'settings' | 'worktreesByRepo' | 'detectedWorktreesByRepo'>,
  worktreeId: string
): ExecutionHostId | null {
  const worktree = findWorktreeById(state.worktreesByRepo, worktreeId)
  if (worktree?.hostId) {
    return worktree.hostId
  }
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const detected = state.detectedWorktreesByRepo[repoId]?.worktrees.find(
    (entry) => entry.id === worktreeId
  )
  if (detected?.hostId) {
    return detected.hostId
  }
  const repo = findRepoForHost(state.repos, repoId, { settings: state.settings })
  return repo ? getRepoExecutionHostId(repo) : null
}

export function resolveWorktreeRemovalHost(
  state: Pick<AppState, 'repos' | 'settings' | 'worktreesByRepo' | 'detectedWorktreesByRepo'>,
  worktreeId: string
): { hostId: ExecutionHostId | null; ambiguous: boolean } {
  const hostIds = new Set<ExecutionHostId>()
  for (const worktrees of Object.values(state.worktreesByRepo)) {
    for (const worktree of worktrees) {
      if (worktree.id === worktreeId && worktree.hostId) {
        hostIds.add(worktree.hostId)
      }
    }
  }
  for (const result of Object.values(state.detectedWorktreesByRepo)) {
    for (const worktree of result.worktrees) {
      if (worktree.id === worktreeId && worktree.hostId) {
        hostIds.add(worktree.hostId)
      }
    }
  }
  if (hostIds.size > 1) {
    return { hostId: null, ambiguous: true }
  }
  if (hostIds.size === 1) {
    return { hostId: hostIds.values().next().value ?? null, ambiguous: false }
  }

  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const repoHostIds = new Set(
    state.repos.filter((repo) => repo.id === repoId).map(getRepoExecutionHostId)
  )
  return repoHostIds.size > 1
    ? { hostId: null, ambiguous: true }
    : { hostId: repoHostIds.values().next().value ?? null, ambiguous: false }
}
