import type { MRListState } from '~shared/types'

export function normalizeGitLabPositiveInteger(
  value: unknown,
  fallback: number,
  max: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.min(Math.max(1, Math.trunc(value)), max)
}

export function normalizeGitLabMRListState(value: unknown): MRListState {
  return value === 'merged' || value === 'closed' || value === 'all' ? value : 'opened'
}
