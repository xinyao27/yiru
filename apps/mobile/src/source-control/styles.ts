import { cn } from '@/style/class-names'

import { diffStyles } from './diff-styles'
import { listStyles } from './list-styles'

const baseStyles = {
  header: cn('bg-card border-b-hairline border-b-border'),
  refreshButton: cn('w-9 h-9 items-center justify-center ml-1'),
  countText: cn('text-muted-foreground text-xs'),
  bulkButton: cn('flex-1 min-h-9 bg-secondary items-center justify-center flex-row gap-1'),
  bulkButtonDisabled: cn('opacity-[0.45]'),
  bulkButtonText: cn('text-foreground text-sm font-semibold')
} as const

export const styles = { ...baseStyles, ...listStyles, ...diffStyles }
