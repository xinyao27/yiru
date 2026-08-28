import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type RuntimeUpdateStatus = {
  checkedAt: number
  currentVersion: string
  installCommand: string
  latestVersion: string | null
  releaseUrl: string | null
  updateAvailable: boolean
}

export const updateContract = {
  check: withAccess({ scope: 'host', tier: 'read' })
    .input(z.object({ force: z.boolean().optional() }))
    .output(type<RuntimeUpdateStatus>())
} satisfies ContractRouter<RuntimeProcedureMeta>
