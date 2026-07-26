import { CoworkingPeerConnectionError } from './peer-connection-contract'
import { clearPendingRequest, type CoworkingPendingPeerRequest } from './peer-response-dispatch'

export function rejectCoworkingPendingPeerRequests(
  pendingRequests: Map<string, CoworkingPendingPeerRequest>,
  outcomeMayBeUnknown: boolean
): void {
  for (const [id, pending] of pendingRequests) {
    clearPendingRequest(pending)
    pendingRequests.delete(id)
    const code = outcomeMayBeUnknown && pending.mutation ? 'outcome_unknown' : 'disconnected'
    try {
      pending.reject(new CoworkingPeerConnectionError(code))
    } catch {
      // A renderer-facing sink must not escape into the WebSocket event callback.
    }
  }
}
