import { cn } from 'cnfast'

// Empty-state, retry, and committed-diff-preview drawer styles. Split from the
// main source-control stylesheet to stay under the line limit.
export const diffStyles = {
  state: cn('flex-1 items-center justify-center p-6'),
  stateTitle: cn('text-foreground text-sm font-bold mb-1'),
  stateText: cn('text-muted-foreground text-sm leading-5 text-center'),
  diffState: cn('min-h-40 items-center justify-center p-4')
} as const
