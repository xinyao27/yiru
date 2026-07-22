import { cn } from '@/style/class-names'

import { diffStyles } from './mobile-source-control-diff-styles'
import { listStyles } from './mobile-source-control-list-styles'

const baseStyles = {
  container: cn('flex-1 bg-background'),
  header: cn('bg-card border-b-hairline border-b-border'),
  topBar: cn('min-h-[58px] flex-row items-center px-2'),
  backButton: cn('w-9 h-9 rounded-none items-center justify-center mr-1'),
  backButtonPressed: cn('bg-secondary'),
  titleBlock: cn('flex-1 min-w-0'),
  title: cn('text-foreground text-[16px] font-bold'),
  meta: cn('text-muted-foreground text-[12px] mt-[2px]'),
  refreshButton: cn('w-9 h-9 rounded-none items-center justify-center ml-1'),
  refreshButtonPressed: cn('bg-secondary'),
  refreshButtonDisabled: cn('opacity-[0.45]'),
  summaryCard: cn('m-4 mb-2 p-3 rounded-none bg-card border-hairline border-border'),
  summaryHeader: cn('flex-row items-center justify-between gap-3'),
  branchLine: cn('flex-1 min-w-0 flex-row items-center gap-1'),
  branchText: cn('flex-1 text-foreground text-[14px] font-semibold'),
  syncText: cn('text-muted-foreground text-[12px]'),
  countRow: cn('flex-row flex-wrap gap-3 mt-2'),
  countText: cn('text-muted-foreground text-[12px]'),
  // Separate line under counts — keeps Abort inside the card on narrow phones.
  conflictRow: cn('flex-row flex-wrap items-center gap-2 mt-2 self-start max-w-full'),
  conflictText: cn('text-amber-500 text-[12px] capitalize'),
  // Match bulk-action hit target so Abort reads as a real control, not a chip.
  abortButton: cn(
    'min-h-8 px-3 py-1 rounded-none border border-amber-500 bg-secondary items-center justify-center shrink-0'
  ),
  abortPressed: cn('opacity-[0.75]'),
  abortButtonDisabled: cn('opacity-[0.45]'),
  abortText: cn('text-amber-500 text-[14px] font-semibold capitalize'),
  reconnectBanner: cn(
    'flex-row items-center gap-2 mx-4 mt-4 mb-[-8px] px-3 py-2 rounded-none bg-secondary border-hairline border-amber-500'
  ),
  reconnectBannerText: cn('text-foreground text-[12px]'),
  actionError: cn('mt-2 px-3 py-2 rounded-none bg-secondary border-hairline border-destructive'),
  actionErrorText: cn('text-foreground text-[12px] leading-[16px]'),
  bulkRow: cn('flex-row gap-2 mt-3'),
  bulkButton: cn(
    'flex-1 min-h-9 rounded-none bg-secondary items-center justify-center flex-row gap-1'
  ),
  bulkMenuButton: cn('w-[42px] min-h-9 rounded-none bg-secondary items-center justify-center'),
  bulkButtonDisabled: cn('opacity-[0.45]'),
  bulkButtonPressed: cn('opacity-[0.75]'),
  bulkButtonText: cn('text-foreground text-[14px] font-semibold'),
  createPrBlock: cn('mt-3 gap-1'),
  createPrButton: cn(
    'min-h-[42px] rounded-none bg-foreground items-center justify-center flex-row gap-1 px-3'
  ),
  createPrButtonDisabled: cn('bg-secondary border-hairline border-border'),
  createPrButtonPressed: cn('opacity-[0.78]'),
  createPrButtonText: cn('text-background text-[14px] font-bold'),
  createPrButtonTextDisabled: cn('text-muted-foreground'),
  createPrHint: cn('text-muted-foreground/60 text-[12px] leading-[16px]')
} as const

export const styles = { ...baseStyles, ...listStyles, ...diffStyles }
