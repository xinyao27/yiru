import { type, type ContractRouter } from '@orpc/contract'
import type { AgentType } from '@yiru/workbench-model/agent'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

// Cross-process contract for rate-limit resume: a client reports a provider
// limit banner it observed in a pane's output; the host resolves the reset
// time, persists a schedule, and (desktop-only, see api-types.ts) dispatches
// the resume back to the renderer that owns the pane once the window rolls
// over. Mirrors packages/shared/src/rate-limit-resume/types.ts.

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

export type RateLimitBannerReport = {
  agent: AgentType
  ptyId: string
  tabId: string
  paneKey: string
  worktreeId: string
  bannerLines: string[]
  prompt: string
}

export type RateLimitHit = RateLimitBannerReport & {
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

export const RateLimitBannerReportSchema = z.object({
  agent: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing agent'))
    // Why: the legacy wire accepts every non-empty provider id; narrowing it
    // here would break peers, mirroring native-chat.ts's AgentType handling.
    .transform((value) => value as AgentType),
  ptyId: z.string().min(1, 'Missing ptyId'),
  tabId: z.string().min(1, 'Missing tabId'),
  paneKey: z.string().min(1, 'Missing paneKey'),
  worktreeId: z.string().min(1, 'Missing worktreeId'),
  bannerLines: z.array(z.string()),
  prompt: z.string()
})

export const RateLimitHitInputSchema = RateLimitBannerReportSchema.extend({
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
  // Why: pure computation against the host's current RateLimitService state
  // (no persistence) — read tier, unlike schedule/cancel/runNow below.
  report: withAccess(RATE_LIMIT_RESUME_READ_ACCESS)
    .input(RateLimitBannerReportSchema)
    .output(type<RateLimitHit>()),
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
