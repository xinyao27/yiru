import { useCallback, useMemo } from 'react'
import { isDiffComment } from '~renderer/components/editor/diff-comment-compat'
import { resolveDocumentTheme } from '~renderer/components/editor/document-theme'
import { resolveEditorFontFamily } from '~renderer/components/editor/font-family'
import { computeDiffEditorFontSize } from '~renderer/components/editor/font-zoom'
import { useAppStore } from '~renderer/store'
import { selectWorktreeDiffComments } from '~renderer/store/worktree-diff-comments-selector'
import type { DiffComment } from '~shared/types'

import { DiffCodeView, type DiffCodeViewFile } from './diff-code-view/view'
import { getDiffViewerLargeDiffSaveAction } from './diff-viewer-large-diff-save-action'
import type { DiffViewerProps } from './diff-viewer-props'
import { LargeDiffFallback } from './large-diff-fallback'
import { getLargeDiffRenderLimit } from './large-diff-render-limit'

export function PierreReadonlyDiffViewer(props: DiffViewerProps): React.JSX.Element {
  const { onAddLineComment, relativePath, worktreeId } = props
  const settings = useAppStore((state) => state.settings)
  const editorFontZoomLevel = useAppStore((state) => state.editorFontZoomLevel)
  const addDiffComment = useAppStore((state) => state.addDiffComment)
  const deleteDiffComment = useAppStore((state) => state.deleteDiffComment)
  const updateDiffComment = useAppStore((state) => state.updateDiffComment)
  const scrollToDiffCommentId = useAppStore((state) => state.scrollToDiffCommentId)
  const setScrollToDiffCommentId = useAppStore((state) => state.setScrollToDiffCommentId)
  const allDiffComments = useAppStore((state): DiffComment[] | undefined =>
    selectWorktreeDiffComments(state, worktreeId)
  )
  const comments = useMemo(
    () =>
      (allDiffComments ?? []).filter(
        (comment) => comment.filePath === relativePath && isDiffComment(comment)
      ),
    [allDiffComments, relativePath]
  )
  const renderLimit = useMemo(
    () =>
      props.largeDiffRenderLimit ??
      getLargeDiffRenderLimit({
        originalContent: props.originalContent,
        modifiedContent: props.modifiedContent
      }),
    [props.largeDiffRenderLimit, props.modifiedContent, props.originalContent]
  )
  const isDark = resolveDocumentTheme(settings?.theme ?? 'system')
  const fontSize = computeDiffEditorFontSize(settings?.terminalFontSize ?? 13, editorFontZoomLevel)

  const handleAddLineComment = useCallback(
    async (args: { lineNumber: number; startLine?: number; body: string }) => {
      if (onAddLineComment) {
        return onAddLineComment(args)
      }
      if (!worktreeId) {
        return false
      }
      const result = await addDiffComment({
        worktreeId,
        filePath: relativePath,
        source: 'diff',
        startLine: args.startLine,
        lineNumber: args.lineNumber,
        body: args.body,
        side: 'modified'
      })
      return Boolean(result)
    },
    [addDiffComment, onAddLineComment, relativePath, worktreeId]
  )

  const onSave = props.onSave
  const handleFileEditComplete = useCallback(
    (_fileKey: string, contents: string) => {
      onSave?.(contents)
    },
    [onSave]
  )
  const files = useMemo<DiffCodeViewFile[]>(
    () => [
      {
        source: {
          key: props.modelKey,
          path: relativePath,
          // Why: the standalone viewer always renders a two-sided diff of one
          // file, so the change type is a plain modification.
          status: 'modified',
          originalContent: props.originalContent,
          modifiedContent: props.modifiedContent,
          language: props.language
        },
        comments,
        commentableLineNumbers: props.commentableLineNumbers,
        editable: props.editable === true
      }
    ],
    [
      comments,
      props.commentableLineNumbers,
      props.editable,
      props.language,
      props.modelKey,
      props.modifiedContent,
      props.originalContent,
      relativePath
    ]
  )
  const render = useMemo(
    () => ({
      isDark,
      sideBySide: props.sideBySide,
      wordWrap: settings?.diffWordWrap === true,
      disableFileHeader: true
    }),
    [isDark, props.sideBySide, settings?.diffWordWrap]
  )
  const font = useMemo(
    () => ({ fontSize, fontFamily: resolveEditorFontFamily(settings) }),
    [fontSize, settings]
  )

  if (renderLimit.limited) {
    return (
      <LargeDiffFallback
        filePath={relativePath}
        renderLimit={renderLimit}
        action={getDiffViewerLargeDiffSaveAction({
          editable: false,
          modifiedContent: props.modifiedContent,
          onSave: props.onSave,
          saveContentAvailable: props.largeDiffSaveContentAvailable
        })}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DiffCodeView
        files={files}
        render={render}
        font={font}
        scrollCacheKey={props.modelKey}
        className="scrollbar-editor bg-background h-full min-h-0 overflow-x-hidden overflow-y-auto"
        worktreeId={worktreeId}
        addLineCommentLabel={props.addLineCommentLabel}
        addLineCommentPlaceholder={props.addLineCommentPlaceholder}
        onAddLineComment={
          worktreeId || onAddLineComment ? (_path, args) => handleAddLineComment(args) : undefined
        }
        onDeleteComment={
          worktreeId
            ? (commentId) => {
                void deleteDiffComment(worktreeId, commentId)
              }
            : undefined
        }
        onUpdateComment={
          worktreeId
            ? (commentId, body) => updateDiffComment(worktreeId, commentId, body)
            : undefined
        }
        pendingScrollCommentId={
          comments.some((comment) => comment.id === scrollToDiffCommentId)
            ? scrollToDiffCommentId
            : null
        }
        onFileEditComplete={handleFileEditComplete}
        onPendingScrollConsumed={() => setScrollToDiffCommentId(null)}
      />
    </div>
  )
}
