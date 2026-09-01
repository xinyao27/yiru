import {
  handleClientEventsSubscribe,
  handleClientEventsUnsubscribe
} from '~main/runtime/rpc/methods/client-events'
import { handleRuntimeDriverEventsSubscribe } from '~main/runtime/rpc/methods/driver-events'
import { handleRuntimeProgressEventsSubscribe } from '~main/runtime/rpc/methods/host-progress-events'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: the top-level `runtime` contract key is a host-wide broadcast bus —
// repo/worktree/driver-ownership/progress changes fan out to every connected
// client, as opposed to a client asking about its own session (agent-session.ts)
// or the host's current telemetry snapshot (host-telemetry.ts). Direct-wired
// in its entirety (Phase 6 D-stage, 切片 73) with no legacy registration left:
// Legacy string-method callers reach `clientEvents.subscribe`/`unsubscribe`
// through the dispatcher's compatibility fallback, while negotiated clients
// use this direct oRPC wiring. `driverEvents` and `progressEvents` have only
// negotiated callers.
export const runtimeEventsRuntimeHandlers = {
  runtime: {
    clientEvents: {
      subscribe: runtimeImplementation.runtime.clientEvents.subscribe.handler(
        wireRuntimeStream('runtime.clientEvents.subscribe', handleClientEventsSubscribe)
      ),
      unsubscribe: runtimeImplementation.runtime.clientEvents.unsubscribe.handler(
        wireRuntimeMethod('runtime.clientEvents.unsubscribe', handleClientEventsUnsubscribe)
      )
    },
    driverEvents: {
      subscribe: runtimeImplementation.runtime.driverEvents.subscribe.handler(
        wireRuntimeStream('runtime.driverEvents.subscribe', handleRuntimeDriverEventsSubscribe)
      )
    },
    progressEvents: {
      subscribe: runtimeImplementation.runtime.progressEvents.subscribe.handler(
        wireRuntimeStream('runtime.progressEvents.subscribe', handleRuntimeProgressEventsSubscribe)
      )
    }
  }
} as const
