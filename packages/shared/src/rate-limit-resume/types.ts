// Cross-process types for Codex's structured usage-limit event and the
// optional prompt resume that can follow it.

import type { AgentType } from '@yiru/workbench-model/agent'

/** Providers Yiru already tracks usage for — the reset-time fallback source.
 *  Keys match the RateLimitState fields in shared/rate-limit-types.ts. */
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

/** Identifies the active Codex turn whose rollout the runtime should inspect. */
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

/** A verified structured limit hit plus whatever reset time the host recovered. */
export type RateLimitHit = {
  agent: AgentType
  ptyId: string
  tabId: string
  /** `${tabId}:${leafId}` — lets the notification reveal the blocked pane. */
  paneKey: string
  worktreeId: string
  /** The user message that was cut short, replayed verbatim on resume. */
  prompt: string
  provider: RateLimitResumeProvider | null
  detectedAt: number
  /** Epoch ms the quota window rolls over, or null when unrecoverable — the
   *  card then offers retry only, with no schedule action. */
  resetsAt: number | null
  resetDescription: string | null
  window: RateLimitResumeWindow | null
}

export type RateLimitResumeStatus = 'scheduled' | 'fired' | 'cancelled' | 'stale' | 'failed'

/** Statuses a schedule can never leave; only these are safe to prune. */
export function isFinalRateLimitResumeStatus(status: RateLimitResumeStatus): boolean {
  return status === 'fired' || status === 'cancelled' || status === 'stale' || status === 'failed'
}

export type RateLimitResumeSchedule = RateLimitHit & {
  id: string
  /** Epoch ms the resume fires — reset time plus a settle grace. */
  resumeAt: number
  status: RateLimitResumeStatus
  createdAt: number
  firedAt: number | null
  failureReason: string | null
}

/** Why: firing exactly at the boundary races the provider's own window roll and
 *  earns a second limit immediately. Wait past it before replaying. */
export const RATE_LIMIT_RESUME_GRACE_MS = 30_000

/** Terminal schedules older than this are dropped on load. */
export const RATE_LIMIT_RESUME_HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function buildRateLimitResumeAt(resetsAt: number, now: number): number {
  return Math.max(now, resetsAt) + RATE_LIMIT_RESUME_GRACE_MS
}
