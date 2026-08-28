import React from 'react'
import { lazyWithRetry as lazy } from '~renderer/application-shell/lazy-with-retry'
import { translate } from '~renderer/i18n/i18n'

import type { EditorRenderContext } from './content-types'
import { getDiffContentSignature } from './diff-content-signature'
import { ExternalFileChangeBanner } from './external-file-change-banner'

const DiffViewer = lazy(() => import('./diff-viewer'))
const ImageDiffViewer = lazy(() => import('./image-diff-viewer'))
const MarkdownPreview = lazy(() => import('./markdown-preview'))

export function renderEditorDiffMode(context: EditorRenderContext): React.JSX.Element {
  const {
    activeFile,
    codeLanguage,
    diffContents,
    diffViewStateKey,
    editBuffers,
    handleContentChange,
    handleSave,
    isMarkdown,
    markdown,
    markdownAnnotationsEnabled,
    mdViewMode,
    onCloseMarkdownTableOfContents,
    reloadContent,
    showMarkdownTableOfContents,
    sideBySide,
    viewStateScopeId
  } = context
  const diffContent = diffContents[activeFile.id]
  if (!diffContent) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {translate('auto.components.editor.EditorContent.c88c73a0d3', 'Loading diff...')}
      </div>
    )
  }
  const isEditable = activeFile.diffSource === 'unstaged'
  if (diffContent.kind === 'binary') {
    if (diffContent.isImage) {
      return (
        <ImageDiffViewer
          originalContent={diffContent.originalContent}
          modifiedContent={diffContent.modifiedContent}
          filePath={activeFile.relativePath}
          mimeType={diffContent.mimeType}
          sideBySide={sideBySide}
        />
      )
    }
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="space-y-2">
          <div className="text-foreground text-sm font-medium">
            {translate('auto.components.editor.EditorContent.78541e254e', 'Binary file changed')}
          </div>
          <div className="text-muted-foreground text-xs">
            {activeFile.diffSource === 'branch'
              ? translate(
                  'auto.components.editor.EditorContent.3c6e71df22',
                  'Text diff is unavailable for this file in branch compare.'
                )
              : translate(
                  'auto.components.editor.EditorContent.8a0898ae4c',
                  'Text diff is unavailable for this file.'
                )}
          </div>
        </div>
      </div>
    )
  }

  const modifiedBuffer = editBuffers[activeFile.id]
  const modifiedContent = modifiedBuffer ?? diffContent.modifiedContent
  const canSaveLargeDiff = !(
    diffContent.largeDiffRenderLimit?.limited === true &&
    modifiedBuffer === undefined &&
    diffContent.modifiedContent.length === 0
  )
  const externalChangeBanner =
    activeFile.externalMutation === 'changed' ? (
      <ExternalFileChangeBanner
        file={activeFile}
        currentContent={modifiedContent}
        reloadContent={reloadContent}
      />
    ) : null

  if (
    isMarkdown &&
    mdViewMode === 'preview' &&
    diffContent.largeDiffRenderLimit?.limited !== true
  ) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {externalChangeBanner}
        <div className="border-border/60 bg-muted/40 text-muted-foreground border-b px-3 py-2 text-xs">
          {translate(
            'auto.components.editor.EditorContent.9640d1d3db',
            'Previewing the modified version of this diff. Switch to source mode to inspect changes.'
          )}
        </div>
        <div className="min-h-0 flex-1">
          <MarkdownPreview
            key={viewStateScopeId}
            content={modifiedContent}
            filePath={activeFile.filePath}
            sourceFileId={activeFile.id}
            sourceWorktreeId={activeFile.worktreeId}
            sourceRuntimeEnvironmentId={activeFile.runtimeEnvironmentId}
            scrollCacheKey={`${diffViewStateKey}:preview`}
            showTableOfContents={showMarkdownTableOfContents}
            onCloseTableOfContents={onCloseMarkdownTableOfContents}
            markdownAnnotationsEnabled={markdownAnnotationsEnabled}
            {...markdown.previewProps}
          />
        </div>
      </div>
    )
  }

  // Why: rotate fetched model identities, not the live edit buffer, so reloads
  // replace stale blobs without destroying the editable diff's undo history.
  const reloadNonce = activeFile.diffContentReloadNonce ?? 0
  const originalModelKey = `${diffViewStateKey}:original:${getDiffContentSignature(diffContent.originalContent)}`
  const modifiedModelKey = `${diffViewStateKey}:modified:${getDiffContentSignature(diffContent.modifiedContent)}:${reloadNonce}`
  const diffViewer = (
    <DiffViewer
      key={`${viewStateScopeId}:${reloadNonce}:${getDiffContentSignature(diffContent.modifiedContent)}`}
      fileId={activeFile.id}
      modelKey={diffViewStateKey}
      originalModelKey={originalModelKey}
      modifiedModelKey={modifiedModelKey}
      originalContent={diffContent.originalContent}
      modifiedContent={modifiedContent}
      largeDiffRenderLimit={diffContent.largeDiffRenderLimit}
      largeDiffSaveContentAvailable={canSaveLargeDiff}
      language={codeLanguage}
      filePath={activeFile.filePath}
      relativePath={activeFile.relativePath}
      sideBySide={sideBySide}
      editable={isEditable}
      worktreeId={activeFile.worktreeId}
      onContentChange={isEditable ? handleContentChange : undefined}
      onSave={isEditable ? (isMarkdown ? markdown.mdSave : handleSave) : undefined}
    />
  )
  if (!externalChangeBanner) {
    return diffViewer
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      {externalChangeBanner}
      <div className="flex min-h-0 flex-1 flex-col">{diffViewer}</div>
    </div>
  )
}
