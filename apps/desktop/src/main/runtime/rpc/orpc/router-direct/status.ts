import { handleStatusGet } from '~main/runtime/rpc/methods/status'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: `status.get` is the capability-negotiation bootstrap probe — called
// before a caller knows whether oRPC is even supported, so it can never be
// required to negotiate one (docs/runtime-orpc-migration.md Phase 6's own
// warning). It stayed legacy-registered for that reason alone, not because it
// lacked a direct-wired home. Slice 110 gives `RpcDispatcher` a fallback into
// this direct wiring for a handful of unary leaves reached over a bare,
// unnegotiated envelope — `status.get` included, since every caller of it is
// exactly that shape — which is what finally makes retiring its legacy
// registration (methods/status.ts) safe. This is a single-leaf domain like
// `ai-vault`/`provider-usage`, so it stands alone rather than joining a
// same-file neighbor.
export const statusRuntimeHandlers = {
  status: {
    get: runtimeImplementation.status.get.handler(wireRuntimeMethod('status.get', handleStatusGet))
  }
} as const
