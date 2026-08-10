import { type, type ContractRouter } from '@orpc/contract'

import type { RuntimeHostPlatformName } from '../status.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

const HOST_CAPABILITY_ACCESS = { scope: 'host', tier: 'read' } as const
const HOST_CAPABILITY_CLIENTS = { mobile: true } as const

export type RuntimeHostPlatform = { platform: RuntimeHostPlatformName }

export const hostContract = {
  platform: withAccess(HOST_CAPABILITY_ACCESS, HOST_CAPABILITY_CLIENTS)
    .input(type<void>())
    .output(type<RuntimeHostPlatform>()),
  wsl: {
    isAvailable: withAccess(HOST_CAPABILITY_ACCESS, HOST_CAPABILITY_CLIENTS)
      .input(type<void>())
      .output(type<boolean>()),
    listDistros: withAccess(HOST_CAPABILITY_ACCESS, HOST_CAPABILITY_CLIENTS)
      .input(type<void>())
      .output(type<string[]>())
  },
  pwsh: {
    isAvailable: withAccess(HOST_CAPABILITY_ACCESS, HOST_CAPABILITY_CLIENTS)
      .input(type<void>())
      .output(type<boolean>())
  },
  gitBash: {
    isAvailable: withAccess(HOST_CAPABILITY_ACCESS, HOST_CAPABILITY_CLIENTS)
      .input(type<void>())
      .output(type<boolean>())
  }
} satisfies ContractRouter<RuntimeProcedureMeta>

export type { RuntimeHostPlatformName } from '../status.js'
