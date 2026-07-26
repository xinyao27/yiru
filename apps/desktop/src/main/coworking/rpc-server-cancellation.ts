import type { CoworkingRpcRequest } from '../../shared/coworking/wire-contract'
import { readCoworkingCancellationRequestId } from './rpc-request-validation'

/** Validates a same-connection cancellation before touching its target request. */
export function handleCoworkingRpcCancellation(
  request: CoworkingRpcRequest,
  options: {
    activeRequestIds: ReadonlySet<string>
    cancel(requestId: string): void
    disconnectDuplicate(): void
    sendInvalidArgument(): void
    sendCancelled(): void
  }
): void {
  const targetRequestId = readCoworkingCancellationRequestId(request.params)
  if (options.activeRequestIds.has(request.id)) {
    options.disconnectDuplicate()
    return
  }
  if (!targetRequestId) {
    options.sendInvalidArgument()
    return
  }
  options.cancel(targetRequestId)
  options.sendCancelled()
}
