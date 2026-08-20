// Resolve the reset for a verified Codex usage-limit event. Only structured
// exhausted windows are eligible; a future reset on a partially used window
// is not evidence that the account is blocked.

import type {
  CodexUsageLimitProbe,
  RateLimitHit,
  RateLimitResumeWindow
} from '~shared/rate-limit-resume/types'
import type { ProviderRateLimits, RateLimitState } from '~shared/rate-limit-types'

export type RateLimitResumeUsageState = Pick<
  RateLimitState,
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'opencodeGo'
  | 'kimi'
  | 'antigravity'
  | 'minimax'
  | 'grok'
>

function windowFromUsage(
  usage: ProviderRateLimits | null,
  now: number
): { window: RateLimitResumeWindow; resetsAt: number; resetDescription: string | null } | null {
  if (!usage) {
    return null
  }
  const weekly = usage.weekly
  if (weekly && weekly.usedPercent >= 100 && weekly.resetsAt != null && weekly.resetsAt > now) {
    return {
      window: 'weekly',
      resetsAt: weekly.resetsAt,
      resetDescription: weekly.resetDescription
    }
  }
  const session = usage.session
  if (session && session.usedPercent >= 100 && session.resetsAt != null && session.resetsAt > now) {
    return {
      window: 'session',
      resetsAt: session.resetsAt,
      resetDescription: session.resetDescription
    }
  }
  return null
}

/**
 * Enrich a verified Codex event into a full hit. `resetsAt` stays null unless
 * the rollout or current account snapshot contains an exhausted window.
 */
export function resolveCodexRateLimitHit(
  probe: CodexUsageLimitProbe,
  event: { detectedAt: number; resetsAt: number | null; window: RateLimitResumeWindow | null },
  rateLimits: RateLimitResumeUsageState,
  now: number
): RateLimitHit {
  const eventResetIsUsable = event.resetsAt !== null && event.resetsAt > now
  const fromUsage = windowFromUsage(rateLimits.codex, now)

  return {
    agent: 'codex',
    ptyId: probe.ptyId,
    tabId: probe.tabId,
    paneKey: probe.paneKey,
    worktreeId: probe.worktreeId,
    prompt: probe.prompt,
    provider: 'codex',
    detectedAt: event.detectedAt,
    resetsAt: eventResetIsUsable ? event.resetsAt : (fromUsage?.resetsAt ?? null),
    resetDescription: eventResetIsUsable ? null : (fromUsage?.resetDescription ?? null),
    window: eventResetIsUsable ? event.window : (fromUsage?.window ?? null)
  }
}
