import type { SpoolRpcRequest } from '../../shared/spool/spool-wire-contract'
import { readSpoolCancellationRequestId } from './spool-rpc-request-validation'

/** Validates a same-connection cancellation before touching its target request. */
export function handleSpoolRpcCancellation(
  request: SpoolRpcRequest,
  options: {
    activeRequestIds: ReadonlySet<string>
    cancel(requestId: string): void
    disconnectDuplicate(): void
    sendInvalidArgument(): void
    sendCancelled(): void
  }
): void {
  const targetRequestId = readSpoolCancellationRequestId(request.params)
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
