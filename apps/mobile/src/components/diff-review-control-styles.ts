import { cn } from '@/style/class-names'

export const mobileDiffReviewControlStyles = {
  navButton: cn('w-11 min-h-11 bg-secondary items-center justify-center'),
  primaryButton: cn('flex-1 min-h-11 flex-row items-center justify-center gap-1 px-3 bg-primary'),
  primaryButtonText: cn('text-primary-foreground text-sm font-extrabold'),
  secondaryButton: cn(
    'flex-1 min-h-11 flex-row items-center justify-center gap-1 px-3 bg-secondary'
  ),
  secondaryButtonText: cn('text-muted-foreground text-sm font-bold'),
  destructiveText: cn('text-destructive text-sm font-bold'),
  drawerTitle: cn('text-foreground text-sm font-bold'),
  drawerSubtitle: cn('text-muted-foreground/60 text-xs mt-[2px]'),
  drawerButtonRow: cn('flex-row gap-2 mt-3')
} as const
