// Why: once an RPC frame reaches the wire, a timeout or socket drop cannot tell
// whether only the response was lost; callers must not blindly retry it.
const deliveryUnknownErrors = new WeakSet<Error>()

export function markRpcDeliveryUnknown<T extends Error>(error: T): T {
  deliveryUnknownErrors.add(error)
  return error
}

export function isRpcDeliveryUnknown(error: unknown): boolean {
  return error instanceof Error && deliveryUnknownErrors.has(error)
}
