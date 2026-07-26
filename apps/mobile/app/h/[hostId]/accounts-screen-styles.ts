import { cn } from '@/style/class-names'

export const styles = {
  row: cn('flex-row items-center py-3 px-3.5'),
  rowPressedActive: cn('active:bg-accent'),
  rowMain: cn('flex-1 gap-1'),
  // Why: fixed-width trailing slot so the usage bars in `rowMain` keep the
  // same width whether or not the row is currently selected (otherwise the
  // checkmark on the active account squeezes the bars narrower than the
  // inactive rows above/below it).
  rowTrailing: cn('w-6 items-end justify-center ml-2'),
  rowTitle: cn('text-sm font-medium text-foreground'),

  usageRow: cn('flex-row gap-3 mt-1'),
  errorText: cn('text-xs text-destructive'),
  placeholder: cn('py-12 items-center gap-2'),
  placeholderText: cn('text-sm text-muted-foreground')
} as const
