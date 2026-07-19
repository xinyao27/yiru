import React, { useEffect, useMemo, useState } from 'react'

import { cn } from '@/lib/class-names'
import { resolveDocumentTheme } from '@/lib/document-theme'
import { computeEditorFontSize } from '@/lib/editor-font-zoom'
import { monaco, resolveCursorThemeName } from '@/lib/monaco-setup'
import { useAppStore } from '@/store'

let pythonLanguageRegistrationPromise: Promise<void> | null = null

async function ensureColorizationLanguage(language: string): Promise<void> {
  if (language !== 'python') {
    return
  }
  pythonLanguageRegistrationPromise ??=
    import('monaco-editor/esm/vs/basic-languages/python/python.js').then(
      ({ conf, language: pythonTokens }) => {
        // Why: notebook excerpts colorize without mounting Monaco editors. Load
        // Python tokens only on demand so non-notebook users do not pay at startup.
        if (!monaco.languages.getLanguages().some((item) => item.id === 'python')) {
          monaco.languages.register({
            id: 'python',
            extensions: ['.py', '.pyw'],
            aliases: ['Python', 'py']
          })
        }
        monaco.languages.setLanguageConfiguration('python', conf)
        monaco.languages.setMonarchTokensProvider('python', pythonTokens)
      }
    )
  await pythonLanguageRegistrationPromise
}

type MonacoCodeExcerptProps = {
  lines: string[]
  firstLineNumber: number
  highlightedStartLine: number
  highlightedEndLine: number
  language: string
}

export default function MonacoCodeExcerpt({
  lines,
  firstLineNumber,
  highlightedStartLine,
  highlightedEndLine,
  language
}: MonacoCodeExcerptProps): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const editorFontSize = computeEditorFontSize(
    settings?.terminalFontSize ?? 13,
    editorFontZoomLevel
  )
  const fontFamily = settings?.terminalFontFamily || 'monospace'
  const isDark = resolveDocumentTheme(settings?.theme ?? 'system')
  const code = useMemo(() => lines.join('\n'), [lines])
  const [htmlLines, setHtmlLines] = useState<string[]>(() => lines.map(() => ''))

  useEffect(() => {
    monaco.editor.setTheme(resolveCursorThemeName(isDark))
  }, [isDark])

  useEffect(() => {
    if (lines.length === 0) {
      setHtmlLines([])
      return
    }

    let cancelled = false
    // Why: notebook languages like Python are loaded lazily by Monaco. The
    // async colorizer waits for that tokenizer; colorizeModelLine can render
    // only default-token spans if called before the contribution finishes.
    void ensureColorizationLanguage(language)
      .catch(() => undefined)
      .then(() => monaco.editor.colorize(code, language, { tabSize: 2 }))
      .then((html) => {
        if (cancelled) {
          return
        }
        const nextLines = html.split('<br/>').slice(0, lines.length)
        setHtmlLines(nextLines)
      })

    return () => {
      cancelled = true
    }
  }, [code, language, lines])

  return (
    <div
      className="overflow-x-auto py-1 text-[12px] leading-5"
      style={{ fontFamily, fontSize: editorFontSize }}
    >
      {lines.map((codeLine, index) => {
        const lineNumber = firstLineNumber + index
        const isCommentedLine =
          lineNumber >= highlightedStartLine && lineNumber <= highlightedEndLine
        const html = htmlLines[index] || (codeLine ? undefined : '&nbsp;')
        return (
          <div
            key={lineNumber}
            className={cn('flex font-mono', isCommentedLine && 'bg-emerald-500/10')}
          >
            <span className="border-border/40 text-muted-foreground w-12 shrink-0 border-r px-2 text-right tabular-nums select-none">
              {lineNumber}
            </span>
            {html ? (
              <code
                className="text-foreground min-w-max flex-1 px-3 whitespace-pre"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <code className="text-foreground min-w-max flex-1 px-3 whitespace-pre">
                {codeLine || ' '}
              </code>
            )}
          </div>
        )
      })}
    </div>
  )
}
