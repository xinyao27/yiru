import { cn } from '@/style/class-names'

export const styles = {
  root: cn('flex-1 bg-background'),
  chromeRow: cn('flex-row items-center justify-between min-h-7 px-3'),
  chromeLeft: cn('flex-1 flex-row items-center gap-2'),
  stopButton: cn('flex-row items-center gap-1'),
  stopLabel: cn('text-destructive text-[12px] font-bold'),
  sendError: cn('items-center px-3 pb-1'),
  sendErrorText: cn('text-destructive text-[12px] font-semibold'),
  chromeToggle: cn('flex-row items-center gap-1 py-1 px-1'),
  chromeToggleLabel: cn('text-muted-foreground/60 text-[12px] font-semibold'),
  pressed: cn('opacity-[0.6]'),
  pressedActive: cn('active:opacity-[0.6]'),
  listWrap: cn('flex-1 relative'),
  listContent: cn('py-2 grow'),
  center: cn('flex-1 items-center justify-center p-6'),
  emptyTitle: cn('text-muted-foreground text-[14px] font-semibold text-center mb-1'),
  emptySubtitle: cn('text-muted-foreground/60 text-[12px] text-center'),
  fab: cn(
    'absolute right-3 w-[38px] h-[38px] rounded-none items-center justify-center bg-secondary border-hairline border-border'
  ),
  fabBottom: cn('bottom-3'),
  loadEarlier: cn('items-center justify-center py-3 min-h-9'),
  loadEarlierText: cn('text-muted-foreground/60 text-[12px] font-semibold')
} as const
