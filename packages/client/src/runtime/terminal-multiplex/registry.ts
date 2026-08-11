import { RemoteRuntimeTerminalMultiplexer } from './multiplexer'

const multiplexers = new Map<string, RemoteRuntimeTerminalMultiplexer>()

export function getRemoteRuntimeTerminalMultiplexer(
  environmentId: string
): RemoteRuntimeTerminalMultiplexer {
  let multiplexer = multiplexers.get(environmentId)
  if (!multiplexer) {
    multiplexer = new RemoteRuntimeTerminalMultiplexer(environmentId, (id, current) => {
      if (multiplexers.get(id) === current) {
        multiplexers.delete(id)
      }
    })
    multiplexers.set(environmentId, multiplexer)
  }
  return multiplexer
}
