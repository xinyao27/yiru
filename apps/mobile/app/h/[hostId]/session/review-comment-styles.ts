import { cn } from '@/style/class-names'

export const mobileSessionReviewCommentStyles = {
  diffCommentAddButton: cn('w-[26px] h-[22px] items-center justify-center rounded-none'),
  diffCommentAddButtonPressed: cn('bg-card'),
  diffCommentButtonDisabled: cn('opacity-[0.45]'),
  diffCommentList: cn('gap-1 ml-11 mr-2 mt-1'),
  diffCommentCard: cn('border border-border rounded-none bg-card px-2 py-1'),
  diffCommentHeader: cn('flex-row items-center gap-1 mb-[2px]'),
  diffCommentMeta: cn('flex-1 text-muted-foreground/60 text-[12px] font-semibold'),
  diffCommentDeleteButton: cn('w-[22px] h-[22px] items-center justify-center rounded-none'),
  diffCommentBody: cn('text-foreground text-[12px] leading-[17px]'),
  diffCommentComposer: cn('gap-1 ml-11 mr-2 mt-1 border border-border rounded-none bg-card p-2'),
  diffCommentInput: cn('min-h-[70px] h-[70px] mr-0 pt-2 pb-2'),
  diffCommentComposerActions: cn('flex-row justify-end gap-1'),
  diffCommentSecondaryAction: cn('min-h-[30px] justify-center rounded-none px-3'),
  diffCommentSecondaryText: cn('text-muted-foreground text-[12px] font-semibold'),
  diffCommentPrimaryAction: cn('min-h-[30px] justify-center rounded-none bg-secondary px-3'),
  diffCommentPrimaryText: cn('text-foreground text-[12px] font-bold'),
  markdownRefreshButton: cn(
    'self-start flex-row items-center gap-1 bg-secondary border border-border rounded-none px-3 py-1'
  ),
  markdownButtonDisabled: cn('opacity-[0.45]'),
  markdownRefreshText: cn('text-foreground text-[13px] font-semibold'),
  markdownFloatingBar: cn('absolute left-3 right-3 bottom-4 items-end gap-1'),
  markdownFloatingStatus: cn(
    'max-w-full self-end overflow-hidden text-muted-foreground bg-card border border-border rounded-none px-2 py-1 text-[12px]'
  ),
  markdownFloatingActions: cn('flex-row flex-wrap justify-end gap-1'),
  markdownFloatingButton: cn(
    'min-h-[34px] flex-row items-center gap-1 bg-card border border-border rounded-none px-3 py-1'
  ),
  markdownSaveButton: cn('bg-secondary'),
  markdownFloatingButtonText: cn('text-foreground text-[13px] font-semibold'),
  toast: cn('absolute bottom-4 self-center left-0 right-0 items-center'),
  toastText: cn(
    'bg-secondary border-hairline border-border text-foreground text-[13px] px-4 py-2 rounded-none overflow-hidden'
  )
} as const
