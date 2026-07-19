import type { ExecutionHostId } from '../../../shared/execution-host'

export type ProjectSourceHostAvailability = {
  hostId: ExecutionHostId
  reason?:
    | 'missing-provider-auth'
    | 'unavailable-source-tool'
    | 'unsupported-provider'
    | 'missing-project-source-capability'
    | 'checking-project-source-capability'
  health?: 'connected' | 'connecting' | 'disconnected' | 'blocked' | 'error'
  status?:
    | 'connected'
    | 'connecting'
    | 'disconnected'
    | 'auth-failed'
    | 'deploying-relay'
    | 'reconnecting'
    | 'reconnection-failed'
    | 'error'
}
