import { cn } from '@/style/class-names'

export const fileExplorerStyles = {
  header: cn('bg-card border-b-hairline border-b-border'),

  backButton: cn('w-9 h-9 items-center justify-center'),
  backButtonPressedActive: cn('active:bg-accent'),

  rowPressedActive: cn('active:bg-accent'),

  chevronSpacer: cn('w-4'),

  inlineStatusRow: cn('min-h-9 flex-row items-center gap-2 pr-3'),

  state: cn('flex-1 items-center justify-center gap-3 p-6')
} as const
