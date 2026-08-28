import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type RuntimeProjectSearchMatch = {
  line: number
  path: string
  preview: string
  projectId: string
  worktreeId: string
}

const SearchInputSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().trim().min(2).max(200),
  worktreeId: z.string().min(1).optional()
})

export const searchContract = {
  files: withAccess({ scope: 'project', tier: 'read' })
    .input(SearchInputSchema)
    .output(type<{ matches: RuntimeProjectSearchMatch[]; truncated: boolean }>())
} satisfies ContractRouter<RuntimeProcedureMeta>
