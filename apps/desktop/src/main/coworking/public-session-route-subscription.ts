import type { CoworkingMobileVaultSessionSource } from './mobile-vault-session-source'
import type { CoworkingWorktreeVisibility } from './worktree-visibility'

type PublicSessionRouteSource = Pick<
  CoworkingMobileVaultSessionSource,
  'trackPublicWorktree' | 'untrackPublicWorktree'
>

/** Keeps future-session provenance aligned with the worktree's Public lifetime. */
export function subscribePublicSessionRoutes(
  visibility: CoworkingWorktreeVisibility,
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
