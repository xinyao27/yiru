import { cn } from '@/style/class-names'

export const filePreviewStyles = {
  state: cn('flex-1 items-center justify-center gap-3 p-6'),
  stateText: cn('text-muted-foreground text-sm text-center'),

  scroll: cn('flex-1 bg-[var(--editor-surface)]'),

  modeToggle: cn('w-[34px] h-7 items-center justify-center bg-transparent opacity-[0.72]'),
  modeToggleActive: cn('bg-secondary opacity-[1]')
} as const
