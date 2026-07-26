import type { ResolvedCoworkingCatalogWorktree } from './projection-model'

/** Fingerprints only identity-bearing catalog data; quota does not invalidate session cursors. */
export function coworkingCatalogFingerprint(
  descriptions: readonly ResolvedCoworkingCatalogWorktree[]
): string {
  return JSON.stringify({
    worktrees: descriptions.map(({ instance, description }) => ({
      worktreeId: instance.worktreeId,
      instanceId: instance.instanceId,
      shareEpoch: instance.shareEpoch,
      description
    }))
  })
}
