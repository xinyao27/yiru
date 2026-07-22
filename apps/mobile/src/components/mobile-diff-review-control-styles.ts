import { cn } from '@/style/class-names'

export const mobileDiffReviewControlStyles = {
  footer: cn(
    'absolute left-0 right-0 bottom-0 px-4 pt-2 gap-2 bg-background border-t-hairline border-t-border'
  ),
  fileActionRow: cn('flex-row gap-2'),
  footerRow: cn('flex-row items-center gap-2'),
  navButton: cn('w-11 min-h-11 rounded-none bg-secondary items-center justify-center'),
  footerButton: cn(
    'min-h-11 flex-row items-center justify-center gap-1 px-3 rounded-none bg-secondary'
  ),
  footerButtonText: cn('text-muted-foreground text-[14px] font-bold'),
  primaryButton: cn(
    'flex-1 min-h-11 flex-row items-center justify-center gap-1 px-3 rounded-none bg-foreground'
  ),
  primaryButtonDone: cn('bg-green-500'),
  primaryButtonText: cn('text-background text-[14px] font-extrabold'),
  secondaryButton: cn(
    'flex-1 min-h-11 flex-row items-center justify-center gap-1 px-3 rounded-none bg-secondary'
  ),
  secondaryButtonText: cn('text-muted-foreground text-[14px] font-bold'),
  destructiveText: cn('text-destructive text-[14px] font-bold'),
  buttonPressed: cn('opacity-[0.76]'),
  buttonDisabled: cn('opacity-[0.45]'),
  composerHeader: cn('flex-row justify-between items-center gap-3 mb-3'),
  drawerTitle: cn('text-foreground text-[18px] font-bold'),
  drawerSubtitle: cn('text-muted-foreground/60 text-[12px] mt-[2px]'),
  composerInput: cn(
    'min-h-28 rounded-none border-hairline border-border bg-card text-foreground text-[14px] leading-[20px] p-3'
  ),
  drawerButtonRow: cn('flex-row gap-2 mt-3')
} as const
