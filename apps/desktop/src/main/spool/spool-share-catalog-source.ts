import type { SpoolSessionCatalogIdentity } from '../../shared/spool/spool-catalog-contract'
import type { SpoolWorktreeKind } from '../../shared/spool/spool-worktree-kind'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-visibility'

export type SpoolCatalogSessionDescription = {
  sessionKey: string
  title: string
} & SpoolSessionCatalogIdentity

export type SpoolCatalogWorktreeDescription = {
  kind: SpoolWorktreeKind
  projectKey: string
  projectIdentityKey: string | null
  projectName: string
  worktreeName: string
  branch: string | null
}

export type SpoolShareCatalogSource = {
  describeWorktree(
    instance: SpoolPublicWorktreeInstance
  ): Promise<SpoolCatalogWorktreeDescription | null>
  listSessionPage(
    instance: SpoolPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string,
    signal: AbortSignal
  ): Promise<{ sessions: readonly SpoolCatalogSessionDescription[]; nextCursor: string | null }>
  releaseSessionPage(
    instance: SpoolPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string
  ): void
  invalidateSessionPages(instanceId: string): void
  subscribe?: (listener: () => void) => () => void
}
