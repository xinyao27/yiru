import { createORPCClient, type ClientLink } from '@orpc/client'

import type { RuntimeClientTarget, RuntimeOrpcCallOptions } from './orpc-client'
import type {
  RuntimeOrpcClient,
  RuntimeOrpcClientConnection,
  RuntimeOrpcClientContext
} from './orpc-message-port-client'

// Why: a paired web client already negotiates a real oRPC peer (or falls back
// to its own JSON-RPC wrapper) once per host in
// `renderer/web/runtime-client.ts#getOrpcClient`. Dispatching by contract path
// through that negotiated client — instead of resolving to a legacy string
// method up front, as `createLegacyRuntimeOrpcClient` does — means this call
// site never has to re-decide transport: it inherits whatever
// `WebRuntimeClient` already proved the host supports.
export function createWebEnvironmentRuntimeOrpcClient(
  target: Extract<RuntimeClientTarget, { kind: 'environment' }>,
  options: Pick<RuntimeOrpcCallOptions, 'timeoutMs'>
): RuntimeOrpcClientConnection {
  const link: ClientLink<RuntimeOrpcClientContext> = {
    call: (path, input, callOptions) =>
      window.api.runtimeEnvironments.callOrpcProcedure(
        {
          selector: target.environmentId,
          path,
          input,
          timeoutMs: options.timeoutMs
        },
        { signal: callOptions.signal, onBinary: callOptions.context.onBinary }
      )
  }
  return {
    client: createORPCClient<RuntimeOrpcClient>(link),
    transport: 'web-peer',
    close: () => {}
  }
}
