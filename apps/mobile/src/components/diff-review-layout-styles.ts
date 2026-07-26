import { cn } from '@/style/class-names'

export const mobileDiffReviewLayoutStyles = {
  iconButton: cn('h-11 w-11 items-center justify-center rounded-full'),
  progressText: cn('text-muted-foreground text-xs font-semibold'),
  fileMeta: cn('text-muted-foreground text-xs mt-0.5'),
  staleText: cn('text-amber-500 text-xs font-bold'),
  hunkButton: cn('min-h-9 flex-row items-center justify-center gap-1 rounded-xl bg-card px-3'),
  hunkButtonText: cn('text-muted-foreground text-xs font-bold')
} as const
