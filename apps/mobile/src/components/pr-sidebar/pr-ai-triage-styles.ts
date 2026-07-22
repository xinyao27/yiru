import { cn } from '@/style/class-names'

// Styles for the "Fix checks with AI" / "Resolve conflicts with AI" triage
// affordances. Kept in their own focused file (rather than growing the shared
// sidebar/conflict style sheets) and muted/monochrome to match the sidebar.
export const prAiTriageStyles = {
  triageArea: cn('gap-1'),
  // Top-of-section triage strip (desktop PRTriageStrip): failing-count summary +
  // a Fix action on the right, tinted by the failure status color.
  triageStrip: cn(
    'flex-row items-center gap-2 p-2 rounded-none border-hairline border-destructive bg-[var(--editor-diff-removed-line-background)]'
  ),
  triageStripText: cn('flex-1 min-w-0'),
  triageStripTitle: cn('text-foreground text-[12px] font-bold'),
  triageStripSubtitle: cn('text-muted-foreground text-[12px]'),
  // Compact Fix button sitting inside the strip (vs. the full-width footer button).
  triageStripButton: cn(
    'min-h-8 flex-row items-center gap-1 px-2 rounded-none border-hairline border-border bg-secondary'
  ),
  triageStripButtonText: cn('text-muted-foreground text-[12px] font-bold'),
  triageButton: cn(
    'min-h-9 flex-row items-center justify-center gap-1 px-3 rounded-none border-hairline border-border bg-secondary'
  ),
  triageButtonPressed: cn('opacity-[0.7]'),
  triageButtonPressedActive: cn('active:opacity-[0.7]'),
  triageButtonText: cn('text-muted-foreground text-[14px] font-semibold'),
  triageError: cn('text-destructive text-[12px]')
} as const
