import { AsyncIteratorClass, createORPCClient, type ClientLink } from '@orpc/client'

import type { RuntimeClientTarget, RuntimeOrpcCallOptions } from './orpc-client'
import type {
  RuntimeOrpcClient,
  RuntimeOrpcClientConnection,
  RuntimeOrpcClientContext
} from './orpc-connection'
import { isRuntimeOrpcEventIteratorPath } from './orpc-stream-path'
import { runtimeEnvironmentsClient } from './runtime-environments-client'

// Why: the local daemon owns remote-host routing. Keeping the browser client on
// contract paths means Chrome never needs to know how WSL or SSH is transported.
export function createEnvironmentRuntimeOrpcClient(
  target: Extract<RuntimeClientTarget, { kind: 'environment' }>,
  options: Pick<RuntimeOrpcCallOptions, 'timeoutMs'>
): RuntimeOrpcClientConnection {
  const link: ClientLink<RuntimeOrpcClientContext> = {
    call: (path, input, callOptions) =>
      isRuntimeOrpcEventIteratorPath(path)
        ? openRuntimeEnvironmentOrpcStream({
            environmentId: target.environmentId,
            input,
            onBinary: callOptions.context.onBinary,
            path,
            signal: callOptions.signal
          })
        : runtimeEnvironmentsClient.callOrpcProcedure(
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
    transport: 'runtime-environment',
    close: () => {}
  }
}

async function openRuntimeEnvironmentOrpcStream(args: {
  environmentId: string
  input: unknown
  onBinary?: (bytes: Uint8Array<ArrayBufferLike>) => void
  path: readonly string[]
  signal?: AbortSignal
}): Promise<AsyncIteratorClass<unknown, void, void>> {
  const stream = await runtimeEnvironmentsClient.subscribeOrpcProcedure(
    { selector: args.environmentId, path: args.path, input: args.input },
    { signal: args.signal }
  )
  const iterator = stream[Symbol.asyncIterator]()
  return new AsyncIteratorClass<unknown, void, void>(
    async () => {
      while (true) {
        const next = await iterator.next()
        if (next.done) {
          return { done: true, value: undefined }
        }
        if (next.value.type === 'binary') {
          args.onBinary?.(next.value.bytes)
          continue
        }
        return { done: false, value: next.value.value }
      }
    },
    async () => {
      await iterator.return?.()
    }
  )
}
