export function formatPlanLabel(planType: string | null | undefined): string | null {
  const trimmed = planType?.trim()
  if (!trimmed) {
    return null
  }
  return trimmed
    .split(/[\s_-]+/)
    .map((word) => {
      const normalized = word.toLowerCase()
      return normalized === 'chatgpt'
        ? 'ChatGPT'
        : normalized.charAt(0).toUpperCase() + normalized.slice(1)
    })
    .join(' ')
}

export type UsageUrgency = 'neutral' | 'warning' | 'critical'

export function getUsageUrgency(usedPercent: number): UsageUrgency {
  if (usedPercent >= 80) {
    return 'critical'
  }
  return usedPercent >= 60 ? 'warning' : 'neutral'
}

// Why: match the progress-bar thresholds so the number and fill communicate one urgency state.
export function usageTextColorClass(usedPercent: number): string {
  switch (getUsageUrgency(usedPercent)) {
    case 'critical':
      return 'text-red-500'
    case 'warning':
      return 'text-amber-500'
    case 'neutral':
      return 'text-foreground'
  }
}
