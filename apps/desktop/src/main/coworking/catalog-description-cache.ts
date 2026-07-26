import type { ResolvedCoworkingCatalogWorktree } from './catalog-projection-model'

type CachedCoworkingCatalogDescription = {
  shareEpoch: string
  value: ResolvedCoworkingCatalogWorktree
}

/** Keeps only sanitized rows proven within one connection/runtime/share generation. */
export class CoworkingCatalogDescriptionCache {
  private readonly byInstance = new Map<string, CachedCoworkingCatalogDescription>()

  resolve(instanceId: string, shareEpoch: string): ResolvedCoworkingCatalogWorktree | null {
    const cached = this.byInstance.get(instanceId)
    return cached?.shareEpoch === shareEpoch ? cloneResolvedDescription(cached.value) : null
  }

  remember(value: ResolvedCoworkingCatalogWorktree): ResolvedCoworkingCatalogWorktree {
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
  value: ResolvedCoworkingCatalogWorktree
): ResolvedCoworkingCatalogWorktree {
  return {
    instance: { ...value.instance },
    description: { ...value.description }
  }
}
