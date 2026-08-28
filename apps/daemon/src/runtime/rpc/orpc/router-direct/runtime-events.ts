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
// Electron still reaches `clientEvents.subscribe`/`unsubscribe` through a
// bare string-method channel with no oRPC negotiation, but `unsubscribe`
// dropped its registration once `RpcDispatcher` gained a fallback into this
// direct wiring for unary bare-envelope callers (docs/runtime-orpc-
// migration.md Phase 6 slice 110), and `subscribe` (streaming) dropped
// its own once slice 112 gave `RpcDispatcher` the streaming sibling of that
// fallback (legacy-dispatch-fallback.ts's
// `LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES`), which drains
// methods/client-events.ts's `handleClientEventsSubscribe` through `emit` for
// the same caller. `driverEvents`/`progressEvents` have no such caller and
// were retired outright.
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
