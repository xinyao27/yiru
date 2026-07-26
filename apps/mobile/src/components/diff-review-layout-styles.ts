import { cn } from '@/style/class-names'

export const mobileDiffReviewLayoutStyles = {
  iconButton: cn('w-11 h-11 items-center justify-center'),
  progressText: cn('text-muted-foreground text-xs font-semibold'),
  fileMeta: cn('text-muted-foreground/60 text-xs mt-[2px]'),
  staleText: cn('text-amber-500 text-xs font-bold'),
  hunkButton: cn('min-h-9 flex-row items-center justify-center gap-1 px-3 bg-card'),
  hunkButtonText: cn('text-muted-foreground text-xs font-bold')
} as const
