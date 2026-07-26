import { cn } from '@/style/class-names'

export const mobileSessionReviewCommentStyles = {
  diffCommentButtonDisabled: cn('opacity-50'),
  markdownFloatingButton: cn(
    'border-border bg-card min-h-9 flex-row items-center gap-1 rounded-xl border px-3 py-1'
  ),
  markdownFloatingButtonText: cn('text-foreground text-xs font-semibold'),
  toast: cn('absolute bottom-4 self-center left-0 right-0 items-center'),
  toastText: cn(
    'border-hairline border-border bg-secondary text-foreground overflow-hidden rounded-xl px-4 py-2 text-xs'
  )
} as const
