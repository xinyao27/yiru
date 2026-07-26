import { cn } from '@/style/class-names'

// Changed-files list, section headers, file rows, and the commit bar. Split
// from the main source-control stylesheet to stay under the line limit.
export const listStyles = {
  listContent: cn('px-4 pb-[136px]'),
  sectionHeader: cn('flex-row items-center justify-between pt-3 pb-1'),
  sectionTitle: cn('text-muted-foreground text-[11px] font-bold uppercase'),
  sectionCount: cn('text-muted-foreground/60 text-xs font-semibold'),
  branchStateRow: cn('min-h-11 flex-row items-center gap-2 py-2 border-b-hairline border-b-border'),
  branchStateText: cn('flex-1 text-muted-foreground text-xs leading-[18px]'),
  fileRow: cn('min-h-[50px] flex-row items-center gap-2 py-2 border-b-hairline border-b-border'),
  fileRowDisabled: cn('opacity-[0.78]'),
  fileRowUnavailable: cn('opacity-[0.72]'),
  statusBadge: cn('w-6 items-center'),
  statusBadgeText: cn('font-mono text-xs font-bold'),
  fileTextBlock: cn('flex-1 min-w-0'),
  filePath: cn('text-foreground text-sm'),
  filePathDisabled: cn('text-muted-foreground'),
  fileMeta: cn('text-muted-foreground/60 text-xs mt-[2px]'),
  iconButton: cn('w-8 h-8 items-center justify-center'),
  iconButtonDisabled: cn('opacity-[0.45]'),
  commitInput: cn(
    'flex-1 min-h-[42px] border-hairline border-border bg-background text-foreground px-3 text-sm'
  ),
  commitButtonDisabled: cn('opacity-[0.45]')
} as const
