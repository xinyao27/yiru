import type { SpoolCatalogProjection } from './spool-catalog-projection'
import type { SpoolCatalogSessionPageRequest } from './spool-catalog-session-pages'
import { SpoolRpcError } from './spool-rpc-gateway'
import { createSpoolRpcStream } from './spool-rpc-stream'

export type CatalogInvocation = {
  kind: 'catalog'
  projection: SpoolCatalogProjection
  snapshot(): Promise<unknown>
  sessionPage(request: SpoolCatalogSessionPageRequest, signal: AbortSignal): Promise<unknown>
  renew(): void
  isCurrent(): boolean
}

export function createCatalogInvocation(projection: SpoolCatalogProjection): CatalogInvocation {
  let generation = projection.currentGeneration()
  return {
    kind: 'catalog',
    projection,
    snapshot: async () => {
      const snapshot = await projection.snapshot()
      generation = snapshot.generation
      return snapshot.catalog
    },
    sessionPage: async (request, signal) => {
      const result = await projection.sessionPage(request, signal)
      if (!result || result.generation !== generation) {
        throw new SpoolRpcError('resource_not_found')
      }
      return result.page
    },
    renew: () => {
      generation = projection.currentGeneration()
    },
    isCurrent: () => generation === projection.currentGeneration()
  }
}

export function createCatalogStream(invocation: CatalogInvocation) {
  invocation.renew()
  return createSpoolRpcStream(async (sink, context) => {
    let active = true
    let tail = Promise.resolve()
    const publish = (): void => {
      tail = tail.then(async () => {
        if (active && !context.signal.aborted) {
          sink.next(await invocation.snapshot())
        }
      })
      void tail.catch((error: unknown) => sink.error(error))
    }
    const unsubscribe = invocation.projection.subscribe(publish)
    publish()
    return () => {
      active = false
      unsubscribe()
    }
  })
}

export function asCatalogInvocation(value: unknown): CatalogInvocation {
  const invocation = value as Partial<CatalogInvocation>
  if (
    invocation.kind !== 'catalog' ||
    !invocation.projection ||
    !invocation.snapshot ||
    !invocation.sessionPage ||
    !invocation.renew ||
    !invocation.isCurrent
  ) {
    throw new SpoolRpcError('resource_not_found')
  }
  return invocation as CatalogInvocation
}
