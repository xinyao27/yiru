import React from 'react'
import { lazyWithRetry as lazy } from '~renderer/application-shell/lazy-with-retry'
import { translate } from '~renderer/i18n/i18n'

import { ChangesModeView } from './changes-mode-view'
import { ConflictBanner, ConflictPlaceholderView } from './conflict-components'
import {
  FrontMatterBanner,
  FileLoadErrorView,
  getMarkdownSourceLineOffset,
  matchesPendingEditorReveal,
  noopEditorContentChange,
  noopEditorSave
} from './content-foundation'
import type { EditorRenderContext, FileContent } from './content-types'
import { ExternalFileChangeBanner } from './external-file-change-banner'
import { extractFrontMatter, prependFrontMatter } from './markdown-frontmatter'
import { getMarkdownRenderMode } from './markdown-render-mode'
import { getMarkdownRichModeUnsupportedMessage } from './markdown-rich-mode'
import { exceedsMarkdownRichModeSizeLimit } from './markdown-rich-size-limit'
import { RichMarkdownErrorBoundary } from './rich-markdown/error-boundary'

const FileCodeView = lazy(() => import('./file-code-view'))
const RichMarkdownEditor = lazy(() => import('./rich-markdown/editor'))
const MarkdownPreview = lazy(() => import('./markdown-preview'))
const ImageViewer = lazy(() => import('./image-viewer'))
const FilePreviewViewer = lazy(() => import('./file-preview-viewer'))
const MermaidViewer = lazy(() => import('./mermaid-viewer'))
const CsvViewer = lazy(() => import('./csv-viewer'))
const IpynbViewer = lazy(() => import('./ipynb-viewer'))

function renderMonacoEditor(
  context: EditorRenderContext,
  fileContent: FileContent
): React.JSX.Element {
  const {
    activeFile,
    codeLanguage,
    editBuffers,
    editorViewStateKey,
    handleContentChange,
    handleSave,
    isMarkdown,
    markdown,
    pendingEditorReveal,
    viewStateScopeId
  } = context

  // Why: keying on pane and path forces the retained Monaco model to snapshot
  // the old path before the next file mounts in the same split pane.
  return (
    <FileCodeView
      key={`${viewStateScopeId}\u0000${activeFile.filePath}`}
      fileId={activeFile.id}
      filePath={activeFile.filePath}
      viewStateKey={editorViewStateKey}
      relativePath={activeFile.relativePath}
      content={editBuffers[activeFile.id] ?? fileContent.content}
      language={codeLanguage}
      readOnly={activeFile.readOnly === true}
      liveTail={activeFile.liveTail === true}
      onContentChange={activeFile.readOnly === true ? noopEditorContentChange : handleContentChange}
      onSave={
        activeFile.readOnly === true ? noopEditorSave : isMarkdown ? markdown.mdSave : handleSave
      }
      worktreeId={activeFile.worktreeId}
      revealLine={
        matchesPendingEditorReveal(pendingEditorReveal, activeFile)
          ? pendingEditorReveal.line
          : undefined
      }
    />
  )
}

function renderMarkdownContent(
  context: EditorRenderContext,
  fileContent: FileContent
): React.JSX.Element {
  const {
    activeFile,
    editBuffers,
    editorViewStateKey,
    handleContentChange,
    handleDirtyStateHint,
    markdown,
    markdownAnnotationsEnabled,
    mdViewMode,
    onCloseMarkdownTableOfContents,
    showMarkdownFrontmatter,
    showMarkdownTableOfContents,
    viewStateScopeId
  } = context
  const currentContent = editBuffers[activeFile.id] ?? fileContent.content
  const richModeUnsupportedMessage = getMarkdownRichModeUnsupportedMessage(currentContent)
  const renderMode = getMarkdownRenderMode({
    exceedsRichModeSizeLimit: exceedsMarkdownRichModeSizeLimit(currentContent),
    hasRichModeUnsupportedContent: richModeUnsupportedMessage !== null,
    viewMode: mdViewMode
  })

  if (activeFile.conflict?.conflictStatus === 'unresolved') {
    return <div className="h-full min-h-0">{renderMonacoEditor(context, fileContent)}</div>
  }

  if (renderMode === 'source' && mdViewMode === 'rich') {
    const richFallbackMessage =
      richModeUnsupportedMessage ??
      'File is too large for rich editing. Showing source mode instead.'
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-border/60 border-b bg-blue-500/10 px-3 py-2 text-xs text-blue-950 dark:text-blue-100">
          {richFallbackMessage}
        </div>
        <div className="h-full min-h-0 flex-1">{renderMonacoEditor(context, fileContent)}</div>
      </div>
    )
  }

  if (renderMode === 'rich-editor') {
    // Why: Tiptap has no front-matter node. Preserve the raw block outside the
    // editor and recombine it into every change/save sent to the state owner.
    const frontMatter = extractFrontMatter(currentContent)
    const editorContent = frontMatter ? frontMatter.body : currentContent
    const onContentChange = frontMatter
      ? (body: string): void => handleContentChange(prependFrontMatter(frontMatter.raw, body))
      : handleContentChange
    const onSave = frontMatter
      ? (body: string): Promise<void> => markdown.mdSave(prependFrontMatter(frontMatter.raw, body))
      : markdown.mdSave

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <RichMarkdownErrorBoundary key={viewStateScopeId} fileId={activeFile.id}>
            <RichMarkdownEditor
              fileId={activeFile.id}
              content={editorContent}
              filePath={activeFile.filePath}
              worktreeId={activeFile.worktreeId}
              runtimeEnvironmentId={activeFile.runtimeEnvironmentId}
              scrollCacheKey={`${editorViewStateKey}:rich`}
              onContentChange={onContentChange}
              onDirtyStateHint={handleDirtyStateHint}
              onSave={onSave}
              onOpenDocLink={markdown.onOpenDocLink}
              markdownDocuments={markdown.markdownDocuments}
              showTableOfContents={showMarkdownTableOfContents}
              onCloseTableOfContents={onCloseMarkdownTableOfContents}
              markdownAnnotationsEnabled={markdownAnnotationsEnabled}
              markdownAnnotationFilePath={activeFile.relativePath}
              markdownSourceLineOffset={
                frontMatter ? getMarkdownSourceLineOffset(frontMatter.raw) : 0
              }
              markdownReviewContent={currentContent}
              headerSlot={
                frontMatter && showMarkdownFrontmatter ? (
                  <FrontMatterBanner raw={frontMatter.raw} />
                ) : null
              }
            />
          </RichMarkdownErrorBoundary>
        </div>
      </div>
    )
  }

  if (renderMode === 'preview') {
    const shouldExplainRichFallback = mdViewMode === 'rich' && richModeUnsupportedMessage
    return (
      <div className="flex h-full min-h-0 flex-col">
        {shouldExplainRichFallback ? (
          <div className="border-border/60 border-b bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
            {richModeUnsupportedMessage}
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          <MarkdownPreview
            key={viewStateScopeId}
            content={currentContent}
            filePath={activeFile.filePath}
            sourceFileId={activeFile.id}
            sourceWorktreeId={activeFile.worktreeId}
            sourceRuntimeEnvironmentId={activeFile.runtimeEnvironmentId}
            scrollCacheKey={`${editorViewStateKey}:preview`}
            showTableOfContents={showMarkdownTableOfContents}
            onCloseTableOfContents={onCloseMarkdownTableOfContents}
            markdownAnnotationsEnabled={markdownAnnotationsEnabled}
            {...markdown.previewProps}
          />
        </div>
      </div>
    )
  }

  return <div className="h-full min-h-0">{renderMonacoEditor(context, fileContent)}</div>
}

export function renderEditorEditMode(context: EditorRenderContext): React.JSX.Element {
  const {
    activeConflictEntry,
    activeFile,
    codeLanguage,
    diffContents,
    diffViewStateKey,
    editBuffers,
    editorViewStateKey,
    fileContents,
    getConflictNavigation,
    handleContentChange,
    handleDirtyStateHint,
    handleSave,
    isChangesMode,
    isCsv,
    isMarkdown,
    isMermaid,
    isNotebook,
    markdown,
    mdViewMode,
    reloadContent,
    sideBySide,
    viewStateScopeId
  } = context

  if (activeFile.conflict?.kind === 'conflict-placeholder') {
    return <ConflictPlaceholderView file={activeFile} />
  }
  const fileContent = fileContents[activeFile.id]
  if (!fileContent) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {translate('auto.components.editor.EditorContent.b2735221f5', 'Loading...')}
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
  if (fileContent.preview) {
    return (
      <FilePreviewViewer
        key={`${activeFile.id}\0${activeFile.filePath}`}
        file={activeFile}
        preview={fileContent.preview}
      />
    )
  }
  if (fileContent.isBinary) {
    if (fileContent.isImage) {
      return (
        <ImageViewer
          content={fileContent.content}
          filePath={activeFile.filePath}
          mimeType={fileContent.mimeType}
        />
      )
    }
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {translate(
          'auto.components.editor.EditorContent.b9de81ba52',
          'Binary file — cannot display'
        )}
      </div>
    )
  }

  const externalChangeBanner =
    activeFile.externalMutation === 'changed' ? (
      <ExternalFileChangeBanner
        file={activeFile}
        currentContent={editBuffers[activeFile.id] ?? fileContent.content}
        reloadContent={reloadContent}
      />
    ) : null
  if (isChangesMode) {
    const changesView = (
      <ChangesModeView
        activeFile={activeFile}
        dc={diffContents[activeFile.id]}
        modifiedContent={editBuffers[activeFile.id] ?? fileContent.content}
        activeConflictEntry={activeConflictEntry}
        resolvedLanguage={codeLanguage}
        sideBySide={sideBySide}
        viewStateScopeId={viewStateScopeId}
        diffViewStateKey={diffViewStateKey}
        onContentChange={handleContentChange}
        onSave={isMarkdown ? markdown.mdSave : handleSave}
      />
    )
    return externalChangeBanner ? (
      <div className="flex min-h-0 flex-1 flex-col">
        {externalChangeBanner}
        <div className="min-h-0 flex-1">{changesView}</div>
      </div>
    ) : (
      changesView
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {externalChangeBanner}
      {activeFile.conflict && (
        <ConflictBanner
          file={activeFile}
          entry={activeConflictEntry}
          conflictNavigation={getConflictNavigation(
            activeFile,
            editBuffers[activeFile.id] ?? fileContent.content
          )}
        />
      )}
      <div className="relative min-h-0 flex-1">
        {isMarkdown ? (
          renderMarkdownContent(context, fileContent)
        ) : isMermaid && mdViewMode === 'rich' ? (
          <MermaidViewer
            key={activeFile.id}
            content={editBuffers[activeFile.id] ?? fileContent.content}
            filePath={activeFile.filePath}
          />
        ) : isCsv && mdViewMode === 'rich' ? (
          <CsvViewer
            key={activeFile.id}
            content={editBuffers[activeFile.id] ?? fileContent.content}
            filePath={activeFile.filePath}
          />
        ) : isNotebook && mdViewMode === 'rich' ? (
          <IpynbViewer
            key={activeFile.id}
            content={editBuffers[activeFile.id] ?? fileContent.content}
            fileId={activeFile.id}
            filePath={activeFile.filePath}
            worktreeId={activeFile.worktreeId}
            scrollCacheKey={`${editorViewStateKey}:notebook`}
            onContentChange={handleContentChange}
            onDirtyStateHint={handleDirtyStateHint}
            onSave={handleSave}
          />
        ) : (
          renderMonacoEditor(context, fileContent)
        )}
      </div>
    </div>
  )
}
