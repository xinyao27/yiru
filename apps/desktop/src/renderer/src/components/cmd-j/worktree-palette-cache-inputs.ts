import type { AppState } from '@/store/types'

export type WorktreePaletteCacheInputs = {
  prCache: AppState['prCache'] | null
  hostedReviewCache: AppState['hostedReviewCache'] | null
}

export const EMPTY_WORKTREE_PALETTE_CACHE_INPUTS: WorktreePaletteCacheInputs = Object.freeze({
  prCache: null,
  hostedReviewCache: null
})

export function selectWorktreePaletteCacheInputs(
  state: Pick<AppState, 'prCache' | 'hostedReviewCache'>,
  active: boolean
): WorktreePaletteCacheInputs {
  // Why: the palette stays mounted while closed; cache replacement from Checks
  // must not rerender it when no search results are visible.
  if (!active) {
    return EMPTY_WORKTREE_PALETTE_CACHE_INPUTS
  }
  return {
    prCache: state.prCache,
    hostedReviewCache: state.hostedReviewCache
  }
}
