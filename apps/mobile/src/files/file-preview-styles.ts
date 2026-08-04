import { cn } from 'cnfast'

export const filePreviewStyles = {
  state: cn('flex-1 items-center justify-center gap-3 p-6'),
  stateText: cn('text-muted-foreground text-sm text-center'),

  scroll: cn('flex-1 bg-editor-surface')
} as const
