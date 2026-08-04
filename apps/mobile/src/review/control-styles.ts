import { cn } from 'cnfast'

export const mobileDiffReviewControlStyles = {
  primaryButton: cn(
    'min-h-11 flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-primary px-3'
  ),
  primaryButtonText: cn('text-primary-foreground text-sm font-semibold'),
  secondaryButton: cn(
    'min-h-11 flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-secondary px-3'
  ),
  secondaryButtonText: cn('text-muted-foreground text-sm'),
  destructiveText: cn('text-destructive text-sm'),
  drawerTitle: cn('text-foreground text-sm font-semibold'),
  drawerSubtitle: cn('text-muted-foreground text-xs mt-1'),
  drawerButtonRow: cn('flex-row gap-2 mt-3')
} as const
