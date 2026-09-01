import type { RemoteRuntimeSocketLivenessOptions } from './socket-liveness'

export type RemoteRuntimeSharedControlConnectionOptions = {
  environmentId?: string
  reconnectStableResetMs?: number
  liveness?: RemoteRuntimeSocketLivenessOptions
}
