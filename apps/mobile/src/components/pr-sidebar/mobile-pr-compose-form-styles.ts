import { cn } from '@/style/class-names'

export const mobilePrComposeFormStyles = {
  root: cn('gap-2'),
  headingRow: cn('flex-row items-center justify-between gap-2 mb-1'),
  headingTitle: cn('flex-1 min-w-0 flex-row items-center gap-1'),
  heading: cn('text-foreground text-[14px] font-bold'),
  headingActions: cn('flex-row items-center gap-1'),
  genButton: cn(
    'min-h-8 flex-row items-center justify-center gap-1 px-2 rounded-none border-hairline border-border bg-card'
  ),
  genButtonPressed: cn('opacity-[0.7]'),
  genButtonPressedActive: cn('active:opacity-[0.7]'),
  genButtonText: cn('text-muted-foreground text-[12px] font-bold'),
  iconButton: cn('min-w-8 min-h-8 items-center justify-center rounded-none'),
  branchFlow: cn('min-h-7 flex-row items-center gap-1'),
  branchToken: cn('max-w-[116px] text-foreground text-[12px] font-mono'),
  branchTokenError: cn('text-destructive'),
  fieldStack: cn('gap-2'),
  titleInput: cn(
    'min-h-10 bg-secondary rounded-none px-3 py-2 text-foreground text-[14px] font-semibold'
  ),
  // Why: a moderate fixed height avoids over-expanding inside the sidebar scroll.
  bodyInput: cn('bg-secondary rounded-none px-3 py-2 text-foreground text-[14px] min-h-[120px]'),
  baseRow: cn('min-h-10 flex-row items-center gap-2'),
  baseLabel: cn('text-muted-foreground text-[12px] w-9'),
  baseControl: cn('flex-1 min-w-0'),
  draftRow: cn(
    'min-h-9 flex-row items-center justify-between gap-2 border-hairline border-border rounded-none bg-card px-2'
  ),
  draftText: cn('text-foreground text-[12px] font-bold'),
  notice: cn('flex-row items-start gap-1'),
  noticeText: cn('flex-1 text-muted-foreground text-[12px] leading-[18px]'),
  errorText: cn('text-destructive'),
  submit: cn('mt-1 min-h-11 rounded-none bg-foreground flex-row items-center justify-center gap-1'),
  submitDisabled: cn('opacity-[0.45]'),
  submitPressed: cn('opacity-[0.8]'),
  submitPressedActive: cn('active:opacity-[0.8]'),
  submitText: cn('text-background text-[14px] font-bold')
} as const
