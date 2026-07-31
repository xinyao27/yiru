import { cn } from '~/style/class-names'

import { diffStyles } from './diff-styles'
import { listStyles } from './list-styles'

const baseStyles = {
  countText: cn('text-muted-foreground text-xs')
} as const

export const styles = { ...baseStyles, ...listStyles, ...diffStyles }
