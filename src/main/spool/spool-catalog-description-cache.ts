import type { ResolvedSpoolCatalogWorktree } from './spool-catalog-projection-model'

type CachedSpoolCatalogDescription = {
  shareEpoch: string
  value: ResolvedSpoolCatalogWorktree
}

/** Keeps only sanitized rows proven within one connection/runtime/share generation. */
export class SpoolCatalogDescriptionCache {
  private readonly byInstance = new Map<string, CachedSpoolCatalogDescription>()

  resolve(instanceId: string, shareEpoch: string): ResolvedSpoolCatalogWorktree | null {
    const cached = this.byInstance.get(instanceId)
    return cached?.shareEpoch === shareEpoch ? cloneResolvedDescription(cached.value) : null
  }

  remember(value: ResolvedSpoolCatalogWorktree): ResolvedSpoolCatalogWorktree {
    const cached = cloneResolvedDescription(value)
    this.byInstance.set(value.instance.instanceId, {
      shareEpoch: value.instance.shareEpoch,
      value: cached
    })
    return cloneResolvedDescription(cached)
  }

  invalidate(instanceId: string): void {
    this.byInstance.delete(instanceId)
  }

  clear(): void {
    this.byInstance.clear()
  }
}

function cloneResolvedDescription(
  value: ResolvedSpoolCatalogWorktree
): ResolvedSpoolCatalogWorktree {
  return {
    instance: { ...value.instance },
    description: {
      ...value.description,
      sessions: value.description.sessions.map((session) => ({ ...session }))
    }
  }
}
