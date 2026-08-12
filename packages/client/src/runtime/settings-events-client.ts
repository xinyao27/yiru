import type { RuntimeSettingsSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import { createLocalRuntimeOrpcClient } from './orpc-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'

const settingsEvents = createRuntimeStreamFanOut({
  resolveClient: async () => (await createLocalRuntimeOrpcClient()).client,
  open: (client, signal) => client.settings.events.subscribe(undefined, { signal })
})

export function subscribeRuntimeSettingsChanges(listener: () => void): () => void {
  return settingsEvents.subscribe((event: RuntimeSettingsSubscriptionEvent) => {
    if (event.type === 'changed') {
      listener()
    }
  })
}
