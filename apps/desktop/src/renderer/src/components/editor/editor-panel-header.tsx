import {
  ArrowDown,
  ArrowUp,
  Columns as Columns2,
  Eye,
  FileText,
  TreeStructure as ListTree,
  Rows as Rows2
} from '@phosphor-icons/react'
import { useMemo } from 'react'

import { ShortcutKeyCombo } from '@/components/shortcut-key-combo'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useShortcutKeyDetails } from '@/hooks/use-shortcut-label'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { selectWorktreeDiffCommentsOrEmpty } from '@/store/worktree-diff-comments-selector'

import { useDiffNavigation } from './diff-navigation-context'
import { DiffNotesSendMenu } from './diff-notes-send-menu'
import type { EditorHeaderOpenFileState } from './editor-header'
import { EditorPanelHeaderPath } from './editor-panel-header-path'
import { EditorPanelMarkdownActionsMenu } from './editor-panel-markdown-actions-menu'
import EditorViewToggle, {
  CSV_VIEW_MODE_METADATA,
  NOTEBOOK_VIEW_MODE_METADATA
} from './editor-view-toggle'
import type { EditorToggleValue } from './editor-view-toggle'

type EditorPanelHeaderProps = {
  activeFile: OpenFile
  copiedPathVisible: boolean
  isSingleDiff: boolean
  isDiffSurface: boolean
  isMarkdown: boolean
  isCsv: boolean
  isNotebook: boolean
  hasEditorToggle: boolean
  availableEditorToggleModes: readonly EditorToggleValue[]
  effectiveToggleValue: EditorToggleValue
  canOpenPreviewToSide: boolean
  canShowMarkdownPreview: boolean
  canShowMarkdownTableOfContents: boolean
  isMarkdownTableOfContentsDisabled: boolean
  shouldShowMarkdownExportAction: boolean
  canExportMarkdownToPdf: boolean
  showMarkdownTableOfContents: boolean
  canShowMarkdownFrontmatterToggle: boolean
  markdownFrontmatterVisible: boolean
  sideBySide: boolean
  openFileState: EditorHeaderOpenFileState
  onCopyPath: () => void
  onOpenDiffTargetFile: (preferredMarkdownViewMode?: 'rich') => void
  onOpenPreviewToSide: () => void
  onOpenMarkdownPreview: () => void
  onOpenContainingFolder: () => void
  onToggleSideBySide: () => void
  onEditorToggleChange: (next: EditorToggleValue) => void
  onToggleMarkdownTableOfContents: () => void
  onToggleMarkdownFrontmatter: () => void
  onExportMarkdownToPdf: () => void
}

export function EditorPanelHeader({
  activeFile,
  copiedPathVisible,
  isSingleDiff,
  isDiffSurface,
  isMarkdown,
  isCsv,
  isNotebook,
  hasEditorToggle,
  availableEditorToggleModes,
  effectiveToggleValue,
  canOpenPreviewToSide,
  canShowMarkdownPreview,
  canShowMarkdownTableOfContents,
  isMarkdownTableOfContentsDisabled,
  shouldShowMarkdownExportAction,
  canExportMarkdownToPdf,
  showMarkdownTableOfContents,
  canShowMarkdownFrontmatterToggle,
  markdownFrontmatterVisible,
  sideBySide,
  openFileState,
  onCopyPath,
  onOpenDiffTargetFile,
  onOpenPreviewToSide,
  onOpenMarkdownPreview,
  onOpenContainingFolder,
  onToggleSideBySide,
  onEditorToggleChange,
  onToggleMarkdownTableOfContents,
  onToggleMarkdownFrontmatter,
  onExportMarkdownToPdf
}: EditorPanelHeaderProps): React.JSX.Element {
  const diffComments = useAppStore((s) =>
    selectWorktreeDiffCommentsOrEmpty(s, activeFile.worktreeId)
  )
  const activeGroupId = useAppStore((s) => s.activeGroupIdByWorktree[activeFile.worktreeId])
  const diffWordWrap = useAppStore((s) => s.settings?.diffWordWrap === true)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const fileDiffComments = useMemo(
    () => diffComments.filter((comment) => comment.filePath === activeFile.relativePath),
    [activeFile.relativePath, diffComments]
  )
  const { changeCount, goToPreviousDiff, goToNextDiff } = useDiffNavigation()
  const previousChangeShortcut = useShortcutKeyDetails('editor.previousChange')
  const nextChangeShortcut = useShortcutKeyDetails('editor.nextChange')

  return (
    <div className="editor-header">
      <EditorPanelHeaderPath
        activeFile={activeFile}
        copiedPathVisible={copiedPathVisible}
        canShowMarkdownPreview={canShowMarkdownPreview}
        onCopyPath={onCopyPath}
        onOpenMarkdownPreview={onOpenMarkdownPreview}
        onOpenContainingFolder={onOpenContainingFolder}
      />
      {canOpenPreviewToSide && (
        <TooltipProvider delay={300}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-foreground size-6 shrink-0 [&_svg]:size-3.5"
                  onClick={onOpenPreviewToSide}
                  aria-label={translate(
                    'auto.components.editor.EditorPanelHeader.fb8331694e',
                    'Open Preview to the Side'
                  )}
                >
                  <Eye size={14} />
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={4}>
              {translate(
                'auto.components.editor.EditorPanelHeader.fb8331694e',
                'Open Preview to the Side'
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {isSingleDiff && (
        <TooltipProvider delay={300}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-foreground size-6 shrink-0 [&_svg]:size-3.5"
                  onClick={() => onOpenDiffTargetFile(isMarkdown ? 'rich' : undefined)}
                  aria-label={translate(
                    'auto.components.editor.EditorPanelHeader.a10d9b8337',
                    'Open file'
                  )}
                  disabled={!openFileState.canOpen}
                >
                  <FileText size={14} />
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={4}>
              {openFileState.canOpen
                ? isMarkdown
                  ? translate(
                      'auto.components.editor.EditorPanelHeader.f0fd4174b5',
                      'Open file tab to use rich markdown editing'
                    )
                  : translate(
                      'auto.components.editor.EditorPanelHeader.9b80bbe1de',
                      'Open file tab'
                    )
                : translate(
                    'auto.components.editor.EditorPanelHeader.c98ce191da',
                    'This diff has no modified-side file to open'
                  )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {isSingleDiff && fileDiffComments.length > 0 && (
        <DiffNotesSendMenu
          worktreeId={activeFile.worktreeId}
          groupId={activeGroupId ?? activeFile.worktreeId}
          comments={diffComments}
          filePath={activeFile.relativePath}
          showFileScope
          triggerLabel="AI notes"
          triggerCount={fileDiffComments.length}
          triggerClassName="h-6 shrink-0 gap-1 rounded-full border border-border bg-muted px-2 text-[11px] font-medium leading-none text-foreground/80 hover:bg-accent hover:text-foreground"
          iconClassName="size-3"
        />
      )}
      {isDiffSurface && (
        // Why: the adjacent diff controls use the same tooltip timing, so they
        // share one provider instead of creating redundant Radix contexts.
        <TooltipProvider delay={300}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-foreground size-6 shrink-0 [&_svg]:size-3.5"
                  onClick={onToggleSideBySide}
                >
                  {sideBySide ? <Rows2 size={14} /> : <Columns2 size={14} />}
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={4}>
              {sideBySide
                ? translate(
                    'auto.components.editor.EditorPanelHeader.94756f08ba',
                    'Switch to inline diff'
                  )
                : translate(
                    'auto.components.editor.EditorPanelHeader.e836faacfa',
                    'Switch to side-by-side diff'
                  )}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-foreground size-6 shrink-0 [&_svg]:size-3.5"
                  onClick={goToPreviousDiff}
                  aria-label={translate(
                    'auto.components.editor.EditorPanelHeader.2076ecfc9c',
                    'Previous change'
                  )}
                  disabled={changeCount === 0}
                >
                  <ArrowUp size={14} />
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={4}>
              {translate('auto.components.editor.EditorPanelHeader.2076ecfc9c', 'Previous change')}
              {previousChangeShortcut.keys.length > 0 && (
                <ShortcutKeyCombo
                  keys={previousChangeShortcut.keys}
                  doubleTap={previousChangeShortcut.doubleTap}
                  className="ml-1.5"
                />
              )}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-foreground size-6 shrink-0 [&_svg]:size-3.5"
                  onClick={goToNextDiff}
                  aria-label={translate(
                    'auto.components.editor.EditorPanelHeader.631dab0df3',
                    'Next change'
                  )}
                  disabled={changeCount === 0}
                >
                  <ArrowDown size={14} />
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={4}>
              {translate('auto.components.editor.EditorPanelHeader.631dab0df3', 'Next change')}
              {nextChangeShortcut.keys.length > 0 && (
                <ShortcutKeyCombo
                  keys={nextChangeShortcut.keys}
                  doubleTap={nextChangeShortcut.doubleTap}
                  className="ml-1.5"
                />
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {hasEditorToggle && (
        <EditorViewToggle
          value={effectiveToggleValue}
          modes={availableEditorToggleModes}
          onChange={onEditorToggleChange}
          metadataOverride={
            isCsv ? CSV_VIEW_MODE_METADATA : isNotebook ? NOTEBOOK_VIEW_MODE_METADATA : undefined
          }
        />
      )}
      {canShowMarkdownTableOfContents && (
        <TooltipProvider delay={300}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className={cn(
                    'size-6 shrink-0 hover:text-foreground [&_svg]:size-3.5',
                    showMarkdownTableOfContents && !isMarkdownTableOfContentsDisabled
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground'
                  )}
                  onClick={onToggleMarkdownTableOfContents}
                  disabled={isMarkdownTableOfContentsDisabled}
                  aria-label={translate(
                    'auto.components.editor.EditorPanelHeader.5447c4f68f',
                    'Table of Contents'
                  )}
                  aria-pressed={showMarkdownTableOfContents}
                >
                  <ListTree size={14} />
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={4}>
              {isMarkdownTableOfContentsDisabled
                ? translate(
                    'auto.components.editor.EditorPanelHeader.146cb5473c',
                    'Table of Contents is available in rich or preview mode'
                  )
                : translate(
                    'auto.components.editor.EditorPanelHeader.5447c4f68f',
                    'Table of Contents'
                  )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <EditorPanelMarkdownActionsMenu
        isMarkdown={isMarkdown}
        isDiffSurface={isDiffSurface}
        diffWordWrap={diffWordWrap}
        shouldShowMarkdownExportAction={shouldShowMarkdownExportAction}
        canExportMarkdownToPdf={canExportMarkdownToPdf}
        canShowMarkdownFrontmatterToggle={canShowMarkdownFrontmatterToggle}
        markdownFrontmatterVisible={markdownFrontmatterVisible}
        onToggleDiffWordWrap={() => void updateSettings({ diffWordWrap: !diffWordWrap })}
        onToggleMarkdownFrontmatter={onToggleMarkdownFrontmatter}
        onExportMarkdownToPdf={onExportMarkdownToPdf}
      />
    </div>
  )
}
