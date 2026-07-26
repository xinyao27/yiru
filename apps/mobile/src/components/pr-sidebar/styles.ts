import { cn } from '@/style/class-names'

// Fixed inline-dock width (KTD2/U4): leaves the diff >= ~380px within the 700px
// breakpoint where docking engages.
export const PR_SIDEBAR_DOCK_WIDTH = 320

export const mobilePrSidebarStyles = {
  // The inline-docked column lives in the screen's flex row beside the diff.
  dockColumn: cn('w-80 bg-card border-l-hairline border-l-border'),
  // Flat section band (desktop ChecksPanel sidebar): a full-bleed bgPanel block
  // divided from the next by a bottom hairline, rather than a stacked rounded
  // card. The header row keeps its own border-b for the title/body divide.
  section: cn('bg-card border-b-hairline border-b-border'),

  sectionBody: cn('p-3 gap-2'),

  branchPill: cn('shrink text-foreground text-xs font-mono bg-secondary px-1 py-[2px]'),
  // Generic list row, mirroring the diff-review row rhythm (44dp min target).
  row: cn('min-h-11 flex-row items-center gap-2 py-1'),
  rowMain: cn('flex-1 min-w-0 gap-[2px]'),
  rowTitle: cn('text-foreground text-sm'),
  rowStatus: cn('text-xs font-bold'),

  emptyText: cn('text-muted-foreground text-xs'),

  checkDetailArea: cn('pl-4 pb-1 gap-1'),
  checkDetailText: cn('text-muted-foreground text-xs leading-[18px]'),
  // Annotations / jobs sub-section, divided from the summary by a hairline border
  // (desktop `border-t pt-2`). Muted/monochrome so the detail stays subdued.
  checkDetailGroup: cn('border-t-hairline border-t-border pt-2 gap-1'),
  checkDetailGroupLabel: cn('text-muted-foreground text-xs font-bold uppercase tracking-[0.5px]'),

  checkDetailEmphasis: cn('text-foreground text-xs leading-[18px] font-semibold'),
  // Step rows are indented under their job to read as children.
  checkDetailStepRow: cn('flex-row justify-between gap-2 pl-2'),

  stateArea: cn('flex-1 items-center justify-center p-6 gap-3'),
  stateText: cn('text-muted-foreground text-sm text-center leading-[20px]'),

  // Trailing control area in a reviewer row (add/remove button or spinner).
  rowTrailing: cn('min-w-8 min-h-8 items-center justify-center'),
  iconButton: cn('min-w-8 min-h-8 items-center justify-center'),

  pickerStateArea: cn('py-4 items-center gap-2')
} as const
