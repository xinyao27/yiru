export type ProviderUsageScope = 'yiru' | 'all'
export type ProviderUsageRange = '7d' | '30d' | '90d' | 'all'
export type ProviderUsageBreakdownKind = 'model' | 'project'

export type ProviderUsageSnapshotInput = {
  scope: ProviderUsageScope
  range: ProviderUsageRange
  limit?: number
}

export type ClaudeUsageScanState = {
  enabled: boolean
  isScanning: boolean
  lastScanStartedAt: number | null
  lastScanCompletedAt: number | null
  lastScanError: string | null
  hasAnyClaudeData: boolean
}

export type ClaudeUsageSummary = {
  scope: ProviderUsageScope
  range: ProviderUsageRange
  sessions: number
  turns: number
  zeroCacheReadTurns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cacheReuseRate: number | null
  estimatedCostUsd: number | null
  topModel: string | null
  topProject: string | null
  hasAnyClaudeData: boolean
}

export type ClaudeUsageDailyPoint = {
  day: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCostUsd: number | null
  unpricedTokens: number
}

export type ClaudeUsageBreakdownRow = {
  key: string
  label: string
  sessions: number
  turns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCostUsd: number | null
}

export type ClaudeUsageSessionRow = {
  sessionId: string
  lastActiveAt: string
  durationMinutes: number
  projectLabel: string
  branch: string | null
  model: string | null
  turns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export type ClaudeUsageSnapshot = {
  scanState: ClaudeUsageScanState
  summary: ClaudeUsageSummary
  daily: ClaudeUsageDailyPoint[]
  modelBreakdown: ClaudeUsageBreakdownRow[]
  projectBreakdown: ClaudeUsageBreakdownRow[]
  recentSessions: ClaudeUsageSessionRow[]
}

export type CodexUsageScanState = {
  enabled: boolean
  isScanning: boolean
  lastScanStartedAt: number | null
  lastScanCompletedAt: number | null
  lastScanError: string | null
  hasAnyCodexData: boolean
}

export type CodexUsageSummary = {
  scope: ProviderUsageScope
  range: ProviderUsageRange
  sessions: number
  events: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
  topModel: string | null
  topProject: string | null
  hasAnyCodexData: boolean
}

export type CodexUsageDailyPoint = {
  day: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
  unpricedTokens: number
}

export type CodexUsageBreakdownRow = {
  key: string
  label: string
  sessions: number
  events: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
  hasInferredPricing: boolean
}

export type CodexUsageSessionRow = {
  sessionId: string
  lastActiveAt: string
  durationMinutes: number
  projectLabel: string
  model: string | null
  events: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  hasInferredPricing: boolean
}

export type CodexUsageSnapshot = {
  scanState: CodexUsageScanState
  summary: CodexUsageSummary
  daily: CodexUsageDailyPoint[]
  modelBreakdown: CodexUsageBreakdownRow[]
  projectBreakdown: CodexUsageBreakdownRow[]
  recentSessions: CodexUsageSessionRow[]
}

export type OpenCodeUsageScanState = {
  enabled: boolean
  isScanning: boolean
  lastScanStartedAt: number | null
  lastScanCompletedAt: number | null
  lastScanError: string | null
  hasAnyOpenCodeData: boolean
}

export type OpenCodeUsageSummary = {
  scope: ProviderUsageScope
  range: ProviderUsageRange
  sessions: number
  events: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
  topModel: string | null
  topProject: string | null
  hasAnyOpenCodeData: boolean
}

export type OpenCodeUsageDailyPoint = {
  day: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
  unpricedTokens: number
}

export type OpenCodeUsageBreakdownRow = {
  key: string
  label: string
  sessions: number
  events: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
}

export type OpenCodeUsageSessionRow = {
  sessionId: string
  lastActiveAt: string
  durationMinutes: number
  projectLabel: string
  model: string | null
  events: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type OpenCodeUsageSnapshot = {
  scanState: OpenCodeUsageScanState
  summary: OpenCodeUsageSummary
  daily: OpenCodeUsageDailyPoint[]
  modelBreakdown: OpenCodeUsageBreakdownRow[]
  projectBreakdown: OpenCodeUsageBreakdownRow[]
  recentSessions: OpenCodeUsageSessionRow[]
}
