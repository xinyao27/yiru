import type { RpcMethod } from '~main/runtime/rpc/core'

import { ORCHESTRATION_FEDERATION_METHODS } from './federation/methods'

// Why: this list is now empty (slice 84 retired the last 8 `federation*`
// leaves) — every orchestration leaf is wired natively in
// `runtime/rpc/orpc/router-direct/orchestration.ts` with no legacy
// registration left (see that file's own note). Kept as a real aggregator
// rather than deleted so a future structurally-blocked leaf (mirroring the
// non-orchestration Phase 6 D-stage exceptions) has an obvious place to land.
export const ORCHESTRATION_METHODS: RpcMethod[] = [...ORCHESTRATION_FEDERATION_METHODS]
