import type { AppState } from '~renderer/store/types'

const entries = new Map<string, AppState['hostedReviewCache'][string] | undefined>()
const ENTRY_MAX = 128

function entryKey(sequence: number, cacheKey: string): string {
  return `${sequence}::${cacheKey}`
}

export function deletePRRefreshStartedEntry(sequence: number | undefined, cacheKey: string): void {
  if (sequence !== undefined && sequence > 0) {
    entries.delete(entryKey(sequence, cacheKey))
  }
}

export function rememberPRRefreshStartedEntry(
  sequence: number,
  cacheKey: string,
  entry: AppState['hostedReviewCache'][string] | undefined
): void {
  const key = entryKey(sequence, cacheKey)
  if (entry === undefined) {
    entries.delete(key)
    return
  }
  entries.delete(key)
  entries.set(key, entry)
  while (entries.size > ENTRY_MAX) {
    const oldest = entries.keys().next()
    if (oldest.done) {
      return
    }
    entries.delete(oldest.value)
  }
}

export function takePRRefreshStartedEntry(
  sequence: number,
  cacheKey: string
): AppState['hostedReviewCache'][string] | undefined {
  const key = entryKey(sequence, cacheKey)
  const entry = entries.get(key)
  entries.delete(key)
  return entry
}
