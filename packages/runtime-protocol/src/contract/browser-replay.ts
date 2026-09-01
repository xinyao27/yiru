import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type BrowserReplayEvent = {
  at: number
  key?: string
  kind: 'click' | 'input' | 'keydown'
  selector: string
  value?: string
}

export type BrowserReplay = {
  createdAt: number
  endedAt: number
  events: BrowserReplayEvent[]
  id: string
  pageTitle: string
  pageUrl: string
  projectId: string
  startedAt: number
  videoArtifactId: string | null
}

const BrowserReplayEventSchema = z.object({
  at: z.number().finite().nonnegative(),
  key: z.string().max(64).optional(),
  kind: z.enum(['click', 'input', 'keydown']),
  selector: z.string().min(1).max(2_048),
  value: z
    .string()
    .max(64 * 1_024)
    .optional()
})

const BrowserReplaySaveInputSchema = z.object({
  endedAt: z.number().finite().nonnegative(),
  events: z.array(BrowserReplayEventSchema).max(20_000),
  pageTitle: z.string().max(1_024),
  pageUrl: z.string().url().max(8_192),
  projectId: z.string().min(1),
  startedAt: z.number().finite().nonnegative(),
  videoArtifactId: z.string().uuid().nullable().optional()
})

const BrowserReplayListInputSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  projectId: z.string().min(1)
})

const BrowserReplayResultInputSchema = z.object({
  detail: z.string().max(4_096),
  pageUrl: z.string().url().max(8_192),
  projectId: z.string().min(1),
  recordingId: z.string().uuid(),
  success: z.boolean(),
  worktreeId: z.string().min(1)
})

export const browserReplayContract = {
  list: withAccess({ scope: 'project', tier: 'read' })
    .input(BrowserReplayListInputSchema)
    .output(type<{ recordings: BrowserReplay[] }>()),
  recordResult: withAccess({ scope: 'project', tier: 'control' })
    .input(BrowserReplayResultInputSchema)
    .output(type<{ eventId: number }>()),
  save: withAccess({ scope: 'project', tier: 'control' })
    .input(BrowserReplaySaveInputSchema)
    .output(type<{ recording: BrowserReplay }>())
} satisfies ContractRouter<RuntimeProcedureMeta>
