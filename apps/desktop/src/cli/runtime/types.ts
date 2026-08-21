import type { RuntimeRpcFailure } from '@yiru/runtime-protocol/rpc-envelope'
import { RuntimeClientError } from '~shared/runtime-client-error'

export type {
  RuntimeRpcFailure,
  RuntimeRpcResponse,
  RuntimeRpcSuccess
} from '@yiru/runtime-protocol/rpc-envelope'

// Why: re-exported so every existing `../runtime-client` import keeps working
// while the desktop main process throws the same class from ~shared.
export { RuntimeClientError } from '~shared/runtime-client-error'

export class RuntimeRpcFailureError extends RuntimeClientError {
  readonly response: RuntimeRpcFailure

  constructor(response: RuntimeRpcFailure) {
    // Why: all client errors expose recovery through the same inherited channel.
    super(response.error.code, response.error.message, response.error.data)
    this.response = response
  }
}
