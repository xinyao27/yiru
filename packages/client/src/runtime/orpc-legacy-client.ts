import { createORPCClient, type ClientLink } from '@orpc/client'
import { runtimeContract } from '@yiru/runtime-protocol/contract'

import type { RuntimeClientTarget, RuntimeOrpcCallOptions } from './orpc-client'
import type {
  RuntimeOrpcClient,
  RuntimeOrpcClientConnection,
  RuntimeOrpcClientContext
} from './orpc-connection'
import { createLegacyRuntimeOrpcStream } from './orpc-legacy-stream'
import { callRuntimeRpc } from './rpc-client'

export function createLegacyRuntimeOrpcClient(
  target: Extract<RuntimeClientTarget, { kind: 'environment' }>,
  options: Pick<RuntimeOrpcCallOptions, 'timeoutMs' | 'reuseRecentCompatibilityFailure'>
): RuntimeOrpcClientConnection {
  const link: ClientLink<RuntimeOrpcClientContext> = {
    call: (path, input, callOptions) => {
      const procedure = legacyRuntimeProcedure(path)
      if (procedure.isStreaming) {
        return createLegacyRuntimeOrpcStream({
          environmentId: target.environmentId,
          method: procedure.method,
          input,
          timeoutMs: options.timeoutMs,
          signal: callOptions.signal,
          onBinary: callOptions.context.onBinary
        })
      }
      return callRuntimeRpc(target, procedure.method, input, {
        timeoutMs: options.timeoutMs,
        reuseRecentCompatibilityFailure: options.reuseRecentCompatibilityFailure,
        signal: callOptions.signal
      })
    }
  }
  return {
    client: createORPCClient<RuntimeOrpcClient>(link),
    transport: 'legacy',
    close: () => {}
  }
}

function legacyRuntimeProcedure(path: readonly string[]): {
  method: string
  isStreaming: boolean
} {
  let node: unknown = runtimeContract
  for (const segment of path) {
    node = isRecord(node) ? node[segment] : undefined
  }
  if (isRecord(node) && isRecord(node['~orpc']) && isRecord(node['~orpc'].meta)) {
    const legacyMethod = node['~orpc'].meta.legacyMethod
    if (typeof legacyMethod === 'string' && legacyMethod.length > 0) {
      return { method: legacyMethod, isStreaming: isEventIteratorProcedure(node) }
    }
  }
  return { method: path.join('.'), isStreaming: isEventIteratorProcedure(node) }
}

function isEventIteratorProcedure(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value['~orpc'])) {
    return false
  }
  const output = value['~orpc'].outputSchema
  const standard = isRecord(output) ? output['~standard'] : null
  if (!isRecord(standard)) {
    return false
  }
  // Why: oRPC keeps event-iterator schema details behind a package-private
  // symbol; its stable symbol description is the only runtime discriminator.
  return Object.getOwnPropertySymbols(standard).some(
    (symbol) => symbol.description === 'ORPC_EVENT_ITERATOR_DETAILS'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
