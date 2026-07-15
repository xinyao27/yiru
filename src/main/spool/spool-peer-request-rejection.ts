import { SpoolPeerConnectionError } from './spool-peer-connection-contract'
import { clearPendingRequest, type SpoolPendingPeerRequest } from './spool-peer-response-dispatch'

export function rejectSpoolPendingPeerRequests(
  pendingRequests: Map<string, SpoolPendingPeerRequest>,
  outcomeMayBeUnknown: boolean
): void {
  for (const [id, pending] of pendingRequests) {
    clearPendingRequest(pending)
    pendingRequests.delete(id)
    const code = outcomeMayBeUnknown && pending.mutation ? 'outcome_unknown' : 'disconnected'
    try {
      pending.reject(new SpoolPeerConnectionError(code))
    } catch {
      // A renderer-facing sink must not escape into the WebSocket event callback.
    }
  }
}
