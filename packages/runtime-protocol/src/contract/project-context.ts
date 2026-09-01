import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type ProjectContextResolveInput = {
  canonicalKey: string
}

export type ProjectContextMatch = {
  displayName: string
  path: string
  projectId: string
}

export type ProjectContextResolveResult = {
  matches: ProjectContextMatch[]
}

const ProjectContextResolveInputSchema = z.object({
  canonicalKey: z.string().trim().min(1)
})

export const projectContextContract = {
  resolve: withAccess({ scope: 'project', tier: 'read' })
    .input(ProjectContextResolveInputSchema)
    .output(type<ProjectContextResolveResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
