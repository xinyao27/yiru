import type { RpcRequest } from './rpc/core'

// Why: keepalive, abort wiring, admission, and accounting must classify a
// blocking method identically at every runtime transport boundary.
export function isLongPollRequest(request: RpcRequest): boolean {
  if (request.method === 'terminal.wait') {
    return true
  }
  // Why: ask can wait for minutes; this arms keepalives and the disconnect
  // abort signal instead of letting the ordinary socket idle wall end it.
  if (request.method === 'orchestration.ask') {
    return true
  }
  if (request.method === 'orchestration.check') {
    const params = request.params as { wait?: unknown } | undefined
    return params?.wait === true
  }
  return false
}
