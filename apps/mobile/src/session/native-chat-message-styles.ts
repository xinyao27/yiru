import { cn } from '@/style/class-names'

export const TEXT_SIZE = 17
export const MONO_SIZE = 12
export const MAX_TOOL_RESULT_CHARS = 4000

export const styles = {
  row: cn('px-4 py-2'),
  rowUser: cn('items-end'),
  content: cn('max-w-full gap-2'),
  userBubble: cn('max-w-[88%] bg-foreground rounded-none px-3 py-2'),
  userText: cn('text-background text-[17px] leading-[23px] font-medium'),
  controls: cn('flex-row justify-end gap-1 mb-[2px] opacity-[0.7]'),
  controlButton: cn('p-[3px]'),
  controlPressed: cn('opacity-[0.5]'),
  controlPressedActive: cn('active:opacity-[0.5]'),
  copied: cn('bg-[var(--editor-diff-inserted-line-background)] rounded-none'),
  reasoning: cn('opacity-[0.7]'),
  queued: cn('opacity-[0.55]'),
  queuedTag: cn('text-muted-foreground/60 text-[11px] font-semibold mb-[2px]'),
  toolRun: cn('mt-1'),
  toolRunHeader: cn('flex-row items-center gap-2'),
  toolRunToggle: cn('flex-1 flex-row items-center gap-2 py-[3px]'),
  controlsRow: cn('flex-row justify-end'),
  toolRunCount: cn('text-green-500 font-mono text-[12px] font-bold'),
  toolRunLabel: cn('flex-1 text-muted-foreground/60 font-mono text-[12px]'),
  toolRunBody: cn('pl-2 border-l-2 border-l-border mt-1'),
  toolLine: cn('flex-row items-center gap-2 py-[3px]'),
  toolName: cn('text-foreground font-mono text-[13px] font-semibold'),
  toolPreview: cn('flex-1 text-muted-foreground/60 font-mono text-[12px]'),
  toolPreviewLink: cn('text-primary underline'),
  toolDetail: cn('pl-4 pb-1 gap-1'),
  mono: cn('text-muted-foreground font-mono text-[12px] leading-[17px]'),
  toolResult: cn('rounded-none bg-card p-3'),
  toolResultError: cn('bg-[var(--editor-diff-removed-line-background)]'),
  imageRef: cn('text-muted-foreground text-[17px]'),
  diff: cn('rounded-none bg-card py-1 overflow-hidden'),
  diffLine: cn('text-muted-foreground font-mono text-[12px] leading-[17px] px-2'),
  diffAdd: cn(
    'text-[var(--git-decoration-added)] bg-[var(--editor-diff-inserted-line-background)]'
  ),
  diffDel: cn(
    'text-[var(--git-decoration-deleted)] bg-[var(--editor-diff-removed-line-background)]'
  ),
  diffMeta: cn('text-muted-foreground/60')
} as const
