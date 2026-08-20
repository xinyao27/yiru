import { type, type ContractRouter } from '@orpc/contract'
import type { AgentType } from '@yiru/workbench-model/agent'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

// Cross-process contract for rate-limit resume. Codex classification comes
// from its structured rollout event; the host never classifies terminal text.

export type RateLimitResumeProvider =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'opencodeGo'
  | 'kimi'
  | 'antigravity'
  | 'minimax'
  | 'grok'

export type RateLimitResumeWindow = 'session' | 'weekly'

export type CodexUsageLimitProbe = {
  ptyId: string
  tabId: string
  paneKey: string
  worktreeId: string
  sessionId: string
  transcriptPath?: string
  turnId: string
  prompt: string
}

export type RateLimitHit = {
  agent: AgentType
  ptyId: string
  tabId: string
  paneKey: string
  worktreeId: string
  prompt: string
  provider: RateLimitResumeProvider | null
  detectedAt: number
  resetsAt: number | null
  resetDescription: string | null
  window: RateLimitResumeWindow | null
}

export type RateLimitResumeStatus = 'scheduled' | 'fired' | 'cancelled' | 'stale' | 'failed'

export type RateLimitResumeSchedule = RateLimitHit & {
  id: string
  resumeAt: number
  status: RateLimitResumeStatus
  createdAt: number
  firedAt: number | null
  failureReason: string | null
}

export const CodexUsageLimitProbeSchema = z.object({
  ptyId: z.string().min(1, 'Missing ptyId'),
  tabId: z.string().min(1, 'Missing tabId'),
  paneKey: z.string().min(1, 'Missing paneKey'),
  worktreeId: z.string().min(1, 'Missing worktreeId'),
  sessionId: z.string().min(1, 'Missing sessionId'),
  transcriptPath: z.string().min(1, 'Missing transcriptPath').optional(),
  turnId: z.string().min(1, 'Missing turnId'),
  prompt: z.string()
})

export const RateLimitHitInputSchema = z.object({
  agent: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing agent'))
    // Why: persisted schedules predate the Codex-only detector and can still
    // carry another non-empty provider id while they age out.
    .transform((value) => value as AgentType),
  ptyId: z.string().min(1, 'Missing ptyId'),
  tabId: z.string().min(1, 'Missing tabId'),
  paneKey: z.string().min(1, 'Missing paneKey'),
  worktreeId: z.string().min(1, 'Missing worktreeId'),
  prompt: z.string(),
  provider: z
    .enum([
      'claude',
      'codex',
      'cursor',
      'gemini',
      'opencodeGo',
      'kimi',
      'antigravity',
      'minimax',
      'grok'
    ])
    .nullable(),
  detectedAt: z.number(),
  resetsAt: z.number().nullable(),
  resetDescription: z.string().nullable(),
  window: z.enum(['session', 'weekly']).nullable()
})

export const RateLimitResumeIdInputSchema = z.object({
  id: z.string().min(1, 'Missing id')
})

export const RateLimitResumeFailureInputSchema = z.object({
  id: z.string().min(1, 'Missing id'),
  reason: z.string().min(1, 'Missing reason')
})

export type RateLimitHitInput = z.output<typeof RateLimitHitInputSchema>
export type RateLimitResumeIdInput = z.output<typeof RateLimitResumeIdInputSchema>
export type RateLimitResumeFailureInput = z.output<typeof RateLimitResumeFailureInputSchema>

const RATE_LIMIT_RESUME_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const RATE_LIMIT_RESUME_HOST_ACCESS = { scope: 'host', tier: 'host' } as const

export const rateLimitResumeContract = {
  // Why: this bounded, contained transcript read does not persist anything;
  // schedule/cancel/runNow remain the host-tier mutations below.
  inspectCodex: withAccess(RATE_LIMIT_RESUME_READ_ACCESS)
    .input(CodexUsageLimitProbeSchema)
    .output(type<RateLimitHit | null>()),
  list: withAccess(RATE_LIMIT_RESUME_READ_ACCESS)
    .input(z.void())
    .output(type<RateLimitResumeSchedule[]>()),
  schedule: withAccess(RATE_LIMIT_RESUME_HOST_ACCESS)
    .input(RateLimitHitInputSchema)
    .output(type<RateLimitResumeSchedule>()),
  cancel: withAccess(RATE_LIMIT_RESUME_HOST_ACCESS)
    .input(RateLimitResumeIdInputSchema)
    .output(type<RateLimitResumeSchedule>()),
  runNow: withAccess(RATE_LIMIT_RESUME_HOST_ACCESS)
    .input(RateLimitResumeIdInputSchema)
    .output(type<RateLimitResumeSchedule>()),
  markFired: withAccess(RATE_LIMIT_RESUME_HOST_ACCESS)
    .input(RateLimitResumeIdInputSchema)
    .output(type<RateLimitResumeSchedule>()),
  markFailed: withAccess(RATE_LIMIT_RESUME_HOST_ACCESS)
    .input(RateLimitResumeFailureInputSchema)
    .output(type<RateLimitResumeSchedule>()),
  markStale: withAccess(RATE_LIMIT_RESUME_HOST_ACCESS)
    .input(RateLimitResumeIdInputSchema)
    .output(type<RateLimitResumeSchedule>()),
  rendererReady: withAccess(RATE_LIMIT_RESUME_HOST_ACCESS).input(z.void()).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>
