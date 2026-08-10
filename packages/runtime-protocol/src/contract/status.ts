import { type, type ContractRouter } from '@orpc/contract'

import type { RuntimeStatusResult } from '../status.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

const STATUS_ACCESS = { scope: 'host', tier: 'read' } as const
const STATUS_CLIENTS = { mobile: true } as const

export const statusContract = {
  get: withAccess(STATUS_ACCESS, STATUS_CLIENTS)
    .input(type<void>())
    .output(type<RuntimeStatusResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export { STATUS_GET_CONTRACT } from '../status.js'
export type {
  RuntimeDesktopWindowStatus,
  RuntimeDeviceScope,
  RuntimeGraphStatus,
  RuntimeHostPlatformName,
  RuntimeRemoteControlDiagnostics,
  RuntimeRemoteUpdateSupport,
  RuntimeStatusLegacyContract,
  RuntimeStatusResult
} from '../status.js'
