import { cn } from '~/style/class-names'

// Fixed inline-dock width (KTD2/U4): leaves the diff >= ~380px within the 700px
// breakpoint where docking engages.
export const PR_SIDEBAR_DOCK_WIDTH = 320

export const mobilePrSidebarStyles = {
  // The inline-docked column lives in the screen's flex row beside the diff.
  dockColumn: cn('border-l-hairline border-l-border bg-background w-80'),
  section: cn('mx-3 mt-3'),

  sectionBody: cn('p-3 gap-2'),

  branchPill: cn('text-foreground shrink rounded-full bg-secondary px-2 py-1 font-mono text-xs'),
  // Generic list row, mirroring the diff-review row rhythm (44dp min target).
  row: cn('min-h-11 flex-row items-center gap-2 py-1'),
  rowMain: cn('flex-1 min-w-0 gap-1'),
  rowTitle: cn('text-foreground text-sm'),
  rowStatus: cn('text-xs font-bold'),

  emptyText: cn('text-muted-foreground text-xs'),

  checkDetailArea: cn('pl-4 pb-1 gap-1'),
  checkDetailText: cn('text-muted-foreground text-xs leading-5'),
  // Annotations / jobs sub-section, divided from the summary by a hairline border
  // (desktop `border-t pt-2`). Muted/monochrome so the detail stays subdued.
  checkDetailGroup: cn('border-t-hairline border-t-border pt-2 gap-1'),
  checkDetailGroupLabel: cn('text-muted-foreground text-xs font-bold uppercase tracking-wide'),

  checkDetailEmphasis: cn('text-foreground text-xs leading-5 font-semibold'),
  // Step rows are indented under their job to read as children.
  checkDetailStepRow: cn('flex-row justify-between gap-2 pl-2'),

  stateArea: cn('flex-1 items-center justify-center p-6 gap-3'),
  stateText: cn('text-muted-foreground text-sm text-center leading-5'),

  // Trailing control area in a reviewer row (add/remove button or spinner).
  rowTrailing: cn('min-h-8 min-w-8 items-center justify-center rounded-full'),

  pickerStateArea: cn('py-4 items-center gap-2')
} as const
