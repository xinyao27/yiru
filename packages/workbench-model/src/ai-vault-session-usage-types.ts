export type AiVaultSessionDayTokens = {
  day: string
  tokens: number
}

export type AiVaultSessionTokenUsage = {
  provider: string | null
  model: string | null
  timestamp: string | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}
