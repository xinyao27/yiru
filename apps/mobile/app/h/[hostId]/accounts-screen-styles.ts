import { cn } from '@/style/class-names'

export const styles = {
  container: cn('flex-1 bg-background'),
  topRow: cn('flex-row items-center px-3 pt-2 pb-2 gap-2'),
  backButton: cn('w-9 h-9 rounded-none items-center justify-center'),
  iconButton: cn('w-9 h-9 rounded-none items-center justify-center'),
  titleWrap: cn('flex-1'),
  heading: cn('text-[20px] font-bold text-foreground'),
  subheading: cn('text-[12px] text-muted-foreground mt-[1px]'),
  scroll: cn('px-4 pt-2'),
  section: cn('mb-6'),
  sectionHeader: cn('flex-row items-center gap-2 mb-2'),
  sectionHeading: cn('text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]'),
  card: cn('bg-card rounded-none overflow-hidden'),
  row: cn('flex-row items-center py-3 px-3.5'),
  rowPressed: cn('bg-secondary'),
  rowPressedActive: cn('active:bg-secondary'),
  rowMain: cn('flex-1 gap-1'),
  // Why: fixed-width trailing slot so the usage bars in `rowMain` keep the
  // same width whether or not the row is currently selected (otherwise the
  // checkmark on the active account squeezes the bars narrower than the
  // inactive rows above/below it).
  rowTrailing: cn('w-6 items-end justify-center ml-2'),
  rowTitle: cn('text-[14px] font-medium text-foreground'),
  rowSubtitle: cn('text-[12px] text-muted-foreground'),
  separator: cn('h-hairline bg-border mx-3'),
  usageRow: cn('flex-row gap-3 mt-1'),
  errorText: cn('text-[12px] text-destructive'),
  placeholder: cn('py-12 items-center gap-2'),
  placeholderText: cn('text-[14px] text-muted-foreground'),
  footerHint: cn('flex-row items-start gap-2 px-2 pt-2'),
  footerHintText: cn('flex-1 text-[12px] text-muted-foreground/60 leading-[18px]')
} as const
