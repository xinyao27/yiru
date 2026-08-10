import type { RuntimeOrpcContext } from './bridge'
import { bridgeRuntimeProcedure } from './registered-method'

type RuntimeProcedureBuilder = {
  '~orpc': unknown
  handler: (
    handler: (options: {
      context: RuntimeOrpcContext
      input: unknown
      signal?: AbortSignal
    }) => unknown
  ) => unknown
}

export function bridgeRuntimeRouter(implementation: object): unknown {
  return bridgeRuntimeRouterNode(implementation, [])
}

function bridgeRuntimeRouterNode(node: unknown, path: string[]): unknown {
  if (isRuntimeProcedureBuilder(node)) {
    if (path.length === 0) {
      throw new Error('runtime_orpc_root_procedure')
    }
    return node.handler(bridgeRuntimeProcedure<unknown, unknown>(runtimeMethodName(node, path)))
  }
  if (!isRecord(node)) {
    throw new Error(`invalid_runtime_orpc_router:${path.join('.')}`)
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      bridgeRuntimeRouterNode(value, [...path, key])
    ])
  )
}

function runtimeMethodName(builder: RuntimeProcedureBuilder, path: string[]): string {
  const definition = builder['~orpc']
  if (isRecord(definition) && isRecord(definition.meta)) {
    const legacyMethod = definition.meta.legacyMethod
    if (typeof legacyMethod === 'string' && legacyMethod.length > 0) {
      return legacyMethod
    }
  }
  return path.join('.')
}

function isRuntimeProcedureBuilder(value: unknown): value is RuntimeProcedureBuilder {
  return isRecord(value) && '~orpc' in value && typeof value.handler === 'function'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
