import { cn } from '@/style/class-names'

// Fixed inline-dock width (KTD2/U4): leaves the diff >= ~380px within the 700px
// breakpoint where docking engages.
export const PR_SIDEBAR_DOCK_WIDTH = 320

export const mobilePrSidebarStyles = {
  // The inline-docked column lives in the screen's flex row beside the diff.
  dockColumn: cn('w-80 bg-card border-l-hairline border-l-border'),
  // Inner scroll area; the diff and the sidebar scroll independently. Flat layout
  // (desktop ChecksPanel): sections butt against each other with border-b
  // dividers, so no outer padding or inter-section gap.
  scrollContent: cn('pb-4'),
  // Flat section band (desktop ChecksPanel sidebar): a full-bleed bgPanel block
  // divided from the next by a bottom hairline, rather than a stacked rounded
  // card. The header row keeps its own border-b for the title/body divide.
  section: cn('bg-card border-b-hairline border-b-border'),
  // Section header row: title + optional trailing control, divided from the body
  // by a hairline border (desktop `h-10 border-b px-3`).
  sectionHeader: cn(
    'min-h-10 flex-row items-center justify-between gap-2 px-3 py-2 border-b-hairline border-b-border'
  ),
  sectionHeaderTrailing: cn('flex-row items-center gap-2'),
  sectionBody: cn('p-3 gap-2'),
  sectionLabel: cn('text-foreground text-[13px] font-semibold'),
  // Identity + actions share one section card (hub redesign): no per-block chrome.
  identityBlock: cn('gap-2'),
  // State badge + #number + author on one row; open-on-web flush right when shown.
  metaRow: cn('flex-row items-center justify-between gap-2'),
  metaLeft: cn('flex-1 min-w-0 flex-row items-center flex-wrap gap-1'),
  badge: cn('self-start px-2 py-[2px] rounded-none border-hairline bg-secondary'),
  badgeText: cn('text-[12px] font-bold'),
  prTitle: cn('flex-1 text-foreground text-[18px] font-bold leading-[24px]'),
  prMeta: cn('text-muted-foreground text-[12px]'),
  // #number in the meta row — stronger than author so the identity scans first.
  prMetaStrong: cn('text-foreground text-[12px] font-semibold'),
  // Title row: tappable area pairing the title with a trailing edit affordance.
  titleRow: cn('flex-row items-start gap-1'),
  titleEditButton: cn('min-w-7 min-h-7 items-center justify-center'),
  branchRow: cn('flex-row items-center flex-wrap gap-1'),
  branchPill: cn(
    'shrink text-foreground text-[12px] font-mono bg-secondary px-1 py-[2px] rounded-none'
  ),
  // Generic list row, mirroring the diff-review row rhythm (44dp min target).
  row: cn('min-h-11 flex-row items-center gap-2 py-1'),
  rowMain: cn('flex-1 min-w-0 gap-[2px]'),
  rowTitle: cn('text-foreground text-[14px]'),
  rowSubtitle: cn('text-muted-foreground text-[12px]'),
  rowStatus: cn('text-[12px] font-bold'),
  statusDot: cn('w-2 h-2 rounded-none'),
  emptyText: cn('text-muted-foreground text-[12px]'),
  // Loading / empty status row inside Reviewers (and similar) section bodies.
  reviewersStatus: cn('min-h-11 flex-row items-center gap-2'),
  summaryLabel: cn('text-[14px] font-bold'),
  checkDetailArea: cn('pl-4 pb-1 gap-1'),
  checkDetailText: cn('text-muted-foreground text-[12px] leading-[18px]'),
  // Annotations / jobs sub-section, divided from the summary by a hairline border
  // (desktop `border-t pt-2`). Muted/monochrome so the detail stays subdued.
  checkDetailGroup: cn('border-t-hairline border-t-border pt-2 gap-1'),
  checkDetailGroupLabel: cn(
    'text-muted-foreground text-[12px] font-bold uppercase tracking-[0.5px]'
  ),
  checkDetailLocator: cn('text-muted-foreground text-[12px] font-mono'),
  checkDetailEmphasis: cn('text-foreground text-[12px] leading-[18px] font-semibold'),
  // Step rows are indented under their job to read as children.
  checkDetailStepRow: cn('flex-row justify-between gap-2 pl-2'),
  // Log tail is preformatted host output; mono + a raised surface, vertically
  // scrollable so a long tail doesn't push the rest of the sidebar off-screen.
  checkDetailLogScroll: cn('max-h-40 bg-secondary rounded-none px-2 py-1'),
  checkDetailLogText: cn('text-muted-foreground text-[12px] font-mono leading-[16px]'),
  stateArea: cn('flex-1 items-center justify-center p-6 gap-3'),
  stateText: cn('text-muted-foreground text-[14px] text-center leading-[20px]'),
  // Blocked state is a permanent failure (R9) — explanatory, not retry-encouraged.
  blockedText: cn('text-muted-foreground text-[14px] text-center leading-[20px]'),
  retryButton: cn('min-h-11 flex-row items-center gap-1 px-3 rounded-none bg-secondary'),
  retryText: cn('text-foreground text-[14px] font-bold'),
  // Trailing control area in a reviewer row (add/remove button or spinner).
  rowTrailing: cn('min-w-8 min-h-8 items-center justify-center'),
  iconButton: cn('min-w-8 min-h-8 items-center justify-center rounded-none'),
  // ─── Reviewer picker (BottomDrawer) ───────────────────────────────────────
  pickerTitle: cn('text-foreground text-[16px] font-bold mb-2'),
  pickerSearch: cn(
    'min-h-10 rounded-none border-hairline border-border bg-card text-foreground px-3 text-[14px] mb-2'
  ),
  // No maxHeight / FlatList: the parent BottomDrawer scrolls this block so we
  // never nest a VirtualizedList inside the PR page ScrollView.
  pickerList: cn('gap-0'),
  pickerRow: cn('min-h-11 flex-row items-center gap-2 py-1'),
  pickerRowMain: cn('flex-1 min-w-0'),
  pickerStateArea: cn('py-4 items-center gap-2')
} as const
