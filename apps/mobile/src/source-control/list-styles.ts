import { cn } from '@/style/class-names'

// Changed-files list, section headers, file rows, and the commit bar. Split
// from the main source-control stylesheet to stay under the line limit.
export const listStyles = {
  listContent: cn('px-4 pb-36'),
  sectionHeader: cn('flex-row items-center justify-between pt-3 pb-1'),
  sectionTitle: cn('text-muted-foreground text-xs uppercase'),
  sectionCount: cn('text-muted-foreground text-xs'),
  branchStateRow: cn('min-h-11 flex-row items-center gap-2 py-2 border-b-hairline border-b-border'),
  branchStateText: cn('flex-1 text-muted-foreground text-xs leading-5'),
  fileRow: cn('min-h-12 flex-row items-center gap-2 py-2 border-b-hairline border-b-border'),
  fileRowDisabled: cn('opacity-80'),
  fileRowUnavailable: cn('opacity-70'),
  statusBadge: cn('w-5 items-center'),
  statusBadgeText: cn('font-mono text-xs'),
  fileTextBlock: cn('flex-1 min-w-0'),
  filePath: cn('text-foreground text-sm'),
  filePathDisabled: cn('text-muted-foreground'),
  fileMeta: cn('text-muted-foreground text-xs mt-1'),
  iconButton: cn('w-8 h-8 items-center justify-center'),
  iconButtonDisabled: cn('opacity-50')
} as const
