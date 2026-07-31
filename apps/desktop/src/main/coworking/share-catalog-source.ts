import type { CoworkingSessionCatalogIdentity } from '~shared/coworking/catalog-contract'
import type { CoworkingWorktreeKind } from '~shared/coworking/worktree-kind'

import type { CoworkingPublicWorktreeInstance } from './worktree-visibility'

export type CoworkingCatalogSessionDescription = {
  sessionKey: string
  title: string
} & CoworkingSessionCatalogIdentity

export type CoworkingCatalogWorktreeDescription = {
  kind: CoworkingWorktreeKind
  projectKey: string
  projectIdentityKey: string | null
  projectName: string
  worktreeName: string
  branch: string | null
}

export type CoworkingShareCatalogSource = {
  describeWorktree(
    instance: CoworkingPublicWorktreeInstance
  ): Promise<CoworkingCatalogWorktreeDescription | null>
  listSessionPage(
    instance: CoworkingPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string,
    signal: AbortSignal
  ): Promise<{ sessions: readonly CoworkingCatalogSessionDescription[]; nextCursor: string | null }>
  releaseSessionPage(
    instance: CoworkingPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string
  ): void
  invalidateSessionPages(instanceId: string): void
  subscribe?: (listener: () => void) => () => void
}
