import { cn } from '@/style/class-names'

// Styles for the conflicting-files section (file list + fallback notice). Muted/
// monochrome to match the rest of the PR sidebar; split out so the section file and
// the shared sidebar styles each stay focused. Ports the LOOK of the desktop
// ConflictingFilesSection / MergeConflictNotice.
export const prConflictStyles = {
  meta: cn('text-muted-foreground text-[11px]'),
  metaMono: cn('font-mono text-muted-foreground text-[11px]'),
  filesHeader: cn('flex-row items-center gap-2 mt-2'),
  filesHeaderText: cn('text-muted-foreground text-[11px]'),
  // The file list is capped + scrollable so a long conflict set doesn't push the
  // rest of the sidebar off-screen (it lives inside the outer ScrollView).
  fileList: cn('max-h-[180px] mt-2'),
  fileListContent: cn('gap-1'),
  fileRow: cn('border-hairline border-border bg-secondary rounded-none px-2 py-1'),
  filePath: cn('text-foreground text-[11px] font-mono'),
  noticeTitle: cn('text-foreground text-[11px] font-semibold'),
  noticeBody: cn('text-muted-foreground text-[11px] mt-1'),
  commandBox: cn('border-hairline border-border bg-secondary rounded-none mt-2 p-2'),
  commandHeader: cn('flex-row items-center justify-between gap-2'),
  commandLabel: cn('text-muted-foreground text-[10px] font-semibold'),
  copyCommandButton: cn(
    'flex-row items-center gap-1 border-hairline border-border rounded-none px-2 py-1'
  ),
  copyCommandButtonPressed: cn('bg-border'),
  copyCommandButtonPressedActive: cn('active:bg-border'),
  copyCommandText: cn('text-foreground text-[11px] font-semibold'),
  commandText: cn('text-foreground font-mono text-[10px] leading-[15px] mt-2')
} as const
