import type { SpoolMobileVaultSessionSource } from './spool-mobile-vault-session-source'
import type { SpoolWorktreeVisibility } from './spool-worktree-visibility'

type PublicSessionRouteSource = Pick<
  SpoolMobileVaultSessionSource,
  'trackPublicWorktree' | 'untrackPublicWorktree'
>

/** Keeps future-session provenance aligned with the worktree's Public lifetime. */
export function subscribePublicSessionRoutes(
  visibility: SpoolWorktreeVisibility,
  sessions: PublicSessionRouteSource
): () => void {
  return visibility.subscribe((change) => {
    if (change.kind === 'published') {
      const instance = visibility.getPublishedInstance(change.instanceId, change.shareEpoch)
      if (instance) {
        sessions.trackPublicWorktree(instance)
      }
      return
    }
    sessions.untrackPublicWorktree(change.instanceId)
  })
}
