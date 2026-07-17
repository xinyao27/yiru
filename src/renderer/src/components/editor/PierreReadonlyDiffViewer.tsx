import { useCallback, useMemo } from 'react'
import { useAppStore } from '@/store'
import { selectWorktreeDiffComments } from '@/store/worktree-diff-comments-selector'
import { isDiffComment } from '@/lib/diff-comment-compat'
import { computeDiffEditorFontSize } from '@/lib/editor-font-zoom'
import { resolveDocumentTheme } from '@/lib/document-theme'
import type { DiffComment } from '../../../../shared/types'
import type { DiffViewerProps } from './diff-viewer-props'
import { getLargeDiffRenderLimit } from './large-diff-render-limit'
import { getDiffViewerLargeDiffSaveAction } from './diff-viewer-large-diff-save-action'
import { LargeDiffFallback } from './LargeDiffFallback'
import { PierreDiffViewer } from './PierreDiffViewer'

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
      <PierreDiffViewer
        modelKey={props.modelKey}
        originalContent={props.originalContent}
        modifiedContent={props.modifiedContent}
        filePath={props.filePath}
        relativePath={relativePath}
        language={props.language}
        sideBySide={props.sideBySide}
        isDark={isDark}
        fontSize={fontSize}
        fontFamily={settings?.terminalFontFamily}
        wordWrap={settings?.diffWordWrap}
        worktreeId={worktreeId}
        comments={comments}
        commentableLineNumbers={props.commentableLineNumbers}
        addLineCommentLabel={props.addLineCommentLabel}
        addLineCommentPlaceholder={props.addLineCommentPlaceholder}
        onAddLineComment={worktreeId || onAddLineComment ? handleAddLineComment : undefined}
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
        onPendingScrollConsumed={() => setScrollToDiffCommentId(null)}
      />
    </div>
  )
}
