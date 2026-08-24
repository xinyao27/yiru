import type { Socket } from 'node:net'

import type { AgentHookRelayEnvelope } from '~shared/agent/hook-relay'

import type { DaemonFileLog } from './file-log'
import type { SubprocessHandle } from './session'

export type DaemonServerOptions = {
  socketPath: string
  tokenPath: string
  log?: DaemonFileLog
  agentHookHost?: { endpointDir: string; env: string }
  isAgentHookHostRequired?: boolean
  onAgentHook?: (envelope: AgentHookRelayEnvelope) => void
  onShutdownRequested?: () => void
  spawnSubprocess: (options: {
    sessionId: string
    cols: number
    rows: number
    cwd?: string
    env?: Record<string, string>
    command?: string
    shellOverride?: string
  }) => SubprocessHandle
}

export type ConnectedDaemonClient = {
  clientId: string
  controlSocket: Socket
  streamSocket: Socket | null
}
