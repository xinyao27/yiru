import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import type { RuntimeWorkspaceEvent } from './workspace-events.js'

const BrowserOpenCommandInputSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  url: z.string().url().max(8_192),
  worktreeId: z.string().trim().min(1).optional()
})

export const browserCommandContract = {
  open: withAccess({ scope: 'host', tier: 'control' })
    .input(BrowserOpenCommandInputSchema)
    .output(type<{ event: RuntimeWorkspaceEvent }>())
} satisfies ContractRouter<RuntimeProcedureMeta>
