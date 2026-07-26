import { cn } from '@/style/class-names'

export const styles = {
  cardMetaText: cn('text-muted-foreground text-xs'),

  state: cn('flex-1 items-center justify-center p-6 gap-2'),
  stateTitle: cn('text-foreground text-sm font-semibold'),
  stateText: cn('text-muted-foreground text-xs text-center')
} as const
