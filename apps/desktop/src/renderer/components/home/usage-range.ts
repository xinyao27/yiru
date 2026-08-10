export type UsageRange = '7d' | '30d' | '90d'

export function isUsageRange(value: unknown): value is UsageRange {
  return value === '7d' || value === '30d' || value === '90d'
}

export function usageRangeDays(range: UsageRange): number {
  switch (range) {
    case '7d':
      return 7
    case '30d':
      return 30
    case '90d':
      return 90
  }
}

export function dayIsInUsageRange(day: string, range: UsageRange, now = new Date()): boolean {
  const cutoff = new Date(now)
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (usageRangeDays(range) - 1))
  const year = cutoff.getFullYear()
  const month = String(cutoff.getMonth() + 1).padStart(2, '0')
  const date = String(cutoff.getDate()).padStart(2, '0')
  return day >= `${year}-${month}-${date}`
}
