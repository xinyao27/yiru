import type { ResolvedSpoolCatalogWorktree } from './spool-catalog-projection-model'

/** Fingerprints only identity-bearing catalog data; quota does not invalidate session cursors. */
export function spoolCatalogFingerprint(
  descriptions: readonly ResolvedSpoolCatalogWorktree[]
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
