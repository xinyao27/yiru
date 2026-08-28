import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type RuntimeArtifact = {
  byteLength: number
  createdAt: number
  fileName: string
  id: string
  mimeType: string
  projectId: string
  status: 'ready' | 'writing'
}

const ArtifactBeginInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  projectId: z.string().trim().min(1)
})

const ArtifactAppendInputSchema = z.object({
  dataBase64: z.string().min(1).max(700_000),
  id: z.string().uuid(),
  offset: z.number().int().nonnegative()
})

const ArtifactIdInputSchema = z.object({ id: z.string().uuid() })

const ArtifactListInputSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  projectId: z.string().trim().min(1)
})

const ArtifactReadInputSchema = z.object({
  id: z.string().uuid(),
  limit: z
    .number()
    .int()
    .positive()
    .max(384 * 1_024),
  offset: z.number().int().nonnegative()
})

export const artifactContract = {
  abort: withAccess({ scope: 'project', tier: 'control' })
    .input(ArtifactIdInputSchema)
    .output(type<{ removed: boolean }>()),
  append: withAccess({ scope: 'project', tier: 'control' })
    .input(ArtifactAppendInputSchema)
    .output(type<{ artifact: RuntimeArtifact }>()),
  begin: withAccess({ scope: 'project', tier: 'control' })
    .input(ArtifactBeginInputSchema)
    .output(type<{ artifact: RuntimeArtifact }>()),
  complete: withAccess({ scope: 'project', tier: 'control' })
    .input(ArtifactIdInputSchema)
    .output(type<{ artifact: RuntimeArtifact }>()),
  downloadTicket: withAccess({ scope: 'project', tier: 'read' })
    .input(ArtifactIdInputSchema)
    .output(type<{ expiresAt: number; ticket: string }>()),
  list: withAccess({ scope: 'project', tier: 'read' })
    .input(ArtifactListInputSchema)
    .output(type<{ artifacts: RuntimeArtifact[] }>()),
  read: withAccess({ scope: 'project', tier: 'read' }).input(ArtifactReadInputSchema).output(
    type<{
      dataBase64: string
      eof: boolean
      mimeType: string
      nextOffset: number
    }>()
  )
} satisfies ContractRouter<RuntimeProcedureMeta>
