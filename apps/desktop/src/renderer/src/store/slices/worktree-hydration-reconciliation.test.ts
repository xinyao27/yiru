import { describe, expect, it } from 'vite-plus/test'

import { reconcileHydratedWorktreeReferences } from './worktree-hydration-reconciliation'

describe('reconcileHydratedWorktreeReferences', () => {
  it('prunes stale timestamps and clears a stale active worktree after authoritative hydration', () => {
    const patch = reconcileHydratedWorktreeReferences({
      worktreesByRepo: { repo: [{ id: 'repo::/live' }] },
      detectedWorktreesByRepo: {},
      lastVisitedAtByWorktreeId: { 'repo::/live': 2, 'repo::/deleted': 1 },
      activeWorktreeId: 'repo::/deleted'
    })

    expect(patch).toEqual({
      lastVisitedAtByWorktreeId: { 'repo::/live': 2 },
      activeWorktreeId: null
    })
  })

  it('preserves a live active worktree', () => {
    const patch = reconcileHydratedWorktreeReferences({
      worktreesByRepo: { repo: [{ id: 'repo::/live' }] },
      detectedWorktreesByRepo: {},
      lastVisitedAtByWorktreeId: { 'repo::/live': 2 },
      activeWorktreeId: 'repo::/live'
    })

    expect(patch).toEqual({})
  })

  it('defers selection and timestamp cleanup while detected hydration is non-authoritative', () => {
    const pendingPatch = reconcileHydratedWorktreeReferences({
      worktreesByRepo: { ssh: [] },
      detectedWorktreesByRepo: { ssh: { authoritative: false, worktrees: [] } },
      lastVisitedAtByWorktreeId: { 'ssh::/not-yet-hydrated': 1 },
      activeWorktreeId: 'ssh::/not-yet-hydrated'
    })
    const authoritativePatch = reconcileHydratedWorktreeReferences({
      worktreesByRepo: { ssh: [] },
      detectedWorktreesByRepo: { ssh: { authoritative: true, worktrees: [] } },
      lastVisitedAtByWorktreeId: { 'ssh::/not-yet-hydrated': 1 },
      activeWorktreeId: 'ssh::/not-yet-hydrated'
    })

    expect(pendingPatch).toEqual({})
    expect(authoritativePatch).toEqual({
      lastVisitedAtByWorktreeId: {},
      activeWorktreeId: null
    })
  })
})
