// Turn a reported banner into a concrete reset time. Three sources, in
// descending confidence: an epoch the banner carried, the wording it used, and
// the provider usage Yiru already polls.

import type { AgentType } from '@yiru/workbench-model/agent'
import { extractInlineResetEpochMs } from '~shared/rate-limit-resume/banner-detection'
import type {
  RateLimitBannerReport,
  RateLimitHit,
  RateLimitResumeProvider,
  RateLimitResumeWindow
} from '~shared/rate-limit-resume/types'
import type { ProviderRateLimits, RateLimitState } from '~shared/rate-limit-types'

import { extractClaudePtyResetMetadata } from '../rate-limits/claude-pty-reset-parser'
import { parseTwentyFourHourReset } from './twenty-four-hour-reset'

// Why: the agent a pane runs is not always the key usage is polled under —
// OpenClaude writes Claude's format and bills Claude's quota, and OpenCode's
// hosted tier is tracked as `opencodeGo`.
const PROVIDER_BY_AGENT: Record<string, RateLimitResumeProvider> = {
  claude: 'claude',
  openclaude: 'claude',
  codex: 'codex',
  cursor: 'cursor',
  gemini: 'gemini',
  antigravity: 'antigravity',
  opencode: 'opencodeGo',
  kimi: 'kimi',
  minimax: 'minimax',
  grok: 'grok'
}

export function resolveRateLimitProvider(agent: AgentType): RateLimitResumeProvider | null {
  return PROVIDER_BY_AGENT[agent] ?? null
}

type ResolvedReset = {
  resetsAt: number | null
  resetDescription: string | null
  window: RateLimitResumeWindow | null
}

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

// Why: the usage parser anchors its time-zone match to end-of-string, so a
// banner written as a sentence ("… reset at 4am (America/Los_Angeles).") loses
// the zone and silently resolves 4am in local time instead. Drop the sentence
// period before handing lines over.
function trimSentencePeriod(line: string): string {
  return line.replace(/\s*\.\s*$/, '')
}

/** Parse the banner's own reset wording ("resets at 4am (America/Los_Angeles)"). */
function resetFromBannerText(bannerLines: string[]): ResolvedReset {
  const inlineEpochMs = extractInlineResetEpochMs(bannerLines)
  if (inlineEpochMs !== null) {
    return { resetsAt: inlineEpochMs, resetDescription: null, window: null }
  }
  // Reuse Claude's PTY reset parser: it already handles relative durations,
  // weekday/month-day forms, and IANA time zones. Matching the first line makes
  // it scan the whole banner rather than a labelled usage section.
  const lines = bannerLines.map(trimSentencePeriod)
  const metadata = extractClaudePtyResetMetadata(
    lines,
    (line) => line === lines[0],
    () => false
  )
  return {
    // That parser only understands 12-hour clock times; providers that print a
    // 24-hour reset fall through to the local fallback below.
    resetsAt: metadata.resetsAt ?? parseTwentyFourHourReset(lines),
    resetDescription: metadata.resetDescription,
    window: null
  }
}

function windowFromUsage(
  usage: ProviderRateLimits | null,
  now: number
): { window: RateLimitResumeWindow; resetsAt: number; resetDescription: string | null } | null {
  if (!usage) {
    return null
  }
  const session = usage.session
  if (session?.resetsAt != null && session.resetsAt > now) {
    return {
      window: 'session',
      resetsAt: session.resetsAt,
      resetDescription: session.resetDescription
    }
  }
  // Why: a spent weekly window keeps the account blocked even after the 5-hour
  // session window has already rolled, so it is the correct target then.
  const weekly = usage.weekly
  if (weekly?.resetsAt != null && weekly.resetsAt > now) {
    return {
      window: 'weekly',
      resetsAt: weekly.resetsAt,
      resetDescription: weekly.resetDescription
    }
  }
  return null
}

/**
 * Enrich a renderer banner report into a full hit. `resetsAt` is null when no
 * source could supply one — the card then offers retry without a schedule.
 */
export function resolveRateLimitHit(
  report: RateLimitBannerReport,
  rateLimits: RateLimitResumeUsageState,
  now: number
): RateLimitHit {
  const provider = resolveRateLimitProvider(report.agent)
  const fromBanner = resetFromBannerText(report.bannerLines)
  const fromUsage = provider ? windowFromUsage(rateLimits[provider], now) : null

  const bannerResetIsUsable = fromBanner.resetsAt != null && fromBanner.resetsAt > now

  return {
    ...report,
    provider,
    detectedAt: now,
    resetsAt: bannerResetIsUsable ? fromBanner.resetsAt : (fromUsage?.resetsAt ?? null),
    resetDescription: fromBanner.resetDescription ?? fromUsage?.resetDescription ?? null,
    window: bannerResetIsUsable ? null : (fromUsage?.window ?? null)
  }
}
