import { cn } from '@/style/class-names'

export const fileExplorerStyles = {
  container: cn('flex-1 bg-background'),
  header: cn('bg-card border-b-hairline border-b-border'),
  topBar: cn('min-h-[58px] flex-row items-center gap-3 px-3'),
  backButton: cn('w-9 h-9 items-center justify-center rounded-none'),
  backButtonPressed: cn('bg-secondary'),
  backButtonPressedActive: cn('active:bg-secondary'),
  titleBlock: cn('flex-1 min-w-0'),
  title: cn('text-foreground text-[18px] font-semibold'),
  meta: cn('mt-[2px] text-muted-foreground text-[12px]'),
  list: cn('flex-1'),
  listContent: cn('py-2'),
  row: cn('min-h-11 flex-row items-center gap-2 pr-3'),
  rowPressed: cn('bg-secondary'),
  rowPressedActive: cn('active:bg-secondary'),
  rowDisabled: cn('opacity-[0.58]'),
  chevronSpacer: cn('w-4'),
  rowTextBlock: cn('flex-1 min-w-0'),
  rowTitle: cn('text-foreground text-[14px]'),
  rowTitleDisabled: cn('text-muted-foreground/60'),
  rowMeta: cn('mt-[1px] text-muted-foreground/60 text-[11px]'),
  inlineStatusRow: cn('min-h-9 flex-row items-center gap-2 pr-3'),
  inlineStatusText: cn('text-muted-foreground text-[12px]'),
  inlineErrorText: cn('flex-1 min-w-0 text-destructive text-[12px]'),
  inlineRetryButton: cn(
    'min-h-7 items-center justify-center rounded-none border-hairline border-border px-3'
  ),
  inlineRetryText: cn('text-foreground text-[12px] font-semibold'),
  state: cn('flex-1 items-center justify-center gap-3 p-6'),
  emptyText: cn('text-muted-foreground text-[14px]'),
  errorText: cn('text-destructive text-[14px] text-center'),
  retryButton: cn(
    'min-h-9 items-center justify-center rounded-none border-hairline border-border px-4'
  ),
  retryText: cn('text-foreground text-[14px] font-semibold')
} as const
