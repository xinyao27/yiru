import type { StateCreator } from 'zustand'
import { getRepoIdFromWorktreeId } from '~renderer/store/slices/worktree-state'
import type { AppState } from '~renderer/store/types'
import type { DiffComment, Worktree } from '~shared/types'

type AppStateSetter = Parameters<StateCreator<AppState>>[0]

export type DiffCommentMutation = {
  previous: DiffComment[] | undefined
  next: DiffComment[]
}

export function mutateDiffComments(
  set: AppStateSetter,
  worktreeId: string,
  mutate: (existing: DiffComment[]) => DiffComment[] | null
): DiffCommentMutation | null {
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  let previous: DiffComment[] | undefined
  let next: DiffComment[] | null = null
  set((state) => {
    const repoList = state.worktreesByRepo[repoId]
    const target = repoList?.find((worktree) => worktree.id === worktreeId)
    if (!repoList || !target) {
      return {}
    }
    previous = target.diffComments
    const computed = mutate(previous ?? [])
    if (computed === null) {
      return {}
    }
    next = computed
    const nextList: Worktree[] = repoList.map((worktree) =>
      worktree.id === worktreeId ? { ...worktree, diffComments: computed } : worktree
    )
    return { worktreesByRepo: { ...state.worktreesByRepo, [repoId]: nextList } }
  })
  return next === null ? null : { previous, next }
}

export function rollbackDiffComments(
  set: AppStateSetter,
  worktreeId: string,
  previous: DiffComment[] | undefined,
  expectedCurrent: DiffComment[]
): void {
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  set((state) => {
    const repoList = state.worktreesByRepo[repoId]
    const target = repoList?.find((worktree) => worktree.id === worktreeId)
    // Why: identity proves no later optimistic mutation has replaced this snapshot.
    if (!repoList || !target || target.diffComments !== expectedCurrent) {
      return {}
    }
    const nextList: Worktree[] = repoList.map((worktree) =>
      worktree.id === worktreeId ? { ...worktree, diffComments: previous } : worktree
    )
    return { worktreesByRepo: { ...state.worktreesByRepo, [repoId]: nextList } }
  })
}
