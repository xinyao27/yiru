import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MultiFileDiff, type DiffLineAnnotation, type SelectedLineRange } from '@pierre/diffs/react'
import { DIFFS_TAG_NAME, type FileDiffOptions } from '@pierre/diffs'
import { Copy, SelectionAll } from '@phosphor-icons/react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/components/tab-bar/sortable-tab'
import type { DecoratedDiffComment } from '@/components/diff-comments/use-diff-comment-decorator'
import { PierreDiffCommentComposer } from './pierre-diff-comment-composer'
import { PierreDiffCommentAnnotation } from './pierre-diff-comment-annotation'
import { translate } from '@/i18n/i18n'
import { setWithLRU } from '@/lib/scroll-cache'
import { resolvePierreDiffLanguage } from './pierre-diff-language'

type CommentComposer = {
  lineNumber: number
  startLine?: number
}

type PierreDiffAnnotation =
  | { kind: 'comment'; comment: DecoratedDiffComment }
  | { kind: 'composer'; composer: CommentComposer }

type HoveredDiffLine = {
  lineNumber: number
  side: 'additions' | 'deletions'
}

const pierreDiffScrollCache = new Map<string, number>()
const EMPTY_DIFF_COMMENTS: readonly DecoratedDiffComment[] = []

function formatNativeShortcut(isMac: boolean, key: string): string {
  return [isMac ? '⌘' : 'Ctrl', key].join(isMac ? '' : '+')
}

function isCommentableRange(
  range: SelectedLineRange,
  commentableLineNumbers: readonly number[] | undefined
): boolean {
  if (
    (range.side && range.side !== 'additions') ||
    (range.endSide && range.endSide !== 'additions')
  ) {
    return false
  }
  if (!commentableLineNumbers) {
    return true
  }
  const allowed = new Set(commentableLineNumbers)
  const start = Math.min(range.start, range.end)
  const end = Math.max(range.start, range.end)
  for (let line = start; line <= end; line += 1) {
    if (!allowed.has(line)) {
      return false
    }
  }
  return true
}

function selectPierreDiffContents(container: HTMLElement | null): void {
  const code = container
    ?.querySelector<HTMLElement>(DIFFS_TAG_NAME)
    ?.shadowRoot?.querySelector('pre')
  if (!code) {
    return
  }
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(code)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export function PierreDiffViewer({
  modelKey,
  originalContent,
  modifiedContent,
  filePath,
  relativePath,
  language,
  sideBySide,
  isDark,
  fontSize,
  fontFamily,
  wordWrap,
  worktreeId,
  comments = EMPTY_DIFF_COMMENTS,
  commentableLineNumbers,
  addLineCommentLabel,
  addLineCommentPlaceholder,
  onAddLineComment,
  onDeleteComment,
  onUpdateComment,
  pendingScrollCommentId,
  onPendingScrollConsumed,
  onHeightChange
}: {
  modelKey: string
  originalContent: string
  modifiedContent: string
  filePath: string
  relativePath: string
  language: string
  sideBySide: boolean
  isDark: boolean
  fontSize: number
  fontFamily?: string
  wordWrap?: boolean
  worktreeId?: string
  comments?: readonly DecoratedDiffComment[]
  commentableLineNumbers?: readonly number[]
  addLineCommentLabel?: string
  addLineCommentPlaceholder?: string
  onAddLineComment?: (args: {
    lineNumber: number
    startLine?: number
    body: string
  }) => Promise<boolean>
  onDeleteComment?: (commentId: string) => void
  onUpdateComment?: (commentId: string, body: string) => Promise<boolean>
  pendingScrollCommentId?: string | null
  onPendingScrollConsumed?: () => void
  onHeightChange?: (height: number) => void
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const diffRef = useRef<HTMLDivElement | null>(null)
  const hoveredLineRef = useRef<HoveredDiffLine | null>(null)
  const [composer, setComposer] = useState<CommentComposer | null>(null)
  const isMac = useMemo(() => navigator.userAgent.includes('Mac'), [])
  const copyShortcutLabel = formatNativeShortcut(isMac, 'C')
  const selectAllShortcutLabel = formatNativeShortcut(isMac, 'A')
  const pierreLanguage = useMemo(
    () => resolvePierreDiffLanguage(relativePath, language),
    [language, relativePath]
  )

  const oldFile = useMemo(
    () => ({
      name: relativePath,
      contents: originalContent,
      lang: pierreLanguage,
      cacheKey: `${modelKey}:old`
    }),
    [modelKey, originalContent, pierreLanguage, relativePath]
  )
  const newFile = useMemo(
    () => ({
      name: relativePath,
      contents: modifiedContent,
      lang: pierreLanguage,
      cacheKey: `${modelKey}:new`
    }),
    [modelKey, modifiedContent, pierreLanguage, relativePath]
  )

  const handleSubmitComment = useCallback(
    async (body: string) => {
      if (!composer || !onAddLineComment) {
        return
      }
      const saved = await onAddLineComment({ ...composer, body })
      if (saved) {
        setComposer(null)
      }
    },
    [composer, onAddLineComment]
  )

  const options = useMemo<FileDiffOptions<PierreDiffAnnotation>>(
    () => ({
      theme: { dark: 'github-dark', light: 'github-light' },
      themeType: isDark ? 'dark' : 'light',
      diffStyle: sideBySide ? 'split' : 'unified',
      diffIndicators: 'bars',
      disableFileHeader: true,
      hunkSeparators: 'line-info-basic',
      lineDiffType: 'word-alt',
      overflow: wordWrap ? 'wrap' : 'scroll',
      enableLineSelection: Boolean(onAddLineComment),
      enableGutterUtility: Boolean(onAddLineComment),
      lineHoverHighlight: onAddLineComment ? 'line' : 'disabled',
      // Why: Pierre treats this callback as a complete gutter API and rejects
      // pairing it with the React renderGutterUtility API.
      onGutterUtilityClick: (range) => {
        if (!isCommentableRange(range, commentableLineNumbers)) {
          return
        }
        setComposer({
          startLine: range.start === range.end ? undefined : Math.min(range.start, range.end),
          lineNumber: Math.max(range.start, range.end)
        })
      },
      onLineEnter: ({ lineNumber, annotationSide }) => {
        hoveredLineRef.current = { lineNumber, side: annotationSide }
      },
      onLineLeave: () => {
        hoveredLineRef.current = null
      },
      // Why: Pierre renders inside Shadow DOM, so the app-wide square-corner
      // rule cannot cross the boundary without this narrow library override.
      unsafeCSS: '* { border-radius: 0 !important; }'
    }),
    [commentableLineNumbers, isDark, onAddLineComment, sideBySide, wordWrap]
  )

  const lineAnnotations = useMemo<DiffLineAnnotation<PierreDiffAnnotation>[]>(() => {
    const annotations: DiffLineAnnotation<PierreDiffAnnotation>[] = comments.map((comment) => ({
      side: 'additions' as const,
      lineNumber: comment.lineNumber,
      metadata: { kind: 'comment' as const, comment }
    }))
    if (composer) {
      annotations.push({
        side: 'additions',
        lineNumber: composer.lineNumber,
        metadata: { kind: 'composer', composer }
      })
    }
    return annotations
  }, [comments, composer])

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<PierreDiffAnnotation>) => {
      const metadata = annotation.metadata
      if (metadata.kind === 'composer') {
        return (
          <PierreDiffCommentComposer
            {...metadata.composer}
            placeholder={addLineCommentPlaceholder}
            submitLabel={addLineCommentLabel}
            submittingLabel="Posting…"
            onCancel={() => setComposer(null)}
            onSubmit={handleSubmitComment}
          />
        )
      }
      const comment = metadata.comment
      return (
        <PierreDiffCommentAnnotation
          comment={comment}
          relativePath={relativePath}
          worktreeId={worktreeId}
          onDeleteComment={onDeleteComment}
          onUpdateComment={onUpdateComment}
        />
      )
    },
    [
      addLineCommentLabel,
      addLineCommentPlaceholder,
      handleSubmitComment,
      onDeleteComment,
      onUpdateComment,
      relativePath,
      worktreeId
    ]
  )

  const diffStyle = useMemo(
    () =>
      ({
        '--diffs-light-bg': 'var(--editor-surface)',
        '--diffs-dark-bg': 'var(--editor-surface)',
        '--diffs-light': 'var(--foreground)',
        '--diffs-dark': 'var(--foreground)',
        '--diffs-font-family': fontFamily || 'var(--font-mono)',
        '--diffs-header-font-family': 'var(--app-font-family)',
        '--diffs-font-size': `${fontSize}px`,
        '--diffs-line-height': `${Math.max(19, Math.round(fontSize * 1.5))}px`,
        '--diffs-addition-color-override': 'var(--git-decoration-added)',
        '--diffs-deletion-color-override': 'var(--git-decoration-deleted)',
        '--diffs-modified-color-override': 'var(--git-decoration-modified)'
      }) as React.CSSProperties,
    [fontFamily, fontSize]
  )

  useLayoutEffect(() => {
    const scrollContainer = scrollRef.current
    if (!scrollContainer) {
      return
    }
    const cachedScrollTop = pierreDiffScrollCache.get(modelKey)
    if (cachedScrollTop !== undefined) {
      scrollContainer.scrollTop = cachedScrollTop
    }
    return () => {
      setWithLRU(pierreDiffScrollCache, modelKey, scrollContainer.scrollTop)
    }
  }, [modelKey])

  useLayoutEffect(() => {
    if (!onHeightChange || !diffRef.current || typeof ResizeObserver === 'undefined') {
      return
    }
    const node = diffRef.current
    const update = (): void => onHeightChange(Math.ceil(node.getBoundingClientRect().height))
    const observer = new ResizeObserver(update)
    observer.observe(node)
    update()
    return () => observer.disconnect()
  }, [onHeightChange])

  useLayoutEffect(() => {
    if (!pendingScrollCommentId) {
      return
    }
    const frame = requestAnimationFrame(() => {
      const target = diffRef.current?.querySelector<HTMLElement>(
        `[data-yiru-diff-comment-id="${CSS.escape(pendingScrollCommentId)}"]`
      )
      if (!target) {
        return
      }
      target.scrollIntoView({ block: 'center' })
      onPendingScrollConsumed?.()
    })
    return () => cancelAnimationFrame(frame)
  }, [onPendingScrollConsumed, pendingScrollCommentId])

  const handleCopy = useCallback(() => {
    const selectedText = window.getSelection()?.toString() ?? ''
    if (selectedText) {
      void window.api.ui.writeClipboardText(selectedText)
      return
    }
    const hovered = hoveredLineRef.current
    if (!hovered) {
      return
    }
    const source = hovered.side === 'deletions' ? originalContent : modifiedContent
    const line = source.split(/\r\n?|\n/u)[hovered.lineNumber - 1]
    if (line !== undefined) {
      void window.api.ui.writeClipboardText(line)
    }
  }, [modifiedContent, originalContent])

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) {
          window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
        }
      }}
    >
      <ContextMenuTrigger
        render={
          <div
            ref={scrollRef}
            className="scrollbar-editor h-full min-h-0 overflow-auto bg-[var(--editor-surface)]"
          >
            <div ref={diffRef} className="min-w-full">
              <MultiFileDiff
                oldFile={oldFile}
                newFile={newFile}
                options={options}
                lineAnnotations={lineAnnotations}
                renderAnnotation={renderAnnotation}
                style={diffStyle}
              />
            </div>
          </div>
        }
      />
      <ContextMenuContent className="w-56" finalFocus={false}>
        <ContextMenuItem onClick={handleCopy}>
          <Copy />
          {translate('auto.components.editor.PierreDiffViewer.copy', 'Copy')}
          <ContextMenuShortcut>{copyShortcutLabel}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => selectPierreDiffContents(diffRef.current)}>
          <SelectionAll />
          {translate('auto.components.editor.PierreDiffViewer.selectAll', 'Select All')}
          <ContextMenuShortcut>{selectAllShortcutLabel}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => void window.api.ui.writeClipboardText(filePath)}>
          <Copy />
          {translate('auto.components.editor.PierreDiffViewer.copyPath', 'Copy Path')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
