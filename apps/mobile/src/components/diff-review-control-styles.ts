import { cn } from '@/style/class-names'

export const mobileDiffReviewControlStyles = {
  navButton: cn('min-h-11 w-11 items-center justify-center rounded-xl bg-secondary'),
  primaryButton: cn(
    'min-h-11 flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-primary px-3'
  ),
  primaryButtonText: cn('text-primary-foreground text-sm font-extrabold'),
  secondaryButton: cn(
    'min-h-11 flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-secondary px-3'
  ),
  secondaryButtonText: cn('text-muted-foreground text-sm font-bold'),
  destructiveText: cn('text-destructive text-sm font-bold'),
  drawerTitle: cn('text-foreground text-sm font-bold'),
  drawerSubtitle: cn('text-muted-foreground text-xs mt-0.5'),
  drawerButtonRow: cn('flex-row gap-2 mt-3')
} as const
