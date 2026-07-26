import { cn } from '@/style/class-names'

export const mobileSessionReaderStyles = {
  filePreviewScroll: cn('flex-1 min-h-0 bg-[var(--editor-surface)]'),
  filePreviewContent: cn('px-4 pt-4 pb-6'),
  diffNotesActionButton: cn(
    'min-h-[30px] flex-row items-center gap-1 border border-border px-2 bg-secondary'
  ),
  diffNotesActionText: cn('text-muted-foreground text-xs font-semibold')
} as const
