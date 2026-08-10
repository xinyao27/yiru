import { getRemoteServerUpdaterSnapshot } from '~main/runtime/remote-server-updater'
import type { RuntimeStatus } from '~shared/runtime-types'

type StatusRuntimeContext = {
  runtime: {
    getRuntimeId: () => string
    getStatus: () => RuntimeStatus
  }
}

// Why: `status.get` is the capability-negotiation bootstrap probe — it can
// never require negotiation itself, so it stayed legacy-registered until
// `RpcDispatcher` gained a fallback into the direct-wired oRPC router for
// unary bare-envelope callers (docs/runtime-orpc-migration.md Phase 6 slice
// 110, orpc/router-direct/status.ts). This handler is now that direct
// wiring's only implementation.
export function handleStatusGet(_params: void, { runtime }: StatusRuntimeContext): RuntimeStatus {
  const snapshot = getRemoteServerUpdaterSnapshot(runtime.getRuntimeId())
  return {
    ...runtime.getStatus(),
    appVersion: snapshot.appVersion,
    remoteUpdateSupport: snapshot.support
  }
}
