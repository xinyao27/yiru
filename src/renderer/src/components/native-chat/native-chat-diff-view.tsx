import { cn } from '@/lib/class-names'
import type { DiffLine } from './native-chat-diff'

/** Inline coloured diff, used for Edit/Write tool calls and diff-style tool
 *  results. Adds/dels share the editor diff palette with Monaco and Pierre. */
export function NativeChatDiffView({ lines }: { lines: DiffLine[] }): React.JSX.Element {
  return (
    <div className="overflow-hidden border border-border bg-card py-1 font-mono text-[11px] leading-[18px]">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            'whitespace-pre-wrap break-words px-2',
            line.kind === 'add' &&
              'bg-[var(--editor-diff-inserted-line-background)] text-[var(--editor-diff-added-gutter)]',
            line.kind === 'del' &&
              'bg-[var(--editor-diff-removed-line-background)] text-[var(--editor-diff-deleted-gutter)]',
            line.kind === 'meta' && 'text-muted-foreground',
            line.kind === 'context' && 'text-foreground/70'
          )}
        >
          {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
          {line.text}
        </div>
      ))}
    </div>
  )
}
