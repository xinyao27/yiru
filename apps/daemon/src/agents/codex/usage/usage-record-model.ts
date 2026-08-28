export type CodexUsageWorktreeRef = {
  repoId: string
  worktreeId: string
  path: string
  displayName: string
}

export type CodexUsageRawRecord = {
  timestamp?: string
  type?: string
  payload?: Record<string, unknown>
}

export type CodexUsageRawUsage = {
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type CodexUsageParseContext = {
  sessionId: string
  sessionCwd: string | null
  currentCwd: string | null
  currentModel: string | null
  currentTurnId: string | null
  previousTotals: CodexUsageRawUsage | null
  sawSessionMeta: boolean
  suppressingForkCopies: boolean
  forkCopyAnchorMs: number
  totalOnlyBaselinePending?: boolean
}

export type CodexUsageDeltaResolution =
  | { kind: 'event'; delta: CodexUsageRawUsage; nextTotals: CodexUsageRawUsage | null }
  | { kind: 'baseline'; nextTotals: CodexUsageRawUsage }
