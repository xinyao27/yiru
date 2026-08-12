import type { RuntimeHostProgressEvent } from '@yiru/runtime-protocol/contract'

import { createLocalRuntimeOrpcClient } from './orpc-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'

const localHostProgressEvents = createRuntimeStreamFanOut({
  resolveClient: async () => (await createLocalRuntimeOrpcClient()).client,
  open: (client, signal) => client.runtime.progressEvents.subscribe(undefined, { signal })
})

export function onLocalHostProgressEvent<TType extends RuntimeHostProgressEvent['type']>(
  type: TType,
  callback: (event: Extract<RuntimeHostProgressEvent, { type: TType }>) => void
): () => void {
  return localHostProgressEvents.subscribe((event) => {
    if (event.type === type) {
      callback(event as Extract<RuntimeHostProgressEvent, { type: TType }>)
    }
  })
}
