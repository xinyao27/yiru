import { createORPCClient, type ClientLink, type ClientOptions } from '@orpc/client'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'

import type { RuntimeOrpcClientContext } from '../../runtime/orpc-connection'
import type { ExtensionRuntimeOrpcClient } from './client'
import { getExtensionRuntimeClient } from './session'

class ExtensionRuntimeQueryLink implements ClientLink<RuntimeOrpcClientContext> {
  async call(
    path: readonly string[],
    input: unknown,
    options: ClientOptions<RuntimeOrpcClientContext>
  ): Promise<unknown> {
    const client = await getExtensionRuntimeClient()
    const procedure = resolveProcedure(client, path)
    return procedure(input, {
      context: options.context,
      signal: options.signal
    })
  }
}

type RuntimeProcedure = (
  input: unknown,
  options: { context: RuntimeOrpcClientContext; signal?: AbortSignal }
) => Promise<unknown>

function resolveProcedure(
  client: ExtensionRuntimeOrpcClient,
  path: readonly string[]
): RuntimeProcedure {
  let node: unknown = client
  for (const segment of path) {
    if ((typeof node !== 'object' && typeof node !== 'function') || node === null) {
      throw new Error(`extension_runtime_procedure_missing:${path.join('.')}`)
    }
    node = Reflect.get(node, segment)
  }
  if (!isRuntimeProcedure(node)) {
    throw new Error(`extension_runtime_procedure_invalid:${path.join('.')}`)
  }
  return node
}

function isRuntimeProcedure(value: unknown): value is RuntimeProcedure {
  return typeof value === 'function'
}

const extensionRuntimeQueryClient = createORPCClient<ExtensionRuntimeOrpcClient>(
  new ExtensionRuntimeQueryLink()
)

export const extensionOrpc = createTanstackQueryUtils(extensionRuntimeQueryClient, {
  path: ['daemon']
})
