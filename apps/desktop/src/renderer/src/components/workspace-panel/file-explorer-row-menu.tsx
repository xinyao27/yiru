import {
  ArrowSquareOut as ExternalLink,
  Copy,
  Download,
  Eye,
  File,
  FilePlus,
  Files,
  FolderPlus,
  Globe,
  ListDashes as ListCollapse,
  MagnifyingGlass as Search,
  Pencil,
  TerminalWindow as SquareTerminal,
  Trash as Trash2
} from '@phosphor-icons/react'
import { toast } from 'sonner'

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut
} from '@/components/ui/context-menu'
import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import { translate } from '@/i18n/i18n'
import { openFileInBrowserTab } from '@/lib/file-preview'
import { detectLanguage } from '@/lib/language-detect'
import { isLocalPathOpenBlocked, showLocalPathOpenBlockedToast } from '@/lib/local-path-open-guard'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import { useAppStore } from '@/store'

import {
  shouldShowCollapseFolderAction,
  shouldShowCopyFileAction,
  shouldShowFindInFolderAction,
  shouldShowOpenInTerminalAction,
  shouldShowRemoteDownloadAction,
  shouldShowViewFileAction
} from './file-explorer-row-actions'
import type { TreeNode } from './file-explorer-types'

const isMac = navigator.userAgent.includes('Mac')
const isLinux = navigator.userAgent.includes('Linux')
const revealLabel = isMac
  ? 'Reveal in Finder'
  : isLinux
    ? 'Open Containing Folder'
    : 'Reveal in File Explorer'

export type FileExplorerRowMenuProps = {
  node: TreeNode
  isExpanded: boolean
  selectionSize: number
  deleteShortcutLabel: string
  connectionId?: string | null
  runtimeDownloadContext?: RuntimeFileOperationArgs | null
  supportsFolderDownload?: boolean
  canCollapseFolderSubtree: boolean
  canAddAsProject: boolean
  targetDir: string
  targetDepth: number
  onCopyFile: () => void
  onCopyPaths: (pathKind: 'absolute' | 'relative') => void
  onDownload: () => void
  onStartNew: (type: 'file' | 'folder', dir: string, depth: number) => void
  onStartRename: (node: TreeNode) => void
  onDuplicate: (node: TreeNode) => void
  onAddFolderAsProject: () => void
  onOpenInTerminal: () => void
  onViewFile: () => void
  onCollapseFolderSubtree: () => void
  onFindInFolder: () => void
  onRequestDelete: () => void
}

function stopRightButtonMenuSelection(event: React.PointerEvent): void {
  if (event.button !== 2) {
    return
  }
  // Why: a right-button release can otherwise select the first menu item.
  event.preventDefault()
  event.stopPropagation()
}

export function FileExplorerRowMenu({
  node,
  isExpanded,
  selectionSize,
  deleteShortcutLabel,
  connectionId,
  runtimeDownloadContext,
  supportsFolderDownload = false,
  canCollapseFolderSubtree,
  canAddAsProject,
  targetDir,
  targetDepth,
  onCopyFile,
  onCopyPaths,
  onDownload,
  onStartNew,
  onStartRename,
  onDuplicate,
  onAddFolderAsProject,
  onOpenInTerminal,
  onViewFile,
  onCollapseFolderSubtree,
  onFindInFolder,
  onRequestDelete
}: FileExplorerRowMenuProps): React.JSX.Element {
  const openMarkdownPreview = useAppStore((state) => state.openMarkdownPreview)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const copyPathShortcutLabel = useShortcutLabel('fileExplorer.copyPath')
  const copyRelativePathShortcutLabel = useShortcutLabel('fileExplorer.copyRelativePath')
  const findInFolderShortcutLabel = useShortcutLabel('sidebar.search.toggle')
  const showDownload = shouldShowRemoteDownloadAction(
    node,
    connectionId,
    runtimeDownloadContext,
    supportsFolderDownload
  )

  const handleReveal = (): void => {
    const state = useAppStore.getState()
    const activeWorktree = Object.values(state.worktreesByRepo)
      .flat()
      .find((worktree) => worktree.id === activeWorktreeId)
    const activeRepo = activeWorktree
      ? state.repos.find((repo) => repo.id === activeWorktree.repoId)
      : null
    if (
      isLocalPathOpenBlocked(state.settings, {
        connectionId: activeRepo?.connectionId ?? null
      })
    ) {
      showLocalPathOpenBlockedToast()
      return
    }
    window.api.shell.openPath(node.path)
  }

  return (
    <ContextMenuContent
      data-file-tree-context-menu-root="true"
      className="w-64"
      onPointerUpCapture={stopRightButtonMenuSelection}
      finalFocus={false}
    >
      <ContextMenuItem onClick={() => onStartNew('file', targetDir, targetDepth)}>
        <FilePlus />
        {translate('auto.components.right.sidebar.FileExplorerRow.37c875d827', 'New File')}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onStartNew('folder', targetDir, targetDepth)}>
        <FolderPlus />
        {translate('auto.components.right.sidebar.FileExplorerRow.f61af83316', 'New Folder')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      {shouldShowCopyFileAction(node, connectionId, selectionSize) && (
        <ContextMenuItem onClick={onCopyFile}>
          <Copy />
          {translate('auto.components.right.sidebar.FileExplorerRow.98a79948b3', 'Copy')}
        </ContextMenuItem>
      )}
      <ContextMenuItem onClick={() => onCopyPaths('absolute')}>
        <Copy />
        {selectionSize > 1
          ? translate('auto.components.right.sidebar.FileExplorerRow.f9d7ca753d', 'Copy Paths')
          : translate('auto.components.right.sidebar.FileExplorerRow.b5d436aa30', 'Copy Path')}
        {copyPathShortcutLabel !== 'Unassigned' && (
          <ContextMenuShortcut>{copyPathShortcutLabel}</ContextMenuShortcut>
        )}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onCopyPaths('relative')}>
        <Copy />
        {selectionSize > 1
          ? translate(
              'auto.components.right.sidebar.FileExplorerRow.42e10cbf57',
              'Copy Relative Paths'
            )
          : translate(
              'auto.components.right.sidebar.FileExplorerRow.66a29dde82',
              'Copy Relative Path'
            )}
        {copyRelativePathShortcutLabel !== 'Unassigned' && (
          <ContextMenuShortcut>{copyRelativePathShortcutLabel}</ContextMenuShortcut>
        )}
      </ContextMenuItem>
      {!node.isDirectory && (
        <ContextMenuItem onClick={() => onDuplicate(node)}>
          <Files />
          {translate('auto.components.right.sidebar.FileExplorerRow.0fec99bfd7', 'Duplicate')}
        </ContextMenuItem>
      )}
      {canAddAsProject && (
        <ContextMenuItem onClick={onAddFolderAsProject}>
          <FolderPlus />
          {translate(
            'auto.components.right.sidebar.FileExplorerRow.1bb9be455c',
            'Add as Project...'
          )}
        </ContextMenuItem>
      )}
      {shouldShowOpenInTerminalAction(node) && (
        <ContextMenuItem onClick={onOpenInTerminal}>
          <SquareTerminal />
          {translate(
            'auto.components.right.sidebar.FileExplorerRow.e887fa4b2e',
            'Open in Terminal'
          )}
        </ContextMenuItem>
      )}
      {shouldShowViewFileAction(node) && (
        <ContextMenuItem onClick={onViewFile}>
          <File />
          {translate('auto.components.right.sidebar.FileExplorerRow.1d8e182c32', 'View File')}
        </ContextMenuItem>
      )}
      {!node.isDirectory && activeWorktreeId && (
        <ContextMenuItem
          onClick={() => {
            const result = openFileInBrowserTab({
              filePath: node.path,
              worktreeId: activeWorktreeId
            })
            if (result.status === 'unsupported') {
              toast.error(result.message)
            }
          }}
        >
          <Globe />
          {translate(
            'auto.components.right.sidebar.FileExplorerRow.dd112c81d2',
            'Open in Yiru Browser'
          )}
        </ContextMenuItem>
      )}
      {!node.isDirectory && activeWorktreeId && detectLanguage(node.path) === 'markdown' && (
        <ContextMenuItem
          onClick={() =>
            openMarkdownPreview({
              filePath: node.path,
              relativePath: node.relativePath,
              worktreeId: activeWorktreeId,
              language: 'markdown'
            })
          }
        >
          <Eye />
          {translate(
            'auto.components.right.sidebar.FileExplorerRow.d87a4c42e1',
            'Open Markdown Preview'
          )}
        </ContextMenuItem>
      )}
      {showDownload && (
        <ContextMenuItem onClick={onDownload}>
          <Download />
          {translate('auto.components.right.sidebar.FileExplorerRow.c2112579f6', 'Download')}
        </ContextMenuItem>
      )}
      {canCollapseFolderSubtree && shouldShowCollapseFolderAction(node, isExpanded) && (
        <ContextMenuItem onClick={onCollapseFolderSubtree}>
          <ListCollapse />
          {translate('auto.components.right.sidebar.FileExplorerRow.d6a25618aa', 'Collapse Folder')}
        </ContextMenuItem>
      )}
      {shouldShowFindInFolderAction(node) && (
        <ContextMenuItem onClick={onFindInFolder}>
          <Search />
          {translate('auto.components.right.sidebar.FileExplorerRow.0df0e5abac', 'Find in Folder')}
          {findInFolderShortcutLabel !== 'Unassigned' && (
            <ContextMenuShortcut>{findInFolderShortcutLabel}</ContextMenuShortcut>
          )}
        </ContextMenuItem>
      )}
      <ContextMenuItem onClick={handleReveal}>
        <ExternalLink weight="regular" />
        {revealLabel}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onStartRename(node)}>
        <Pencil />
        {translate('auto.components.right.sidebar.FileExplorerRow.fc747429bf', 'Rename')}
        <ContextMenuShortcut>
          {isMac
            ? '↩'
            : translate('auto.components.right.sidebar.FileExplorerRow.a06551beee', 'Enter')}
        </ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onClick={onRequestDelete}>
        <Trash2 />
        {translate('auto.components.right.sidebar.FileExplorerRow.addc01145f', 'Delete')}
        <ContextMenuShortcut>{deleteShortcutLabel}</ContextMenuShortcut>
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
