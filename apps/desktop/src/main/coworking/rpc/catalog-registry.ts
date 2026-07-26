import { z } from 'zod'

import type { CoworkingShareCatalog } from '../share-catalog'
import {
  asCatalogInvocation,
  createCatalogInvocation,
  createCatalogStream
} from './catalog-methods'
import {
  CoworkingRpcError,
  type BoundCoworkingInvocation,
  type CoworkingRpcInvocationContext,
  type CoworkingRpcMethodSpec
} from './gateway'

const EmptyParams = z.object({}).strict()
const CatalogSessionPageParams = z
  .object({
    worktreeRef: z.string().min(1).max(2048),
    shareEpoch: z.string().min(1).max(2048),
    catalogRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    cursor: z.string().min(1).max(2048)
  })
  .strict()

export function createCoworkingCatalogRpcMethods(
  catalog: CoworkingShareCatalog
): readonly CoworkingRpcMethodSpec[] {
  return [
    {
      name: 'catalog.snapshot',
      schema: EmptyParams,
      access: 'catalog-read',
      bind: (_params, context) => bindCatalog(catalog, context),
      execute: (bound) => asCatalogInvocation(bound).snapshot(),
      project: identityProjector
    },
    {
      name: 'catalog.subscribe',
      schema: EmptyParams,
      access: 'catalog-read',
      streaming: true,
      bind: (_params, context) => bindCatalog(catalog, context),
      execute: (bound) => createCatalogStream(asCatalogInvocation(bound)),
      project: identityProjector
    },
    {
      name: 'catalog.sessions.page',
      schema: CatalogSessionPageParams,
      access: 'catalog-read',
      bind: (params, context) =>
        bindCatalogSessionPage(catalog, CatalogSessionPageParams.parse(params), context),
      execute: (bound, context) => {
        const page = asCatalogSessionPageInvocation(bound)
        return page.catalog.sessionPage(page.request, context.signal)
      },
      project: identityProjector
    }
  ]
}

type CatalogSessionPageInvocation = {
  kind: 'catalog-session-page'
  catalog: ReturnType<typeof createCatalogInvocation>
  request: z.infer<typeof CatalogSessionPageParams>
}

function bindCatalogSessionPage(
  catalog: CoworkingShareCatalog,
  request: z.infer<typeof CatalogSessionPageParams>,
  context: CoworkingRpcInvocationContext
): BoundCoworkingInvocation {
  const bound = bindCatalog(catalog, context)
  return {
    ...bound,
    value: {
      kind: 'catalog-session-page',
      catalog: asCatalogInvocation(bound.value),
      request
    } satisfies CatalogSessionPageInvocation
  }
}

function asCatalogSessionPageInvocation(value: unknown): CatalogSessionPageInvocation {
  const invocation = value as Partial<CatalogSessionPageInvocation>
  if (invocation.kind !== 'catalog-session-page' || !invocation.catalog || !invocation.request) {
    throw new CoworkingRpcError('resource_not_found')
  }
  return invocation as CatalogSessionPageInvocation
}

function bindCatalog(
  catalog: CoworkingShareCatalog,
  context: CoworkingRpcInvocationContext
): BoundCoworkingInvocation {
  const projection = catalog.getProjection(context.principal.connectionId)
  if (!projection) {
    throw new CoworkingRpcError('resource_unavailable')
  }
  const invocation = createCatalogInvocation(projection)
  return {
    value: invocation,
    isCurrent: () =>
      catalog.getProjection(context.principal.connectionId) === projection && invocation.isCurrent()
  }
}

function identityProjector(value: unknown): unknown {
  return value
}
