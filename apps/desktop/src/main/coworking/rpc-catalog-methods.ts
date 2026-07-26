import type { CoworkingCatalogProjection } from './catalog-projection'
import type { CoworkingCatalogSessionPageRequest } from './catalog-session-pages'
import { CoworkingRpcError } from './rpc-gateway'
import { createCoworkingRpcStream } from './rpc-stream'

export type CatalogInvocation = {
  kind: 'catalog'
  projection: CoworkingCatalogProjection
  snapshot(): Promise<unknown>
  sessionPage(request: CoworkingCatalogSessionPageRequest, signal: AbortSignal): Promise<unknown>
  renew(): void
  isCurrent(): boolean
}

export function createCatalogInvocation(projection: CoworkingCatalogProjection): CatalogInvocation {
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
        throw new CoworkingRpcError('resource_not_found')
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
  return createCoworkingRpcStream(async (sink, context) => {
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
    throw new CoworkingRpcError('resource_not_found')
  }
  return invocation as CatalogInvocation
}
