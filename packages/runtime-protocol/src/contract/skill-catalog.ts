import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type RuntimeSkill = {
  description: string | null
  id: string
  name: string
  path: string
  projectId: string | null
  sourceLabel: string
}

export const skillCatalogContract = {
  list: withAccess({ scope: 'host', tier: 'read' })
    .input(z.object({ projectId: z.string().min(1).optional() }))
    .output(type<{ skills: RuntimeSkill[]; truncated: boolean }>())
} satisfies ContractRouter<RuntimeProcedureMeta>
