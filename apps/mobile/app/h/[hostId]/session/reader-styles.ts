import { cn } from '@/style/class-names'

export const mobileSessionReaderStyles = {
  filePreviewScroll: cn('flex-1 min-h-0 bg-editor-surface'),
  filePreviewContent: cn('px-4 pt-4 pb-6'),
  diffNotesActionButton: cn(
    'border-border min-h-8 flex-row items-center gap-1 rounded-lg border bg-secondary px-2'
  ),
  diffNotesActionText: cn('text-muted-foreground text-xs font-semibold')
} as const
