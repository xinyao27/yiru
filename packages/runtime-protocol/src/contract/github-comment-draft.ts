import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

const GitHubCommentDraftInputSchema = z.object({
  kind: z.enum(['issue', 'pull-request']),
  number: z.number().int().positive(),
  pageContext: z.string().max(64 * 1_024),
  pageUrl: z.string().url().max(8_192),
  projectId: z.string().min(1)
})

export type GitHubCommentDraftResult = {
  draft: string
  generatedAt: number
  provider: 'codex'
}

export const githubCommentDraftContract = {
  create: withAccess({ scope: 'project', tier: 'control' })
    .input(GitHubCommentDraftInputSchema)
    .output(type<GitHubCommentDraftResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
