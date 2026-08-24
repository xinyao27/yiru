import type { ProviderRateLimits, RateLimitWindow } from '~shared/rate-limit-types'

import { extractClaudePtyResetMetadata } from './claude-pty-reset-parser'

const SESSION_RE = /current\s*session/i
const WEEKLY_RE = /(?:current\s*week|weekly\s*(?:limits?|usage|rate\s*limits?)|7\s*[- ]?\s*day)/i
const FABLE_WORD_RE = /\bfable\b/i
const FABLE_LABEL_RE = /^\s*fable\s*$/i
const FABLE_WEEKLY_LABEL_RE = new RegExp(
  `${WEEKLY_RE.source}\\s*(?:\\([^)]*\\bfable\\b[^)]*\\)|[-:]?\\s*\\bfable\\b)`,
  'i'
)
const PERCENT_RE = /(\d{1,3})(?:\.\d+)?\s*%\s*(used|consumed|left|remaining|available)/i
const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const OSC_SEQUENCE_RE = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, 'g')
const CSI_SEQUENCE_RE = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, 'g')

const STOP_SUBSTRINGS = [
  'Current week (all models)',
  'Current week (Opus)',
  'Current week (Sonnet only)',
  'Current week (Sonnet)',
  'Weekly limits',
  'Weekly limit',
  'Weekly usage',
  '7-day',
  'Current session',
  'Failed to load usage data',
  'failed to load usage data'
]

const COMMAND_PALETTE_RE = /show plan|usage limits/i
const TRUST_PROMPT_RE = /do you trust|trust the files|safety check/i
const RATE_LIMITED_RE = /rate limited\.?\s+please try again later/i
const LOAD_FAILED_RE = /failed to load usage data/i
const CLAUDE_21_USAGE_TABS_RE = /settings?\s+status?\s+config\s+usage\s+stats/i
const CLAUDE_21_SESSION_STATS_RE = /total\s*cost|total\s*duration|usage:\s*\d+\s*input/i

export function stripClaudeTerminalControlSequences(output: string): string {
  return output.replace(OSC_SEQUENCE_RE, '').replace(CSI_SEQUENCE_RE, '')
}

function matchesWeeklyLabel(line: string): boolean {
  return WEEKLY_RE.test(line) && !FABLE_WORD_RE.test(line)
}

function matchesFableBoundary(line: string): boolean {
  return FABLE_LABEL_RE.test(line) || (FABLE_WORD_RE.test(line) && WEEKLY_RE.test(line))
}

function matchesFableUsageLabel(line: string): boolean {
  return FABLE_LABEL_RE.test(line) || FABLE_WEEKLY_LABEL_RE.test(line)
}

function isSectionLabel(line: string): boolean {
  return SESSION_RE.test(line) || matchesWeeklyLabel(line) || matchesFableBoundary(line)
}

function extractPercentAfterLabel(
  lines: string[],
  matchesLabel: (line: string) => boolean
): number | null {
  for (let index = 0; index < lines.length; index++) {
    if (!matchesLabel(lines[index])) {
      continue
    }
    for (let next = index; next < Math.min(index + 12, lines.length); next++) {
      if (next > index && isSectionLabel(lines[next])) {
        break
      }
      const match = PERCENT_RE.exec(lines[next])
      if (match) {
        const percent = Number.parseFloat(match[1])
        const qualifier = match[2].toLowerCase()
        return qualifier === 'used' || qualifier === 'consumed' ? percent : 100 - percent
      }
    }
  }
  return null
}

function buildWindow(
  usedPercent: number | null,
  windowMinutes: number,
  reset: ReturnType<typeof extractClaudePtyResetMetadata>
): RateLimitWindow | null {
  return usedPercent === null
    ? null
    : {
        usedPercent: Math.min(100, Math.max(0, usedPercent)),
        windowMinutes,
        resetsAt: reset.resetsAt,
        resetDescription: reset.resetDescription
      }
}

export function parseClaudePtyUsage(output: string): {
  session: RateLimitWindow | null
  weekly: RateLimitWindow | null
  fableWeekly: RateLimitWindow | null
} {
  const lines = output.split(/\r\n|\n|\r/)
  const session = buildWindow(
    extractPercentAfterLabel(lines, (line) => SESSION_RE.test(line)),
    300,
    extractClaudePtyResetMetadata(lines, (line) => SESSION_RE.test(line), isSectionLabel)
  )
  const weekly = buildWindow(
    extractPercentAfterLabel(lines, matchesWeeklyLabel),
    10_080,
    extractClaudePtyResetMetadata(lines, matchesWeeklyLabel, isSectionLabel)
  )
  const fableWeekly = buildWindow(
    extractPercentAfterLabel(lines, matchesFableUsageLabel),
    10_080,
    extractClaudePtyResetMetadata(lines, matchesFableUsageLabel, isSectionLabel)
  )
  return { session, weekly, fableWeekly }
}

export function isClaudeTrustPrompt(output: string): boolean {
  return TRUST_PROMPT_RE.test(output)
}

export function isClaudeCommandPalette(output: string): boolean {
  return COMMAND_PALETTE_RE.test(output)
}

export function isClaude21Usage(output: string): boolean {
  return CLAUDE_21_USAGE_TABS_RE.test(output) || CLAUDE_21_SESSION_STATS_RE.test(output)
}

export function hasClaudeUsageStop(output: string): boolean {
  return STOP_SUBSTRINGS.some((substring) => output.includes(substring))
}

export function describeClaudeUsageFailure(output: string): string {
  if (RATE_LIMITED_RE.test(output)) {
    return 'Claude usage is rate limited right now.'
  }
  if (LOAD_FAILED_RE.test(output)) {
    return 'Claude usage is unavailable right now.'
  }
  if (isClaude21Usage(output)) {
    return 'Claude plan usage is unavailable for this Claude CLI session.'
  }
  return 'Claude usage is unavailable right now.'
}

export function abortedClaudeUsageResult(): ProviderRateLimits {
  return {
    provider: 'claude',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error: 'Rate-limit fetch aborted',
    status: 'error'
  }
}
