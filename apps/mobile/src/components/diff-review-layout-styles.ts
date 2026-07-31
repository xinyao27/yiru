import { cn } from '~/style/class-names'

export const mobileDiffReviewLayoutStyles = {
  iconButton: cn('h-11 w-11 items-center justify-center rounded-full'),
  progressText: cn('text-muted-foreground text-xs'),
  fileMeta: cn('text-muted-foreground text-xs mt-1'),
  staleText: cn('text-amber-500 text-xs')
} as const
