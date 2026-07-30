import type {
  ProviderRateLimits,
  RateLimitBucket,
  RateLimitWindow
} from '../../../shared/rate-limit-types'

const MONTHLY_WINDOW_MINUTES = 30 * 24 * 60
const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const OSC_SEQUENCE_RE = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, 'g')
const CSI_SEQUENCE_RE = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, 'g')
const USAGE_HEADER_RE = /^\s*Usage\s*[•·-]\s*(.*?)\s{2,}Resets\s+(.+?)\s*$/im
const FALLBACK_USAGE_HEADER_RE = /^\s*Usage\s*[•·-]\s*(.+?)\s*$/im

export function stripCursorTerminalOutput(output: string): string {
  return output.replace(OSC_SEQUENCE_RE, '').replace(CSI_SEQUENCE_RE, '')
}

function extractUsedPercent(output: string, label: 'Included' | 'Auto' | 'API'): number | null {
  const match = new RegExp(`^\\s*${label}\\s+(\\d{1,3}(?:\\.\\d+)?)%\\s+used\\b`, 'im').exec(output)
  if (!match) {
    return null
  }
  return Math.min(100, Math.max(0, Number.parseFloat(match[1])))
}

function getMonthIndex(month: string): number | null {
  switch (month.toLowerCase()) {
    case 'jan':
      return 0
    case 'feb':
      return 1
    case 'mar':
      return 2
    case 'apr':
      return 3
    case 'may':
      return 4
    case 'jun':
      return 5
    case 'jul':
      return 6
    case 'aug':
      return 7
    case 'sep':
      return 8
    case 'oct':
      return 9
    case 'nov':
      return 10
    case 'dec':
      return 11
    default:
      return null
  }
}

function parseResetTimestamp(description: string | null, now = new Date()): number | null {
  if (!description) {
    return null
  }
  const match =
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/i.exec(
      description
    )
  if (!match) {
    return null
  }
  const month = getMonthIndex(match[1])
  if (month === null) {
    return null
  }
  const explicitYear = match[3] ? Number.parseInt(match[3], 10) : null
  let year = explicitYear ?? now.getUTCFullYear()
  let timestamp = Date.UTC(year, month, Number.parseInt(match[2], 10))
  if (explicitYear === null && timestamp < now.getTime() - 24 * 60 * 60 * 1000) {
    year += 1
    timestamp = Date.UTC(year, month, Number.parseInt(match[2], 10))
  }
  return timestamp
}

function createCursorWindow(
  usedPercent: number,
  resetsAt: number | null,
  resetDescription: string | null
): RateLimitWindow {
  return {
    usedPercent,
    windowMinutes: MONTHLY_WINDOW_MINUTES,
    resetsAt,
    resetDescription
  }
}

export function parseCursorUsage(output: string): ProviderRateLimits | null {
  const header = USAGE_HEADER_RE.exec(output)
  const planType = (header?.[1] ?? FALLBACK_USAGE_HEADER_RE.exec(output)?.[1])?.trim() || null
  const resetDescription = header?.[2]?.trim() || null
  const resetsAt = parseResetTimestamp(resetDescription)
  const includedPercent = extractUsedPercent(output, 'Included')
  const autoPercent = extractUsedPercent(output, 'Auto')
  const apiPercent = extractUsedPercent(output, 'API')
  if (includedPercent === null && autoPercent === null && apiPercent === null) {
    return null
  }

  const bucketValues: { name: string; percent: number | null }[] = [
    { name: 'Included', percent: includedPercent },
    { name: 'Auto', percent: autoPercent },
    { name: 'API', percent: apiPercent }
  ]
  const buckets: RateLimitBucket[] = []
  for (const { name, percent } of bucketValues) {
    if (percent !== null) {
      buckets.push({ name, ...createCursorWindow(percent, resetsAt, resetDescription) })
    }
  }

  return {
    provider: 'cursor',
    session: null,
    weekly: null,
    monthly:
      includedPercent === null
        ? null
        : createCursorWindow(includedPercent, resetsAt, resetDescription),
    buckets,
    planType,
    updatedAt: Date.now(),
    error: null,
    status: 'ok',
    usageMetadata: { source: 'cli' }
  }
}

export function describeCursorUsageFailure(output: string): string {
  if (/Failed to load usage data/i.test(output)) {
    return 'Cursor usage is unavailable right now.'
  }
  if (/unknown command|command not found|not recognized/i.test(output)) {
    return 'This Cursor Agent version does not expose usage details. Update cursor-agent and retry.'
  }
  return 'Cursor usage panel did not return usage details.'
}
