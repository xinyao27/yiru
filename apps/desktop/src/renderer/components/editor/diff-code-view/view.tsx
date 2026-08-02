import { Copy, SelectionAll } from '@phosphor-icons/react'
import type { OnDiffLineEnterLeaveProps, OnLineEnterLeaveProps } from '@pierre/diffs'
import {
  CodeView,
  type CodeViewHandle,
  type CodeViewReactOptions,
  type DiffLineAnnotation
} from '@pierre/diffs/react'
import { useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DecoratedDiffComment } from '~renderer/components/diff-comments/decorated-diff-comment'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '~renderer/components/tab-bar/sortable-tab'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '~renderer/components/ui/context-menu'
import { translate } from '~renderer/i18n/i18n'

import { registerCursorPierreThemes } from '../cursor-pierre-theme'
import { setWithLRU } from '../scroll-cache'
import {
  buildDiffCodeViewAnnotations,
  isCommentableRange,
  renderDiffCodeViewAnnotation,
  type DiffCodeViewAnnotation
} from './annotations'
import { DiffCodeViewEditProvider } from './edit-provider'
import { useDiffCodeViewItems, type DiffCodeViewFileInput, type DiffCodeViewSource } from './items'
import type { DiffCodeViewNotice } from './notices'
import {
  buildDiffCodeViewCSSVariables,
  buildDiffCodeViewRenderOptions,
  type DiffCodeViewFontAppearance,
  type DiffCodeViewRenderAppearance
} from './options'

export type DiffCodeViewFile = {
  source: DiffCodeViewSource
  collapsed?: boolean
  comments?: readonly DecoratedDiffComment[]
  commentableLineNumbers?: readonly number[]
  /** Set when this row carries a loading, error, binary, image or size notice
   *  instead of a text diff. */
  notice?: DiffCodeViewNotice
  /** Lets the user edit this row in place. Requires onFileEditComplete. */
  editable?: boolean
}

/**
 * Replaces Pierre's filename row for one file. Only reached when the surface
 * leaves `disableFileHeader` off, since that is what mounts the header host.
 */
export type DiffCodeViewHeaderRenderer = (file: DiffCodeViewFile) => React.ReactNode

/** Lets a surrounding surface drive the shared scroller. */
export type DiffCodeViewHandle = {
  scrollToFile: (fileKey: string) => void
}

type OpenComposer = {
  itemId: string
  lineNumber: number
  startLine?: number
}

type CachedFileAnnotations = {
  comments: readonly DecoratedDiffComment[]
  composer: OpenComposer | null
  annotations: DiffLineAnnotation<DiffCodeViewAnnotation>[]
}

type HoveredLine = {
  itemId: string
  lineNumber: number
  side: 'additions' | 'deletions'
}

const EMPTY_COMMENTS: readonly DecoratedDiffComment[] = []
const diffCodeViewScrollCache = new Map<string, number>()

registerCursorPierreThemes()

function formatNativeShortcut(isMac: boolean, key: string): string {
  return [isMac ? '⌘' : 'Ctrl', key].join(isMac ? '' : '+')
}

export function DiffCodeView({
  files,
  render,
  font,
  worktreeId,
  addLineCommentLabel,
  addLineCommentPlaceholder,
  onAddLineComment,
  onDeleteComment,
  onUpdateComment,
  onRetryFile,
  onSaveLimitedDiff,
  onFileEditComplete,
  pendingScrollCommentId,
  onPendingScrollConsumed,
  scrollCacheKey,
  className,
  renderFileHeader,
  viewRef
}: {
  files: readonly DiffCodeViewFile[]
  render: DiffCodeViewRenderAppearance
  font: DiffCodeViewFontAppearance
  worktreeId?: string
  addLineCommentLabel?: string
  addLineCommentPlaceholder?: string
  onAddLineComment?: (
    relativePath: string,
    args: { lineNumber: number; startLine?: number; body: string }
  ) => Promise<boolean>
  onDeleteComment?: (commentId: string) => void
  onUpdateComment?: (commentId: string, body: string) => Promise<boolean>
  onRetryFile?: (fileKey: string) => void
  onSaveLimitedDiff?: (fileKey: string) => void
  onFileEditComplete?: (fileKey: string, contents: string) => void
  pendingScrollCommentId?: string | null
  onPendingScrollConsumed?: () => void
  scrollCacheKey?: string
  className?: string
  renderFileHeader?: DiffCodeViewHeaderRenderer
  viewRef?: React.Ref<DiffCodeViewHandle>
}): React.JSX.Element {
  const handleRef = useRef<CodeViewHandle<DiffCodeViewAnnotation> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const hoveredLineRef = useRef<HoveredLine | null>(null)
  const [composer, setComposer] = useState<OpenComposer | null>(null)
  const isMac = useMemo(() => navigator.userAgent.includes('Mac'), [])

  const fileById = useMemo(() => {
    const map = new Map<string, DiffCodeViewFile>()
    for (const file of files) {
      map.set(file.source.key, file)
    }
    return map
  }, [files])

  // Why: CodeView adopts an item only when its object identity changes, so the
  // annotation array has to stay referentially stable while nothing about that
  // file's comments or composer moved.
  const annotationCacheRef = useRef(new Map<string, CachedFileAnnotations>())
  const fileInputs = useMemo<DiffCodeViewFileInput[]>(() => {
    const cache = annotationCacheRef.current
    const next = new Map<string, CachedFileAnnotations>()
    const inputs = files.map((file) => {
      const id = file.source.key
      const comments = file.comments ?? EMPTY_COMMENTS
      const fileComposer = composer?.itemId === id ? composer : null
      const cached = cache.get(id)
      const annotations =
        cached && cached.comments === comments && cached.composer === fileComposer
          ? cached.annotations
          : buildDiffCodeViewAnnotations(comments, fileComposer)
      next.set(id, { comments, composer: fileComposer, annotations })
      return {
        source: file.source,
        collapsed: file.collapsed === true,
        annotations,
        notice: file.notice,
        editable: file.editable
      }
    })
    annotationCacheRef.current = next
    return inputs
  }, [composer, files])
  const items = useDiffCodeViewItems(fileInputs)

  const handleSubmitComment = useCallback(
    async (body: string) => {
      const target = composer ? fileById.get(composer.itemId) : undefined
      if (!composer || !target || !onAddLineComment) {
        return
      }
      const saved = await onAddLineComment(target.source.path, {
        lineNumber: composer.lineNumber,
        startLine: composer.startLine,
        body
      })
      if (saved) {
        setComposer(null)
      }
    },
    [composer, fileById, onAddLineComment]
  )

  const options = useMemo<CodeViewReactOptions<DiffCodeViewAnnotation>>(
    () => ({
      ...buildDiffCodeViewRenderOptions(render),
      stickyHeaders: !render.disableFileHeader,
      // Why: Pierre estimates unrendered rows from these before measuring, and
      // our line height is driven by the editor font size, not its default.
      itemMetrics: { lineHeight: Math.max(19, Math.round(font.fontSize * 1.5)) },
      enableLineSelection: Boolean(onAddLineComment),
      enableGutterUtility: Boolean(onAddLineComment),
      lineHoverHighlight: onAddLineComment ? 'line' : 'disabled',
      // Why: Pierre treats this callback as a complete gutter API and rejects
      // pairing it with the React renderGutterUtility API.
      onGutterUtilityClick: (range, context) => {
        const target = fileById.get(context.item.id)
        if (!target || !isCommentableRange(range, target.commentableLineNumbers)) {
          return
        }
        setComposer({
          itemId: context.item.id,
          startLine: range.start === range.end ? undefined : Math.min(range.start, range.end),
          lineNumber: Math.max(range.start, range.end)
        })
      },
      // Why: CodeView types this callback for file and diff items alike, and
      // only the diff variant carries a side.
      onLineEnter: (
        props: OnLineEnterLeaveProps | OnDiffLineEnterLeaveProps,
        context: { item: { id: string } }
      ) => {
        hoveredLineRef.current = {
          itemId: context.item.id,
          lineNumber: props.lineNumber,
          side: 'annotationSide' in props ? props.annotationSide : 'additions'
        }
      },
      onLineLeave: () => {
        hoveredLineRef.current = null
      }
    }),
    [fileById, font.fontSize, onAddLineComment, render]
  )

  const renderAnnotation = useCallback(
    (annotation: Parameters<typeof renderDiffCodeViewAnnotation>[0], item: { id: string }) =>
      renderDiffCodeViewAnnotation(annotation, {
        relativePath: fileById.get(item.id)?.source.path ?? '',
        onRetry: onRetryFile ? () => onRetryFile(item.id) : undefined,
        onSaveLimitedDiff: onSaveLimitedDiff ? () => onSaveLimitedDiff(item.id) : undefined,
        worktreeId,
        addLineCommentLabel,
        addLineCommentPlaceholder,
        onCancelComposer: () => setComposer(null),
        onSubmitComposer: handleSubmitComment,
        onDeleteComment,
        onUpdateComment
      }),
    [
      addLineCommentLabel,
      addLineCommentPlaceholder,
      fileById,
      handleSubmitComment,
      onDeleteComment,
      onRetryFile,
      onSaveLimitedDiff,
      onUpdateComment,
      worktreeId
    ]
  )

  const renderCustomHeader = useCallback(
    (item: { id: string }) => {
      const file = fileById.get(item.id)
      return file && renderFileHeader ? renderFileHeader(file) : null
    },
    [fileById, renderFileHeader]
  )

  useImperativeHandle(
    viewRef,
    () => ({
      scrollToFile: (fileKey: string) => {
        handleRef.current?.scrollTo({ type: 'item', id: fileKey, align: 'start' })
      }
    }),
    []
  )

  // Why: CodeView reports the final contents once a row's edit session ends —
  // edit turned off, row collapsed, or row removed — which is the only moment
  // worth writing to disk. Mid-session changes stay in the editor.
  const handleItemEditComplete = useCallback(
    (item: { id: string }, editedFile: { contents: string }) => {
      onFileEditComplete?.(item.id, editedFile.contents)
    },
    [onFileEditComplete]
  )

  const style = useMemo(() => buildDiffCodeViewCSSVariables(font), [font])

  const handleScroll = useCallback(
    (scrollTop: number) => {
      if (scrollCacheKey) {
        setWithLRU(diffCodeViewScrollCache, scrollCacheKey, scrollTop)
      }
    },
    [scrollCacheKey]
  )

  useLayoutEffect(() => {
    const cached = scrollCacheKey ? diffCodeViewScrollCache.get(scrollCacheKey) : undefined
    if (cached === undefined || cached <= 0) {
      return
    }
    handleRef.current?.scrollTo({ type: 'position', position: cached })
  }, [scrollCacheKey])

  useLayoutEffect(() => {
    if (!pendingScrollCommentId) {
      return
    }
    for (const file of files) {
      const comment = file.comments?.find((entry) => entry.id === pendingScrollCommentId)
      if (!comment) {
        continue
      }
      // Why: the annotation may sit outside the virtual window, so scroll by
      // line through CodeView instead of hunting for a mounted DOM node.
      handleRef.current?.scrollTo({
        type: 'line',
        id: file.source.key,
        lineNumber: comment.lineNumber,
        side: 'additions',
        align: 'center'
      })
      onPendingScrollConsumed?.()
      return
    }
  }, [files, onPendingScrollConsumed, pendingScrollCommentId])

  const handleCopy = useCallback(() => {
    const selectedText = window.getSelection()?.toString() ?? ''
    if (selectedText) {
      void window.api.ui.writeClipboardText(selectedText)
      return
    }
    const hovered = hoveredLineRef.current
    const target = hovered ? fileById.get(hovered.itemId) : undefined
    if (!hovered || !target) {
      return
    }
    const source =
      hovered.side === 'deletions' ? target.source.originalContent : target.source.modifiedContent
    const line = source.split(/\r\n?|\n/u)[hovered.lineNumber - 1]
    if (line !== undefined) {
      void window.api.ui.writeClipboardText(line)
    }
  }, [fileById])

  const handleSelectAll = useCallback(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(container)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [])

  return (
    <DiffCodeViewEditProvider>
      <ContextMenu
        onOpenChange={(open) => {
          if (open) {
            window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
          }
        }}
      >
        <ContextMenuTrigger
          render={
            <CodeView<DiffCodeViewAnnotation>
              ref={handleRef}
              containerRef={containerRef}
              items={items}
              options={options}
              renderAnnotation={renderAnnotation}
              onItemEditComplete={handleItemEditComplete}
              renderCustomHeader={renderFileHeader ? renderCustomHeader : undefined}
              onScroll={handleScroll}
              className={className}
              style={style}
            />
          }
        />
        <ContextMenuContent className="w-56" finalFocus={false}>
          <ContextMenuItem onClick={handleCopy}>
            <Copy />
            {translate('auto.components.editor.PierreDiffViewer.copy', 'Copy')}
            <ContextMenuShortcut>{formatNativeShortcut(isMac, 'C')}</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleSelectAll}>
            <SelectionAll />
            {translate('auto.components.editor.PierreDiffViewer.selectAll', 'Select all')}
            <ContextMenuShortcut>{formatNativeShortcut(isMac, 'A')}</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </DiffCodeViewEditProvider>
  )
}
