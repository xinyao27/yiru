import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { lazyWithRetry as lazy } from '~renderer/lib/lazy-with-retry'

import { CheckRunDetailsPanel } from './check-run-details-panel'
import { renderConflictReview } from './content-conflict-review'
import { FileLoadErrorView } from './content-foundation'
import type { EditorRenderContext } from './content-types'

const CombinedDiffViewer = lazy(() => import('./combined-diff/viewer'))
const MarkdownPreview = lazy(() => import('./markdown-preview'))

export function renderEditorSpecialMode(context: EditorRenderContext): React.JSX.Element {
  const {
    activeFile,
    editBuffers,
    fileContents,
    markdown,
    markdownAnnotationsEnabled,
    markdownPreviewViewStateKey,
    onCloseMarkdownTableOfContents,
    reloadContent,
    reloadOpenCheckRunDetailsTab,
    showMarkdownTableOfContents,
    viewStateScopeId
  } = context

  if (activeFile.mode === 'check-details') {
    const checkRunDetails = activeFile.checkRunDetails
    if (!checkRunDetails) {
      return (
        <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
          {translate(
            'auto.components.editor.EditorContent.6c4f1a8d2e',
            'Check details are unavailable.'
          )}
        </div>
      )
    }
    const details = checkRunDetails.details
    return (
      <CheckRunDetailsPanel
        check={checkRunDetails.check}
        details={details}
        loading={checkRunDetails.loading}
        error={checkRunDetails.error}
        openUrl={details?.detailsUrl ?? details?.url ?? checkRunDetails.check.url}
        worktreeId={activeFile.worktreeId}
        onRefresh={() => {
          void reloadOpenCheckRunDetailsTab(activeFile.id)
        }}
      />
    )
  }

  if (activeFile.mode === 'conflict-review') {
    return renderConflictReview(context)
  }

  if (context.isCombinedDiff) {
    return (
      <CombinedDiffViewer
        key={viewStateScopeId}
        file={activeFile}
        viewStateKey={context.diffViewStateKey}
      />
    )
  }

  const fileContent = fileContents[activeFile.id]
  if (!fileContent) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {translate('auto.components.editor.EditorContent.37a0e81fa6', 'Loading preview...')}
      </div>
    )
  }
  if (fileContent.loadError) {
    return (
      <FileLoadErrorView
        message={fileContent.loadError}
        onRetry={() => reloadContent(activeFile)}
      />
    )
  }
  if (fileContent.isBinary) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
        {translate(
          'auto.components.editor.EditorContent.8608ce4cb1',
          'Markdown preview is unavailable for binary files.'
        )}
      </div>
    )
  }
  const sourceFileId = activeFile.markdownPreviewSourceFileId ?? activeFile.filePath
  return (
    <div className="min-h-0 flex-1">
      <MarkdownPreview
        key={viewStateScopeId}
        content={editBuffers[sourceFileId] ?? fileContent.content}
        filePath={activeFile.filePath}
        sourceFileId={sourceFileId}
        sourceWorktreeId={activeFile.worktreeId}
        sourceRuntimeEnvironmentId={activeFile.runtimeEnvironmentId}
        scrollCacheKey={markdownPreviewViewStateKey}
        initialAnchor={activeFile.markdownPreviewAnchor ?? null}
        showTableOfContents={showMarkdownTableOfContents}
        onCloseTableOfContents={onCloseMarkdownTableOfContents}
        markdownAnnotationsEnabled={markdownAnnotationsEnabled}
        {...markdown.previewProps}
      />
    </div>
  )
}
