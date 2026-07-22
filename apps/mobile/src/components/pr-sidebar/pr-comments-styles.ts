import { cn } from '@/style/class-names'

// Styles for the PR comments timeline (body + audience tabs + comment cards +
// reactions). Split out of mobile-pr-sidebar-styles to keep that file under the
// 300-line cap. Muted/monochrome to match the rest of the PR sidebar.
export const prCommentsStyles = {
  noDescription: cn('text-muted-foreground text-[12px] italic'),
  // Comments header trailing count chip.
  countChip: cn('border-hairline border-border bg-secondary rounded-none px-2 py-[1px]'),
  countChipText: cn('text-muted-foreground text-[11px] font-semibold'),
  // Audience segmented control (All / Humans / Bots).
  audienceTabs: cn(
    'flex-row border-hairline border-border rounded-none bg-background p-[2px] gap-[2px]'
  ),
  audienceTab: cn('flex-1 min-h-8 flex-row items-center justify-center gap-1 rounded-none'),
  audienceTabActive: cn('bg-secondary'),
  audienceTabText: cn('text-muted-foreground text-[12px] font-semibold'),
  audienceTabTextActive: cn('text-foreground'),
  list: cn('gap-2'),
  showMore: cn(
    'min-h-10 items-center justify-center border-hairline border-border rounded-none bg-card'
  ),
  showMoreText: cn('text-muted-foreground text-[12px] font-semibold'),
  group: cn('gap-2'),
  card: cn('border-hairline border-border rounded-none bg-card overflow-hidden'),
  cardResolved: cn('opacity-[0.6]'),
  reply: cn('ml-4'),
  header: cn('flex-row items-center gap-2 px-3 py-2 border-b-hairline border-b-border'),
  avatar: cn('w-5 h-5 rounded-none bg-secondary'),
  author: cn('text-foreground text-[13px] font-semibold shrink'),
  authorResolved: cn('text-muted-foreground'),
  time: cn('text-muted-foreground text-[12px]'),
  path: cn('text-muted-foreground/60 text-[11px] font-mono shrink'),
  resolvedChip: cn('border-hairline border-border bg-secondary rounded-none px-2 py-[1px]'),
  resolvedChipText: cn('text-muted-foreground text-[11px]'),
  openButton: cn('ml-auto w-7 h-7 items-center justify-center'),
  body: cn('px-3 py-2'),
  reactionsRow: cn('flex-row flex-wrap gap-1 mt-1'),
  reactionChip: cn(
    'flex-row items-center gap-1 h-6 px-2 border-hairline border-border bg-secondary rounded-none'
  ),
  reactionText: cn('text-foreground text-[12px]'),
  // Collapsible header for a resolved thread/comment group.
  resolvedHeader: cn(
    'flex-row items-center gap-2 px-3 py-2 border-hairline border-border rounded-none bg-card'
  ),
  resolvedHeaderText: cn('text-muted-foreground text-[13px] shrink'),
  empty: cn(
    'border-hairline border-dashed border-border rounded-none px-3 py-6 text-muted-foreground text-[13px]'
  ),
  // Reply / Resolve toggle row under a comment body.
  actionsRow: cn('flex-row gap-2 px-3 pb-2 pt-1'),
  actionButton: cn(
    'flex-row items-center gap-1 min-h-7 px-2 rounded-none border-hairline border-border bg-secondary'
  ),
  actionButtonPressed: cn('opacity-[0.7]'),
  actionButtonPressedActive: cn('active:opacity-[0.7]'),
  actionButtonText: cn('text-muted-foreground text-[12px] font-semibold'),
  // Inline reply composer mounted inside a comment card.
  composer: cn('px-3 pb-3'),
  // Root-comment composer at the foot of the timeline (open PRs only).
  rootComposer: cn('gap-2'),
  actionError: cn('text-destructive text-[12px]')
} as const
