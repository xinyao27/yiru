import type { TerminalSubscribeInput } from '@yiru/runtime-protocol/contract'

import type { RpcClient } from '~/transport/rpc-client'
import { subscribeRuntimeOrpc } from '~/transport/runtime-orpc-client'

export function subscribeMobileTerminalSafely(
  client: Pick<RpcClient, 'orpc'>,
  params: TerminalSubscribeInput,
  onData: (event: unknown) => void,
  onSynchronousError: () => void
): () => void {
  try {
    return subscribeRuntimeOrpc(client, (runtime) => runtime.terminal.subscribe, params, onData)
  } catch {
    // Why: a transport mock or closing socket can reject before returning an
    // unsubscribe handle; callers must still release their subscribing marker.
    onSynchronousError()
    return () => {}
  }
}
