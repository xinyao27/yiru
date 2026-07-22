import { cn } from '@/style/class-names'

export const prCreateEmptyStateStyles = {
  section: cn('bg-card border-b-hairline border-b-border overflow-hidden'),
  header: cn(
    'min-h-10 flex-row items-center justify-between gap-2 px-3 py-2 border-b-hairline border-b-border'
  ),
  headerTitle: cn('flex-1 min-w-0 flex-row items-center gap-1'),
  headerLabel: cn('text-foreground text-[13px] font-semibold'),
  headerActions: cn('flex-row items-center gap-1'),
  createButton: cn(
    'min-h-8 flex-row items-center justify-center gap-1 px-2 rounded-none bg-foreground'
  ),
  createButtonDisabled: cn('opacity-[0.5]'),
  createButtonText: cn('text-background text-[12px] font-bold'),
  iconButton: cn('min-w-8 min-h-8 items-center justify-center rounded-none'),
  iconButtonPressed: cn('bg-secondary'),
  iconButtonPressedActive: cn('active:bg-secondary'),
  body: cn('p-3 gap-2'),
  bodyTitle: cn('text-foreground text-[14px] font-bold'),
  bodyText: cn('text-muted-foreground text-[12px] leading-[18px]'),
  composerArea: cn('bg-card border-b-hairline border-b-border p-3'),
  // Secondary link-an-existing-PR affordance, set apart from the body copy.
  linkButton: cn('mt-1 min-h-8 self-start flex-row items-center gap-1'),
  linkButtonDisabled: cn('opacity-[0.5]'),
  linkButtonPressed: cn('opacity-[0.6]'),
  linkButtonPressedActive: cn('active:opacity-[0.6]'),
  linkButtonText: cn('text-muted-foreground text-[12px] font-semibold')
} as const
