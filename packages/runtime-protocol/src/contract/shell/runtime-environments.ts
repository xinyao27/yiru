import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'

const SHELL_ENVIRONMENT_READ_ACCESS = {
  scope: 'host',
  tier: 'read',
  principals: ['local']
} as const
const SHELL_ENVIRONMENT_WRITE_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local']
} as const

export const shellRuntimeEnvironmentsContract = {
  list: withAccess(SHELL_ENVIRONMENT_READ_ACCESS).output(type<unknown>()),
  resolve: withAccess(SHELL_ENVIRONMENT_READ_ACCESS)
    .input(type<{ selector: string }>())
    .output(type<unknown>()),
  remove: withAccess(SHELL_ENVIRONMENT_WRITE_ACCESS)
    .input(type<{ selector: string }>())
    .output(type<unknown>()),
  disconnect: withAccess(SHELL_ENVIRONMENT_WRITE_ACCESS)
    .input(type<{ selector: string }>())
    .output(type<unknown>()),
  getStatus: withAccess(SHELL_ENVIRONMENT_READ_ACCESS)
    .input(type<{ selector: string; timeoutMs?: number }>())
    .output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>
