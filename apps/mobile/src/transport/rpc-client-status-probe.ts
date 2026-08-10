import type { DesktopStatus } from './host-rpc-types'
import type { RpcResponse } from './types'

// Why: mobile requires an oRPC-capable host unconditionally (no bare-string
// fallback for feature RPCs), but `status.get` is the one pre-negotiation
// bootstrap probe every host has always answered as a bare envelope — old
// desktop builds included (desktop's legacy-dispatch-fallback.ts keeps
// serving it that way even after oRPC became mandatory). A host that
// predates `rpc.orpc.v1` can't parse the oRPC-framed call at all, so that
// call never resolves; this probe is the only way left to learn such a
// host's protocol version and render the "update Yiru on the host" screen
// instead of leaving the session silently stuck. It takes no method or
// params and can only ever ask for status, so it cannot become a general
// request primitive.
const STATUS_COMPAT_PROBE_TIMEOUT_MS = 5_000

export type DesktopStatusPayload = DesktopStatus & { capabilities?: string[] }

type MobileStatusCompatProbeOptions = {
  nextRequestId: () => string
  registerPending: (
    id: string,
    resolve: (response: RpcResponse) => void,
    reject: (error: Error) => void
  ) => void
  dropPending: (id: string) => void
  sendProbe: (id: string) => boolean
}

export function createMobileStatusCompatProbe(
  options: MobileStatusCompatProbeOptions
): (timeoutMs?: number) => Promise<DesktopStatusPayload | null> {
  return (timeoutMs = STATUS_COMPAT_PROBE_TIMEOUT_MS) =>
    new Promise((resolve) => {
      const id = options.nextRequestId()
      let settled = false
      const finish = (value: DesktopStatusPayload | null): void => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        options.dropPending(id)
        resolve(value)
      }
      const timer = setTimeout(() => finish(null), Math.max(0, timeoutMs))
      options.registerPending(
        id,
        (response) => finish(response.ok ? (response.result as DesktopStatusPayload) : null),
        () => finish(null)
      )
      if (!options.sendProbe(id)) {
        finish(null)
      }
    })
}
