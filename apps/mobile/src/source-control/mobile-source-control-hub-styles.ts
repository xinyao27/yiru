import { cn } from '@/style/class-names'

// Styles for the hub's segmented control and the branch-card PR chip. Split from
// mobile-source-control-styles.ts so neither file crosses the line limit.
export const hubStyles = {
  // Full-width tab bar under the hub header. Edge-to-edge, no inset track and no
  // inner padding — segments share height evenly so the control doesn't float in a
  // pill frame with gaps above/below the active cell.
  segments: cn('flex-row items-stretch w-full bg-card border-b-hairline border-b-border'),
  // Reserved so active underline doesn't change layout height.
  segment: cn('flex-1 min-h-10 items-center justify-center px-1 border-b-2 border-b-transparent'),
  segmentActive: cn('border-b-foreground'),
  segmentPressed: cn('opacity-[0.7]'),
  segmentPressedActive: cn('active:opacity-[0.7]'),
  segmentText: cn('text-muted-foreground text-[14px] font-semibold'),
  segmentTextActive: cn('text-foreground'),
  // The PR chip sits below the count row inside the branch card, separated by a
  // hairline so it reads as a distinct, tappable status line.
  chip: cn('flex-row items-center gap-2 mt-3 pt-3 border-t-hairline border-t-border'),
  chipPressed: cn('opacity-[0.7]'),
  chipPressedActive: cn('active:opacity-[0.7]'),
  chipIcon: cn('w-[18px] items-center'),
  chipNumber: cn('text-foreground text-[14px] font-bold'),
  statePill: cn('px-2 py-[1px] rounded-none border-hairline'),
  statePillText: cn('text-[12px] font-bold'),
  rollup: cn('flex-row items-center gap-1'),
  rollupText: cn('text-[12px] font-semibold'),
  comment: cn('flex-row items-center gap-1'),
  commentText: cn('text-muted-foreground text-[12px] font-semibold'),
  // Pushes the chevron to the trailing edge without a fixed-width spacer.
  chipSpacer: cn('flex-1 min-w-2'),
  chipCreateText: cn('text-primary text-[14px] font-semibold'),
  chipMutedText: cn('flex-1 text-muted-foreground/60 text-[12px]'),
  // Wraps the Changes-only controls (commit-failure/error notice, create-PR entry,
  // bulk Stage/Unstage row) that used to live inside the summary card, now that the
  // card is shared across segments and holds only branch status.
  changesControls: cn('px-4 mt-1'),
  // Fills the remaining space below the header/segments/card so each segment's
  // scroll view (SectionList / PR sidebar / history list) expands and scrolls.
  tabBody: cn('flex-1'),
  // Keep a previously-visited segment mounted (scroll + fetch state) without
  // participating in layout while another segment is active.
  tabBodyHidden: cn('hidden')
} as const
