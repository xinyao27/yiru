import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type VisualRegressionCapture = {
  createdAt: number
  diffRatio: number | null
  height: number
  id: string
  imageArtifactId: string
  pageUrl: string
  projectId: string
  width: number
  worktreeId: string
}

const VisualRegressionIdentitySchema = z.object({
  pageUrl: z.string().url().max(8_192),
  projectId: z.string().min(1),
  worktreeId: z.string().min(1)
})

const VisualRegressionSaveInputSchema = VisualRegressionIdentitySchema.extend({
  diffRatio: z.number().finite().min(0).max(1).nullable(),
  height: z.number().int().positive().max(32_768),
  imageArtifactId: z.string().uuid(),
  width: z.number().int().positive().max(32_768)
})

export const visualRegressionContract = {
  latest: withAccess({ scope: 'project', tier: 'read' })
    .input(VisualRegressionIdentitySchema)
    .output(type<{ capture: VisualRegressionCapture | null }>()),
  save: withAccess({ scope: 'project', tier: 'control' })
    .input(VisualRegressionSaveInputSchema)
    .output(type<{ capture: VisualRegressionCapture }>())
} satisfies ContractRouter<RuntimeProcedureMeta>
