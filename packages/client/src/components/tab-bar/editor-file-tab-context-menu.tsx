import {
  Copy,
  Eye,
  List as ListX,
  Sidebar as PanelRightClose,
  Pencil,
  PushPin as Pin,
  PushPinSlash as PinOff,
  ArrowSquareOut as ExternalLink,
  X
} from '@phosphor-icons/react'
import { showLocalPathOpenBlockedToast } from '~renderer/components/editor/local-path-open-guard'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut
} from '~renderer/components/ui/context-menu'
import { useOptionalShortcutLabel } from '~renderer/hooks/use-shortcut-label'
import { translate } from '~renderer/i18n/i18n'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store'

import type { OpenFile } from '../editor/state'
import { shouldBlockEditorTabLocalOpen } from './editor-tab-local-open-guard'
import { TabWorkspaceLayoutMenuSection } from './tab-workspace-layout-menu-section'

const isMac = navigator.userAgent.includes('Mac')
const isLinux = navigator.userAgent.includes('Linux')

/** Platform-appropriate label: macOS → Finder, Windows → File Explorer, Linux → Files */
const revealLabel = isMac
  ? 'Reveal in Finder'
  : isLinux
    ? 'Open Containing Folder'
    : 'Reveal in File Explorer'

type EditorFileTabContextMenuProps = {
  file: OpenFile & { tabId?: string }
  unifiedTabId: string
  groupId: string
  isPinned: boolean
  isRenaming: boolean
  hasTabsToRight: boolean
  canRename: boolean
  canShowMarkdownPreview: boolean
  resolvedLanguage: string
  repoConnectionId: string | null
  skipMenuFocusRestoreRef: React.MutableRefObject<boolean>
  onActivate: () => void
  onOpenRenameInput: () => void
  onTogglePin: () => void
  onClose: () => void
  onCloseAll: () => void
  onCloseToRight: () => void
  onOpenMarkdownPreview: (
    file: {
      filePath: string
      relativePath: string
      worktreeId: string
      runtimeEnvironmentId?: string | null
      language: string
    },
    options: { sourceFileId: string }
  ) => void
}

export function EditorFileTabContextMenu({
  file,
  unifiedTabId,
  groupId,
  isPinned,
  isRenaming,
  hasTabsToRight,
  canRename,
  canShowMarkdownPreview,
  resolvedLanguage,
  repoConnectionId,
  skipMenuFocusRestoreRef,
  onActivate,
  onOpenRenameInput,
  onTogglePin,
  onClose,
  onCloseAll,
  onCloseToRight,
  onOpenMarkdownPreview
}: EditorFileTabContextMenuProps): React.JSX.Element {
  const renameShortcut = useOptionalShortcutLabel('tab.rename')
  const closeShortcut = useOptionalShortcutLabel('tab.close')
  const closeAllShortcut = useOptionalShortcutLabel('tab.closeAll')

  return (
    <ContextMenuContent
      className="w-48"
      finalFocus={() => {
        if (!skipMenuFocusRestoreRef.current) {
          return
        }
        skipMenuFocusRestoreRef.current = false
        // Return false to suppress the default focus restore.
        return false
      }}
    >
      <TabWorkspaceLayoutMenuSection
        unifiedTabId={unifiedTabId}
        groupId={groupId}
        trailingSeparator
      />
      <ContextMenuItem
        disabled={!canRename || isRenaming}
        onClick={() => {
          skipMenuFocusRestoreRef.current = true
          onActivate()
          onOpenRenameInput()
        }}
      >
        <Pencil className="size-3.5" />
        {translate('auto.components.tab.bar.EditorFileTabContextMenu.68cc610e7f', 'Rename')}
        {renameShortcut ? <ContextMenuShortcut>{renameShortcut}</ContextMenuShortcut> : null}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onTogglePin}>
        {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        {isPinned
          ? translate('auto.components.tab.bar.EditorFileTabContextMenu.8e9d603a09', 'Unpin Tab')
          : translate('auto.components.tab.bar.EditorFileTabContextMenu.fdd29eb669', 'Pin Tab')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => !isPinned && onClose()} disabled={isPinned}>
        <X className="size-3.5" />
        {translate('auto.components.tab.bar.EditorFileTabContextMenu.1ba8492c5b', 'Close')}
        {closeShortcut ? <ContextMenuShortcut>{closeShortcut}</ContextMenuShortcut> : null}
      </ContextMenuItem>
      <ContextMenuItem onClick={onCloseAll}>
        <ListX className="size-3.5" />
        {translate(
          'auto.components.tab.bar.EditorFileTabContextMenu.ba1369dd24',
          'Close All Editor Tabs'
        )}
        {closeAllShortcut ? <ContextMenuShortcut>{closeAllShortcut}</ContextMenuShortcut> : null}
      </ContextMenuItem>
      <ContextMenuItem onClick={onCloseToRight} disabled={!hasTabsToRight}>
        <PanelRightClose className="size-3.5" />
        {translate(
          'auto.components.tab.bar.EditorFileTabContextMenu.e5ff31ccaf',
          'Close Tabs To The Right'
        )}
      </ContextMenuItem>
      <ContextMenuSeparator />
      {canShowMarkdownPreview ? (
        <>
          <ContextMenuItem
            onClick={() => {
              onActivate()
              onOpenMarkdownPreview(
                {
                  filePath: file.filePath,
                  relativePath: file.relativePath,
                  worktreeId: file.worktreeId,
                  runtimeEnvironmentId: file.runtimeEnvironmentId,
                  language: resolvedLanguage
                },
                { sourceFileId: file.id }
              )
            }}
          >
            <Eye className="size-3.5" />
            {translate(
              'auto.components.tab.bar.EditorFileTabContextMenu.bfd5797ef4',
              'Open Markdown Preview'
            )}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      ) : null}
      <ContextMenuItem
        onClick={() => {
          void shellClient.ui.writeClipboardText(file.filePath)
        }}
      >
        <Copy className="size-3.5" />
        {translate('auto.components.tab.bar.EditorFileTabContextMenu.5b85754786', 'Copy Path')}
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          void shellClient.ui.writeClipboardText(file.relativePath)
        }}
      >
        <Copy className="size-3.5" />
        {translate(
          'auto.components.tab.bar.EditorFileTabContextMenu.52ce4f4605',
          'Copy Relative Path'
        )}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => {
          if (
            shouldBlockEditorTabLocalOpen(
              useAppStore.getState().settings,
              file.runtimeEnvironmentId,
              repoConnectionId
            )
          ) {
            showLocalPathOpenBlockedToast()
            return
          }
          shellClient.shell.openPath(file.filePath)
        }}
      >
        <ExternalLink className="size-3.5" />
        {revealLabel}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
