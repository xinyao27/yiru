import {
  getPortableProjectIdentityKey,
  getProjectIdentityKey
} from '../../../shared/project-host-setup-projection'
import type { Store } from '../../persistence'
import type { YiruRuntimeService } from '../../runtime/yiru-runtime'
import type { CoworkingSessionCatalog } from '../session/catalog'
import type {
  CoworkingCatalogWorktreeDescription,
  CoworkingShareCatalogSource
} from '../share-catalog-source'
import type { CoworkingPublicWorktreeInstance } from '../worktree-visibility'

type CoworkingDescriptionRuntime = Pick<YiruRuntimeService, 'showManagedWorktree' | 'onClientEvent'>

/** Projects owner metadata and delegates session inventory to the lazy catalog. */
export class CoworkingOwnerShareSource implements CoworkingShareCatalogSource {
  constructor(
    private readonly store: Store,
    private readonly runtime: CoworkingDescriptionRuntime,
    private readonly sessions: CoworkingSessionCatalog
  ) {}

  async describeWorktree(
    instance: CoworkingPublicWorktreeInstance
  ): Promise<CoworkingCatalogWorktreeDescription | null> {
    const worktree = await this.runtime.showManagedWorktree(`id:${instance.worktreeId}`)
    if (
      worktree.id !== instance.worktreeId ||
      worktree.instanceId !== instance.instanceId ||
      worktree.repoId !== instance.ownerWorktree.repoId
    ) {
      return null
    }
    const repo = this.store.getRepo(instance.ownerWorktree.repoId)
    if (!repo) {
      return null
    }
    const project = instance.projectId
      ? this.store.getProjects().find((entry) => entry.id === instance.projectId)
      : null
    const repoIdentityKey = getProjectIdentityKey(repo)
    return {
      kind: instance.ownerWorktree.kind,
      projectKey: project ? `project:${project.id}` : `repo:${repo.id}`,
      projectIdentityKey:
        (project ? getPortableProjectIdentityKey(project) : null) ??
        (repoIdentityKey.startsWith('repo:') ? null : repoIdentityKey),
      projectName: project?.displayName ?? repo.displayName,
      worktreeName: worktree.displayName,
      branch: worktree.branch || null
    }
  }

  async listSessionPage(
    instance: CoworkingPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string,
    signal: AbortSignal
  ) {
    return await this.sessions.listSessionPage(instance, cursor, inventoryScope, signal)
  }

  releaseSessionPage(
    instance: CoworkingPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string
  ): void {
    this.sessions.releaseSessionPage(instance, cursor, inventoryScope)
  }

  invalidateSessionPages(instanceId: string): void {
    this.sessions.invalidateInstance(instanceId)
  }

  subscribe(listener: () => void): () => void {
    const unsubscribeSessions = this.sessions.subscribe(listener)
    const unsubscribeRuntime = this.runtime.onClientEvent((event) => {
      if (event.type === 'reposChanged' || event.type === 'worktreesChanged') {
        listener()
      }
    })
    return () => {
      unsubscribeSessions()
      unsubscribeRuntime()
    }
  }
}
