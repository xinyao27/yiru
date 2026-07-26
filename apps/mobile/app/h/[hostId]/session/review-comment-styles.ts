import { cn } from '@/style/class-names'

export const mobileSessionReviewCommentStyles = {
  diffCommentButtonDisabled: cn('opacity-[0.45]'),
  markdownFloatingButton: cn(
    'min-h-[34px] flex-row items-center gap-1 bg-card border border-border px-3 py-1'
  ),
  markdownFloatingButtonText: cn('text-foreground text-xs font-semibold'),
  toast: cn('absolute bottom-4 self-center left-0 right-0 items-center'),
  toastText: cn(
    'bg-secondary border-hairline border-border text-foreground text-xs px-4 py-2 overflow-hidden'
  )
} as const
