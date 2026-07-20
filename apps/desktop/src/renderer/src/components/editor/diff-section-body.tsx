import { DiffEditor, type DiffOnMount } from '@monaco-editor/react'
import { WarningCircle as AlertCircle } from '@phosphor-icons/react'
import type { RefObject } from 'react'

import { ArrowClockwise as RefreshCw } from '@/components/regular-icons'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { resolveCursorThemeName } from '@/lib/monaco-setup'

import { DiffCommentPopover } from '../diff-comments/diff-comment-popover'
import { combinedDiffSectionScrollbarOptions } from './diff-editor-scrollbar-options'
import { buildDiffEditorWordWrapOptions } from './diff-editor-word-wrap-options'
import type { DiffSection } from './diff-section-types'
import { LargeDiffFallback } from './large-diff-fallback'
import { PierreDiffViewer } from './pierre-diff-viewer'
import type { PierreDiffSectionCommentProps } from './use-diff-section-comment-actions'

const ImageDiffViewer = lazy(() => import('./image-diff-viewer'))

type DiffSectionBodyProps = {
  section: DiffSection
  index: number
  sectionBodyRef: RefObject<HTMLDivElement | null>
  sectionBodyHeight: number | undefined
  useIntrinsicImageHeight: boolean
  popover: {
    lineNumber: number
    startLine?: number
    top: number
    left?: number
    lineHeight: number
  } | null
  addLineCommentPlaceholder?: string
  addLineCommentLabel?: string
  isBranchMode: boolean
  sideBySide: boolean
  isDark: boolean
  language: string
  modelPathBase: string
  isEditable: boolean
  diffEditorFontSize: number
  diffWordWrap?: boolean
  terminalFontFamily?: string
  onCancelComment: () => void
  onSubmitComment: (body: string) => Promise<void>
  onRetrySection: (index: number) => void
  onSaveLimitedDiff: () => void
  onMount: DiffOnMount
  pierreCommentProps: PierreDiffSectionCommentProps
}

export function DiffSectionBody({
  section,
  index,
  sectionBodyRef,
  sectionBodyHeight,
  useIntrinsicImageHeight,
  popover,
  addLineCommentPlaceholder,
  addLineCommentLabel,
  isBranchMode,
  sideBySide,
  isDark,
  language,
  modelPathBase,
  isEditable,
  diffEditorFontSize,
  diffWordWrap,
  terminalFontFamily,
  onCancelComment,
  onSubmitComment,
  onRetrySection,
  onSaveLimitedDiff,
  onMount,
  pierreCommentProps
}: DiffSectionBodyProps): React.JSX.Element {
  const renderLimit = section.largeDiffRenderLimit?.limited ? section.largeDiffRenderLimit : null

  return (
    <div
      ref={sectionBodyRef}
      className={cn('relative', useIntrinsicImageHeight && 'overflow-visible')}
      style={sectionBodyHeight === undefined ? undefined : { height: sectionBodyHeight }}
    >
      {popover && !renderLimit?.limited ? (
        // Why: key by lineNumber so the popover remounts when the anchor
        // line changes instead of leaking draft state across lines.
        <DiffCommentPopover
          key={popover.lineNumber}
          lineNumber={popover.lineNumber}
          startLine={popover.startLine}
          top={popover.top}
          left={popover.left}
          lineHeight={popover.lineHeight}
          placeholder={addLineCommentPlaceholder}
          submitLabel={addLineCommentLabel}
          submittingLabel="Posting…"
          onCancel={onCancelComment}
          onSubmit={onSubmitComment}
        />
      ) : null}
      {section.loading ? (
        <div className="bg-muted/10 text-muted-foreground flex h-full items-center gap-2 px-3 text-[11px]">
          <span className="bg-muted-foreground/50 h-1.5 w-1.5 rounded-full" />
          <span>
            {translate('auto.components.editor.DiffSectionBody.f5cf81cec2', 'Loading diff...')}
          </span>
        </div>
      ) : section.error ? (
        <div className="bg-muted/10 text-muted-foreground flex h-full items-center justify-between gap-3 px-3 text-[11px]">
          <div className="flex min-w-0 items-center gap-2">
            <AlertCircle className="text-destructive size-3.5 shrink-0" />
            <span className="truncate">{section.error}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-6 shrink-0 px-2 text-[11px]"
            onClick={(event) => {
              event.stopPropagation()
              onRetrySection(index)
            }}
          >
            <RefreshCw className="size-3" />
            {translate('auto.components.editor.DiffSectionBody.cef4cf0ff5', 'Retry')}
          </Button>
        </div>
      ) : section.diffResult?.kind === 'binary' ? (
        section.diffResult.isImage ? (
          <ImageDiffViewer
            originalContent={section.diffResult.originalContent}
            modifiedContent={section.diffResult.modifiedContent}
            filePath={section.path}
            mimeType={section.diffResult.mimeType}
            sideBySide={sideBySide}
            layout={useIntrinsicImageHeight ? 'intrinsic' : 'fill'}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="space-y-2">
              <div className="text-foreground text-sm font-medium">
                {translate(
                  'auto.components.editor.DiffSectionBody.35d6afb5be',
                  'Binary file changed'
                )}
              </div>
              <div className="text-muted-foreground text-xs">
                {isBranchMode
                  ? translate(
                      'auto.components.editor.DiffSectionBody.7ce8436458',
                      'Text diff is unavailable for this file in branch compare.'
                    )
                  : translate(
                      'auto.components.editor.DiffSectionBody.72f71f52eb',
                      'Text diff is unavailable for this file.'
                    )}
              </div>
            </div>
          </div>
        )
      ) : renderLimit?.limited ? (
        <LargeDiffFallback
          filePath={section.path}
          renderLimit={renderLimit}
          action={
            isEditable && section.dirty
              ? {
                  label: translate('auto.components.editor.DiffSectionBody.b5675b0694', 'Save'),
                  description: translate(
                    'auto.components.editor.DiffSectionBody.593f2193f6',
                    'This draft crossed the safe display limit, but it can still be saved.'
                  ),
                  onClick: onSaveLimitedDiff
                }
              : undefined
          }
        />
      ) : !isEditable ? (
        <PierreDiffViewer
          modelKey={modelPathBase}
          originalContent={section.originalContent}
          modifiedContent={section.modifiedContent}
          filePath={section.path}
          relativePath={section.path}
          language={language}
          sideBySide={sideBySide}
          isDark={isDark}
          fontSize={diffEditorFontSize}
          fontFamily={terminalFontFamily}
          wordWrap={diffWordWrap}
          worktreeId={pierreCommentProps.worktreeId}
          comments={pierreCommentProps.comments}
          commentableLineNumbers={pierreCommentProps.commentableLineNumbers}
          addLineCommentLabel={addLineCommentLabel}
          addLineCommentPlaceholder={addLineCommentPlaceholder}
          onAddLineComment={pierreCommentProps.onAddLineComment}
          onDeleteComment={pierreCommentProps.onDeleteComment}
          onUpdateComment={pierreCommentProps.onUpdateComment}
          pendingScrollCommentId={pierreCommentProps.pendingScrollCommentId}
          onPendingScrollConsumed={pierreCommentProps.onPendingScrollCommentConsumed}
          onHeightChange={pierreCommentProps.onHeightChange}
        />
      ) : (
        <DiffEditor
          height="100%"
          language={language}
          original={section.originalContent}
          modified={section.modifiedContent}
          theme={resolveCursorThemeName(isDark)}
          onMount={onMount}
          // Why: @monaco-editor/react can dispose models before widget teardown.
          // Keep them through unmount and dispose unattached models next tick.
          originalModelPath={`${modelPathBase}:original`}
          modifiedModelPath={`${modelPathBase}:modified`}
          keepCurrentOriginalModel
          keepCurrentModifiedModel
          options={{
            readOnly: !isEditable,
            originalEditable: false,
            renderSideBySide: sideBySide,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: diffEditorFontSize,
            fontFamily: terminalFontFamily || 'monospace',
            lineNumbers: 'on',
            ...buildDiffEditorWordWrapOptions(diffWordWrap),
            automaticLayout: true,
            renderOverviewRuler: false,
            scrollbar: combinedDiffSectionScrollbarOptions,
            hideUnchangedRegions: { enabled: true },
            find: {
              addExtraSpaceOnTop: false,
              autoFindInSelection: 'never',
              seedSearchStringFromSelection: 'never'
            }
          }}
        />
      )}
    </div>
  )
}
