import { cn } from '@/style/class-names'

export const mobileSessionFrameStyles = {
  container: cn('flex-1 bg-background'),
  kavInner: cn('flex-1'),
  // Master-detail content row below the header chrome (KTD2): the existing content is
  // the flex-1 left child; the dock column (when present on wide) is the right child.
  sessionContentRow: cn('flex-1 flex-row'),
  sessionContentMain: cn('flex-1 min-w-0'),
  sessionChrome: cn('bg-card border-b border-b-border'),
  sessionTopBar: cn('min-h-11 flex-row items-center px-2 py-1'),
  backButton: cn('w-9 h-9 rounded-none items-center justify-center mr-1'),
  backButtonPressed: cn('bg-secondary'),
  filesButton: cn('w-9 h-9 rounded-none items-center justify-center ml-1'),
  filesButtonPressed: cn('bg-secondary'),
  // Selected state for the active docked-panel icon on wide layouts (R2).
  filesButtonActive: cn('bg-secondary'),
  sessionTitleBlock: cn('flex-1 min-w-0'),
  sessionTitle: cn('text-foreground text-[14px] font-semibold'),
  sessionMetaRow: cn('flex-row items-center mt-[2px]'),
  sessionMetaText: cn('shrink text-muted-foreground text-[12px]'),
  tabBar: cn('flex-row items-center border-t border-t-border'),
  tabScroll: cn('flex-1 max-h-9'),
  tabContent: cn('pl-2 pr-2'),
  tab: cn(
    'w-32 max-w-32 min-h-9 items-center justify-center px-2 py-2 border-b-2 border-b-transparent'
  ),
  // Neutral grey underline, matching the desktop terminal tab's active
  // indicator (a muted foreground/card mix), not a blue accent.
  tabActive: cn('border-b-muted-foreground'),
  tabLabelRow: cn('max-w-full flex-row items-center gap-1'),
  tabText: cn('shrink text-muted-foreground text-[13px]'),
  tabTextActive: cn('text-foreground'),
  newTerminalButton: cn('w-10 h-9 items-center justify-center border-b-2 border-b-transparent'),
  newTerminalButtonPressed: cn('bg-secondary'),
  newTerminalButtonDisabled: cn('opacity-[0.45]'),
  tabActionDivider: cn('h-[18px] w-hairline bg-border'),
  terminalFrame: cn('flex-1 min-h-0 relative overflow-hidden'),
  terminalPane: cn('absolute inset-0'),
  terminalPaneHidden: cn('opacity-[0]'),
  terminalWebView: cn('flex-1'),
  markdownFrame: cn('flex-1 min-h-0 bg-background'),
  browserFrame: cn('flex-1 min-h-0 bg-background'),
  markdownEditor: cn('flex-1 relative'),
  markdownState: cn('flex-1 items-center justify-center p-6 gap-3'),
  markdownError: cn('text-destructive text-[14px]')
} as const
