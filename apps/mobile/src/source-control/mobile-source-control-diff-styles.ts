import { cn } from '@/style/class-names'

// Empty-state, retry, and committed-diff-preview drawer styles. Split from the
// main source-control stylesheet to stay under the line limit.
export const diffStyles = {
  state: cn('flex-1 items-center justify-center p-6'),
  stateTitle: cn('text-foreground text-[16px] font-bold mb-1'),
  stateText: cn('text-muted-foreground text-[14px] leading-[20px] text-center'),
  retryButton: cn('mt-3 px-4 py-2 rounded-none bg-secondary'),
  retryText: cn('text-foreground text-[14px] font-semibold'),
  diffDrawerHeader: cn('flex-row items-center gap-3 pb-3 border-b-hairline border-b-border'),
  diffDrawerTitleBlock: cn('flex-1 min-w-0'),
  diffDrawerTitle: cn('text-foreground text-[14px] font-bold'),
  diffDrawerMeta: cn('text-muted-foreground/60 text-[12px] mt-[2px]'),
  diffCloseButton: cn('w-[34px] h-[34px] rounded-none items-center justify-center'),
  diffState: cn('min-h-40 items-center justify-center p-4'),
  diffLines: cn('pt-3 pb-4'),
  diffTruncatedText: cn('text-muted-foreground/60 text-[12px] mb-2'),
  diffLine: cn('flex-row items-start gap-1 py-[2px] px-1'),
  diffLineAdd: cn('bg-[var(--editor-diff-inserted-line-background)]'),
  diffLineDelete: cn('bg-[var(--editor-diff-removed-line-background)]'),
  diffLineNumber: cn('w-10 text-muted-foreground/60 font-mono text-[12px] text-right'),
  diffLinePrefix: cn('w-3 text-muted-foreground font-mono text-[12px]'),
  diffLineText: cn('flex-1 text-foreground font-mono text-[12px] leading-[17px]')
} as const
