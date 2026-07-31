import { cn } from '~/style/class-names'

export const filePreviewStyles = {
  state: cn('flex-1 items-center justify-center gap-3 p-6'),
  stateText: cn('text-muted-foreground text-sm text-center'),

  scroll: cn('flex-1 bg-editor-surface'),

  modeToggle: cn('h-7 w-9 items-center justify-center rounded-lg bg-transparent opacity-70'),
  modeToggleActive: cn('bg-secondary opacity-100')
} as const
