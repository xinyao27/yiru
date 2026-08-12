import type { RpcClient } from '~/transport/rpc-client'
import type {
  MobileMultiplexedTerminal,
  MobileTerminalSubscribeArgs
} from '~/transport/terminal-multiplex/types'

export function subscribeMobileTerminalSafely(
  client: Pick<RpcClient, 'terminalMultiplexer'>,
  args: MobileTerminalSubscribeArgs,
  onReady: (stream: MobileMultiplexedTerminal) => void,
  onError: (error: unknown) => void
): () => void {
  let stream: MobileMultiplexedTerminal | null = null
  let cancelled = false
  void client.terminalMultiplexer
    .subscribeTerminal(args)
    .then((nextStream) => {
      if (cancelled) {
        nextStream.close()
        return
      }
      stream = nextStream
      onReady(nextStream)
    })
    .catch((error: unknown) => {
      if (!cancelled) {
        onError(error)
      }
    })
  return () => {
    cancelled = true
    stream?.close()
  }
}
