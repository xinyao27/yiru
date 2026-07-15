import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type {
  SpoolCatalogWorktreeDescription,
  SpoolShareCatalogSource
} from './spool-share-catalog-source'
import type { SpoolSessionCatalog } from './spool-session-catalog'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-visibility'

type SpoolDescriptionRuntime = Pick<OrcaRuntimeService, 'showManagedWorktree' | 'onClientEvent'>

/** Projects owner metadata and delegates session inventory to the lazy catalog. */
export class SpoolOwnerShareSource implements SpoolShareCatalogSource {
  constructor(
    private readonly store: Store,
    private readonly runtime: SpoolDescriptionRuntime,
    private readonly sessions: SpoolSessionCatalog
  ) {}

  async describeWorktree(
    instance: SpoolPublicWorktreeInstance
  ): Promise<SpoolCatalogWorktreeDescription | null> {
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
    return {
      kind: instance.ownerWorktree.kind,
      projectKey: project ? `project:${project.id}` : `repo:${repo.id}`,
      projectName: project?.displayName ?? repo.displayName,
      worktreeName: worktree.displayName,
      branch: worktree.branch || null
    }
  }

  async listSessionPage(
    instance: SpoolPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string,
    signal: AbortSignal
  ) {
    return await this.sessions.listSessionPage(instance, cursor, inventoryScope, signal)
  }

  releaseSessionPage(
    instance: SpoolPublicWorktreeInstance,
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
