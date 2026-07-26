import { cn } from '@/style/class-names'

// Styles for the hub's segmented control and the branch-card PR chip. Split from
// mobile-source-control-styles.ts so neither file crosses the line limit.
export const hubStyles = {
  // Pushes the chevron to the trailing edge without a fixed-width spacer.
  chipSpacer: cn('flex-1 min-w-2'),

  chipMutedText: cn('flex-1 text-muted-foreground/60 text-xs'),
  // Fills the remaining space below the header/segments/card so each segment's
  // scroll view (SectionList / PR sidebar / history list) expands and scrolls.
  tabBody: cn('flex-1'),
  // Keep a previously-visited segment mounted (scroll + fetch state) without
  // participating in layout while another segment is active.
  tabBodyHidden: cn('hidden')
} as const
