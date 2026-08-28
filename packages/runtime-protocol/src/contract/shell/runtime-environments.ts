import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import type { RuntimeRpcResponse } from '../../runtime-rpc-envelope.js'
import type { PublicKnownRuntimeEnvironment } from '../../workbench/runtime-environments.js'
import type { RuntimeStatus } from '../../workbench/runtime-types.js'
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

export type ShellRuntimeEnvironmentOrpcStreamEvent =
  | { type: 'value'; value: unknown }
  | { type: 'binary'; bytes: Uint8Array<ArrayBufferLike> }

export const shellRuntimeEnvironmentsContract = {
  list: withAccess(SHELL_ENVIRONMENT_READ_ACCESS).output(type<PublicKnownRuntimeEnvironment[]>()),
  resolve: withAccess(SHELL_ENVIRONMENT_READ_ACCESS)
    .input(type<{ selector: string }>())
    .output(type<PublicKnownRuntimeEnvironment>()),
  remove: withAccess(SHELL_ENVIRONMENT_WRITE_ACCESS)
    .input(type<{ selector: string }>())
    .output(type<{ removed: PublicKnownRuntimeEnvironment }>()),
  disconnect: withAccess(SHELL_ENVIRONMENT_WRITE_ACCESS)
    .input(type<{ selector: string }>())
    .output(type<{ disconnected: PublicKnownRuntimeEnvironment }>()),
  getStatus: withAccess(SHELL_ENVIRONMENT_READ_ACCESS)
    .input(type<{ selector: string; timeoutMs?: number }>())
    .output(type<RuntimeRpcResponse<RuntimeStatus>>()),
  callOrpcProcedure: withAccess(SHELL_ENVIRONMENT_WRITE_ACCESS)
    .input(
      type<{
        selector: string
        path: readonly string[]
        input: unknown
        timeoutMs?: number
      }>()
    )
    .output(type<unknown>()),
  subscribeOrpcProcedure: withAccess(SHELL_ENVIRONMENT_WRITE_ACCESS)
    .input(
      type<{
        selector: string
        path: readonly string[]
        input: unknown
      }>()
    )
    .output(eventIterator(type<ShellRuntimeEnvironmentOrpcStreamEvent>()))
} satisfies ContractRouter<RuntimeProcedureMeta>
