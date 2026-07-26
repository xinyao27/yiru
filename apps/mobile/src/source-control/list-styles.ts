import { cn } from '@/style/class-names'

// Changed-files list, section headers, file rows, and the commit bar. Split
// from the main source-control stylesheet to stay under the line limit.
export const listStyles = {
  listContent: cn('px-4 pb-[136px]'),
  sectionHeader: cn('flex-row items-center justify-between pt-3 pb-1'),
  sectionTitle: cn('text-muted-foreground text-[11px] font-bold uppercase'),
  sectionCount: cn('text-muted-foreground/60 text-[12px] font-semibold'),
  branchCompareBlock: cn('pb-2'),
  branchSectionTitleBlock: cn('flex-1 min-w-0'),
  branchSectionSubtitle: cn('text-muted-foreground/60 text-[12px] mt-[2px]'),
  branchStateRow: cn('min-h-11 flex-row items-center gap-2 py-2 border-b-hairline border-b-border'),
  branchStateText: cn('flex-1 text-muted-foreground text-[12px] leading-[18px]'),
  fileRow: cn('min-h-[50px] flex-row items-center gap-2 py-2 border-b-hairline border-b-border'),
  fileRowPressed: cn('bg-card'),
  fileRowDisabled: cn('opacity-[0.78]'),
  fileRowUnavailable: cn('opacity-[0.72]'),
  statusBadge: cn('w-6 items-center'),
  statusBadgeText: cn('font-mono text-[12px] font-bold'),
  fileTextBlock: cn('flex-1 min-w-0'),
  filePath: cn('text-foreground text-[14px]'),
  filePathDisabled: cn('text-muted-foreground'),
  fileMeta: cn('text-muted-foreground/60 text-[12px] mt-[2px]'),
  rowActions: cn('flex-row items-center gap-1'),
  iconButton: cn('w-8 h-8 rounded-none items-center justify-center'),
  iconButtonPressed: cn('bg-secondary'),
  iconButtonDisabled: cn('opacity-[0.45]'),
  commitBar: cn('absolute left-0 right-0 gap-1 p-4 pt-3 bg-card border-t-hairline border-t-border'),
  commitRow: cn('flex-row gap-2'),
  commitInput: cn(
    'flex-1 min-h-[42px] rounded-none border-hairline border-border bg-background text-foreground px-3 text-[14px]'
  ),
  commitInputDisabled: cn('bg-card border-border border-dashed items-center justify-center'),
  commitInputDisabledText: cn('text-muted-foreground/60 text-[14px] font-semibold'),
  commitButton: cn(
    'min-w-[88px] min-h-[42px] rounded-none bg-foreground items-center justify-center px-3'
  ),
  commitButtonSecondary: cn('bg-transparent border-hairline border-border'),
  generateButton: cn('w-[42px] min-h-[42px] rounded-none bg-secondary items-center justify-center'),
  commitButtonDisabled: cn('opacity-[0.45]'),
  commitButtonPressed: cn('opacity-[0.75]'),
  commitButtonText: cn('text-background text-[14px] font-bold'),
  commitButtonSecondaryText: cn('text-foreground'),
  commitFailurePanel: cn(
    'mt-2 p-2 rounded-none bg-secondary border-hairline border-destructive gap-2'
  ),
  commitFailureHeader: cn('flex-row items-center gap-2'),
  commitFailureTextBlock: cn('flex-1 min-w-0'),
  commitFailureTitle: cn('text-foreground text-[14px] font-bold'),
  commitFailureSummary: cn('text-muted-foreground text-[12px] leading-[16px] mt-[2px]'),
  commitFailureFixButton: cn(
    'min-h-9 px-3 rounded-none bg-foreground flex-row items-center justify-center gap-1'
  ),
  commitFailureFixButtonDisabled: cn('opacity-[0.45]'),
  commitFailureFixButtonPressed: cn('opacity-[0.75]'),
  commitFailureFixButtonText: cn('text-background text-[12px] font-bold'),
  commitFailureDetailsButton: cn('min-h-8 flex-row items-center gap-1'),
  commitFailureDetailsButtonPressed: cn('opacity-[0.75]'),
  commitFailureDetailsButtonText: cn('text-muted-foreground text-[12px] font-semibold'),
  commitFailureDetailsText: cn('text-muted-foreground font-mono text-[12px] leading-[17px]'),
  commitFailureLaunchError: cn('text-destructive text-[12px] leading-[16px]')
} as const
