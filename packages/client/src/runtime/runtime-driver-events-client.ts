import type {
  RuntimeDriverEvent,
  RuntimeDriverSubscriptionEvent
} from '@yiru/runtime-protocol/contract'

import { createLocalRuntimeOrpcClient } from './orpc-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'

// Why: these locks describe terminals and BrowserViews owned by the shell's
// runtime. A remote PTY carries its own driver state on its dedicated stream.
const runtimeDriverEvents = createRuntimeStreamFanOut({
  resolveClient: async () => (await createLocalRuntimeOrpcClient()).client,
  open: (client, signal) => client.runtime.driverEvents.subscribe(undefined, { signal })
})

type RuntimeDriverEventHandlers = {
  onEvent: (event: RuntimeDriverEvent) => void
  onReady: () => void
}

export function subscribeRuntimeDriverEvents(handlers: RuntimeDriverEventHandlers): () => void {
  return runtimeDriverEvents.subscribe((event) => {
    handleRuntimeDriverSubscriptionEvent(event, handlers)
  })
}

function handleRuntimeDriverSubscriptionEvent(
  event: RuntimeDriverSubscriptionEvent,
  handlers: RuntimeDriverEventHandlers
): void {
  switch (event.type) {
    case 'ready':
      handlers.onReady()
      return
    case 'terminalDriverChanged':
    case 'browserDriverChanged':
    case 'terminalFitOverrideChanged':
      handlers.onEvent(event)
      return
    case 'end':
      break
  }
}
