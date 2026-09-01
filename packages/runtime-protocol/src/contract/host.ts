import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { parseExecutionHostId, type ExecutionHostId } from '../model/workspace.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type RuntimeHost = {
  id: ExecutionHostId
  kind: 'local' | 'ssh' | 'wsl'
  label: string
  platform: 'darwin' | 'linux' | 'win32' | 'unknown'
  target: string | null
}

export type RuntimeHostCapability = {
  available: boolean
  detail: string | null
  name: 'fs' | 'git' | 'pty'
}

export const ExecutionHostIdSchema = z.string().refine((value): value is ExecutionHostId => {
  const parsed = parseExecutionHostId(value)
  return parsed !== null && parsed.kind !== 'runtime'
})

const HostAddInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  kind: z.enum(['ssh', 'wsl']),
  label: z.string().trim().min(1).max(128),
  target: z.string().trim().min(1).max(512)
})

const HostSelectorInputSchema = z.object({ hostId: ExecutionHostIdSchema })

const HostRemoveInputSchema = HostSelectorInputSchema.extend({
  expectedRevision: z.number().int().nonnegative()
})

export const runtimeHostContract = {
  add: withAccess({ scope: 'host', tier: 'host' })
    .input(HostAddInputSchema)
    .output(type<{ host: RuntimeHost; revision: number }>()),
  list: withAccess({ scope: 'host', tier: 'read' }).output(
    type<{ hosts: RuntimeHost[]; revision: number }>()
  ),
  probe: withAccess({ scope: 'host', tier: 'read' })
    .input(HostSelectorInputSchema)
    .output(type<{ capabilities: RuntimeHostCapability[]; host: RuntimeHost }>()),
  remove: withAccess({ scope: 'host', tier: 'host' })
    .input(HostRemoveInputSchema)
    .output(type<{ removed: true; revision: number }>())
} satisfies ContractRouter<RuntimeProcedureMeta>
