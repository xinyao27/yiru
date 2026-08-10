import type { DaemonAgentHookHostStatus } from './agent-hook-host'
import type { DaemonFileLog } from './file-log'
import { DaemonServer, type DaemonServerOptions } from './server'

export type DaemonStartOptions = {
  socketPath: string
  tokenPath: string
  spawnSubprocess: DaemonServerOptions['spawnSubprocess']
  log?: DaemonFileLog
  agentHookHost?: { endpointDir: string; env: string }
  isAgentHookHostRequired?: boolean
  onAgentHook?: DaemonServerOptions['onAgentHook']
  onShutdownRequested?: () => void
}

export type DaemonHandle = {
  agentHookHost: DaemonAgentHookHostStatus | null
  shutdown(): Promise<void>
}

export async function startDaemon(opts: DaemonStartOptions): Promise<DaemonHandle> {
  const server = new DaemonServer({
    socketPath: opts.socketPath,
    tokenPath: opts.tokenPath,
    spawnSubprocess: opts.spawnSubprocess,
    ...(opts.agentHookHost ? { agentHookHost: opts.agentHookHost } : {}),
    ...(opts.isAgentHookHostRequired
      ? { isAgentHookHostRequired: opts.isAgentHookHostRequired }
      : {}),
    ...(opts.onAgentHook ? { onAgentHook: opts.onAgentHook } : {}),
    ...(opts.onShutdownRequested ? { onShutdownRequested: opts.onShutdownRequested } : {}),
    ...(opts.log ? { log: opts.log } : {})
  })

  try {
    await server.start()
  } catch (error) {
    await server.shutdown()
    throw error
  }

  return {
    agentHookHost: server.getAgentHookHostStatus(),
    shutdown: () => server.shutdown()
  }
}
