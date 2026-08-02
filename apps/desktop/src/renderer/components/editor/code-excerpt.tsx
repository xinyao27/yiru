import { cn } from '~renderer/lib/class-names'
import { useAppStore } from '~renderer/store'

import { resolveEditorFontFamily } from './font-family'
import { computeEditorFontSize } from './font-zoom'

type CodeExcerptProps = {
  lines: string[]
  firstLineNumber: number
  highlightedStartLine: number
  highlightedEndLine: number
}

/**
 * A few numbered lines of code, with the commented range banded.
 *
 * Why: this used to colorize through Monaco. Pierre highlights inside its own
 * Shadow DOM surfaces and shiki's standalone `codeToHtml` cannot see the app's
 * registered themes, so an excerpt this small renders as plain monospace rather
 * than carrying a second highlighter for it.
 */
export default function CodeExcerpt({
  lines,
  firstLineNumber,
  highlightedStartLine,
  highlightedEndLine
}: CodeExcerptProps): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const editorFontSize = computeEditorFontSize(
    settings?.terminalFontSize ?? 13,
    editorFontZoomLevel
  )

  return (
    <div
      className="overflow-x-auto py-1 text-[12px] leading-5"
      style={{ fontFamily: resolveEditorFontFamily(settings), fontSize: editorFontSize }}
    >
      {lines.map((codeLine, index) => {
        const lineNumber = firstLineNumber + index
        const isCommentedLine =
          lineNumber >= highlightedStartLine && lineNumber <= highlightedEndLine
        return (
          <div
            key={lineNumber}
            className={cn('flex font-mono', isCommentedLine && 'bg-emerald-500/10')}
          >
            <span className="border-border/40 text-muted-foreground w-12 shrink-0 border-r px-2 text-right tabular-nums select-none">
              {lineNumber}
            </span>
            <code className="text-foreground min-w-max flex-1 px-3 whitespace-pre">
              {codeLine || ' '}
            </code>
          </div>
        )
      })}
    </div>
  )
}
