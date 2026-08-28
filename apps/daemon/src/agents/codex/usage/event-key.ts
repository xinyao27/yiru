export type CodexUsageEventKeyUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export function buildCodexUsageEventKey(
  timestamp: string,
  totalUsage: CodexUsageEventKeyUsage | null,
  lastUsage: CodexUsageEventKeyUsage | null
): string {
  return [timestamp, tupleOf(totalUsage), tupleOf(lastUsage)].join('|')
}

export function migrateCodexUsageEventKey(eventKey: string, schemaVersion: number): string | null {
  if (schemaVersion === 5) {
    return eventKey
  }
  if (schemaVersion !== 6) {
    return null
  }

  const fields = eventKey.split('|')
  if (fields.length !== 3) {
    return null
  }
  const totalUsage = removeCacheWriteField(fields[1])
  const lastUsage = removeCacheWriteField(fields[2])
  if (totalUsage === null || lastUsage === null) {
    return null
  }
  return [fields[0], totalUsage, lastUsage].join('|')
}

function tupleOf(usage: CodexUsageEventKeyUsage | null): string {
  // Why: v5 did not record cache-write tokens in ownership identities. The
  // timestamp plus the remaining raw usage tuple still identifies copied
  // fork/resume records and lets that index migrate without a history rescan.
  return usage
    ? [
        usage.inputTokens,
        usage.cachedInputTokens,
        usage.outputTokens,
        usage.reasoningOutputTokens,
        usage.totalTokens
      ].join(',')
    : ''
}

function removeCacheWriteField(tuple: string): string | null {
  if (tuple.length === 0) {
    return ''
  }
  const fields = tuple.split(',')
  if (fields.length !== 6) {
    return null
  }
  return [fields[0], fields[1], fields[3], fields[4], fields[5]].join(',')
}
