import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/components/tab-bar/sortable-tab'
import { createNewTerminalTab } from '@/components/terminal/terminal-tab-create'
import { renameFileOnDisk } from '@/lib/rename-file'
import { useAppStore } from '@/store'

import {
  buildAddProjectFromFolderModalData,
  canShowAddAsProjectAction
} from './file-explorer-add-project-action'
import type { FileExplorerModel } from './file-explorer-model'
import { shouldResetFileExplorerForVisibleWorktree } from './file-explorer-reset'
import type { TreeNode } from './file-explorer-types'
import { clearFileExplorerUndoHistory } from './file-explorer-undo-redo'
import { folderRelativePathToIncludeGlob } from './file-search-include-pattern'
import { splitPathSegments } from './path-tree'
import type { PierreFileExplorerTreeHandle } from './pierre-file-explorer-tree'
import { useFileDeletion } from './use-file-deletion'
import { useFileDuplicate } from './use-file-duplicate'
import { useFileExplorerAutoReveal } from './use-file-explorer-auto-reveal'
import { useFileExplorerDragDrop } from './use-file-explorer-drag-drop'
import { useFileExplorerHandlers } from './use-file-explorer-handlers'
import { useFileExplorerImport } from './use-file-explorer-import'
import { useFileExplorerInlineInput } from './use-file-explorer-inline-input'
import { useFileExplorerKeys } from './use-file-explorer-keys'
import { useFileExplorerReveal } from './use-file-explorer-reveal'
import { useFileExplorerSelection } from './use-file-explorer-selection'
import { useFileExplorerWatch } from './use-file-explorer-watch'

export function useFileExplorerInteractions(
  model: FileExplorerModel,
  workspacePanelTabId?: string
) {
  const { view, owner, tree, actions } = model
  const sshConnectedGeneration = useAppStore((state) => state.sshConnectedGeneration)
  const collapseAllDirs = useAppStore((state) => state.collapseAllDirs)
  const collapseDirSubtree = useAppStore((state) => state.collapseDirSubtree)
  const toggleDir = useAppStore((state) => state.toggleDir)
  const pendingExplorerReveal = useAppStore((state) => state.pendingExplorerReveal)
  const clearPendingExplorerReveal = useAppStore((state) => state.clearPendingExplorerReveal)
  const openFile = useAppStore((state) => state.openFile)
  const makePreviewFilePermanent = useAppStore((state) => state.makePreviewFilePermanent)
  const activeFileId = useAppStore((state) => state.activeFileId)
  const openFiles = useAppStore((state) => state.openFiles)
  const closeFile = useAppStore((state) => state.closeFile)
  const openModal = useAppStore((state) => state.openModal)
  const showRightSidebarSearch = useAppStore((state) => state.showRightSidebarSearch)
  const toggleShowDotfilesForWorktree = useAppStore((state) => state.toggleShowDotfilesForWorktree)

  const [flashingPath, setFlashingPath] = useState<string | null>(null)
  const [bgMenuOpen, setBgMenuOpen] = useState(false)
  const [bgMenuPoint, setBgMenuPoint] = useState({ x: 0, y: 0 })
  const scrollRef = useRef<HTMLDivElement>(null)
  const pierreTreeRef = useRef<PierreFileExplorerTreeHandle>(null)
  const explorerShellRef = useRef<HTMLDivElement | null>(null)
  const flashTimeoutRef = useRef<number | null>(null)
  const isMac = useMemo(() => navigator.userAgent.includes('Mac'), [])
  const isWindows = useMemo(() => navigator.userAgent.includes('Windows'), [])
  const selection = useFileExplorerSelection(tree.rowProjection, isMac)
  const selectedNode = selection.selectedPath
    ? tree.rowProjection.getRowByPath(selection.selectedPath)
    : null
  const selectedNodes = useMemo(
    () => tree.rowProjection.getRowsByPaths(selection.selectedPaths),
    [selection.selectedPaths, tree.rowProjection]
  )
  const deletion = useFileDeletion({
    activeWorktreeId: owner.activeWorktreeId,
    openFiles,
    closeFile,
    refreshDir: tree.refreshDir,
    setSelectedPaths: selection.setSelectedPaths,
    isWindows
  })
  const dragDrop = useFileExplorerDragDrop({
    worktreePath: owner.worktreePath,
    activeWorktreeId: owner.activeWorktreeId,
    expanded: tree.expanded,
    toggleDir,
    refreshDir: tree.refreshDir,
    scrollRef
  })

  const lastResetWorktreePathRef = useRef<string | null>(null)
  useEffect(() => {
    if (
      !owner.visibleFilesWorktreePath ||
      !shouldResetFileExplorerForVisibleWorktree(
        lastResetWorktreePathRef.current,
        owner.visibleFilesWorktreePath
      )
    ) {
      return
    }
    lastResetWorktreePathRef.current = owner.visibleFilesWorktreePath
    selection.resetSelection()
    view.setNameFilterQuery('')
    tree.resetAndLoad()
    clearFileExplorerUndoHistory()
  }, [owner.visibleFilesWorktreePath, selection.resetSelection]) // eslint-disable-line react-hooks/exhaustive-deps

  const sshGenRef = useRef(sshConnectedGeneration)
  useEffect(() => {
    if (sshConnectedGeneration > sshGenRef.current) {
      sshGenRef.current = sshConnectedGeneration
      if (owner.visibleFilesWorktreePath && tree.rootError) {
        tree.resetAndLoad()
      }
    }
  }, [sshConnectedGeneration, owner.visibleFilesWorktreePath]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!owner.visibleFilesWorktreePath) {
      return
    }
    for (const dirPath of tree.expanded) {
      if (!tree.dirCache[dirPath]?.children.length && !tree.dirCache[dirPath]?.loading) {
        const depth =
          splitPathSegments(dirPath.slice(owner.visibleFilesWorktreePath.length + 1)).length - 1
        void tree.loadDir(dirPath, depth)
      }
    }
  }, [tree.expanded, owner.visibleFilesWorktreePath]) // eslint-disable-line react-hooks/exhaustive-deps

  const inline = useFileExplorerInlineInput({
    activeWorktreeId: owner.activeWorktreeId,
    worktreePath: owner.visibleFilesWorktreePath,
    expanded: tree.expanded,
    rowProjection: tree.rowProjection,
    scrollRef,
    refreshDir: tree.refreshDir
  })
  useFileExplorerWatch({
    worktreePath: owner.visibleFilesWorktreePath,
    activeWorktreeId: owner.activeWorktreeId,
    dirCache: tree.dirCache,
    setDirCache: tree.setDirCache,
    expanded: tree.expanded,
    setSelectedPath: selection.setSingleSelectedPath,
    refreshDir: tree.refreshDir,
    refreshTree: tree.refreshTree,
    inlineInput: inline.inlineInput,
    dragSourcePath: dragDrop.dragSourcePath,
    isNativeDragOver: dragDrop.isNativeDragOver
  })
  useFileExplorerImport({
    worktreePath: owner.visibleFilesWorktreePath,
    activeWorktreeId: owner.activeWorktreeId,
    refreshDir: tree.refreshDir,
    clearNativeDragState: dragDrop.clearNativeDragState,
    setSelectedPath: selection.setSingleSelectedPath
  })

  const explorerScrollController = useMemo(
    () => ({
      scrollToIndex: (index: number, options: { align: 'center' | 'auto' }) => {
        const node = tree.rowProjection.getRowAtIndex(index)
        if (node) {
          pierreTreeRef.current?.scrollToAbsolutePath(
            node.path,
            options.align === 'center' ? 'center' : 'nearest'
          )
        }
      }
    }),
    [tree.rowProjection]
  )
  const cancelRevealTimers = useFileExplorerReveal({
    activeWorktreeId: owner.activeWorktreeId,
    worktreePath: owner.visibleFilesWorktreePath,
    pendingExplorerReveal,
    clearPendingExplorerReveal,
    expanded: tree.expanded,
    dirCache: tree.dirCache,
    rootCache: tree.rootCache,
    rowProjection: tree.rowProjection,
    loadDir: tree.loadDir,
    setSelectedPath: selection.setSingleSelectedPath,
    setFlashingPath,
    flashTimeoutRef,
    virtualizer: explorerScrollController
  })
  const setExplorerShellRef = useCallback(
    (node: HTMLDivElement | null): void => {
      explorerShellRef.current = node
      if (node === null) {
        // Why: reveal timers target this owner and must stop when it detaches.
        cancelRevealTimers()
      }
    },
    [cancelRevealTimers]
  )
  useFileExplorerAutoReveal({
    activeFileId,
    activeWorktreeId: owner.activeWorktreeId,
    worktreePath: owner.visibleFilesWorktreePath,
    pendingExplorerReveal,
    openFiles,
    rowProjection: tree.rowProjection,
    setSelectedPath: selection.setSingleSelectedPath,
    virtualizer: explorerScrollController
  })

  const handlers = useFileExplorerHandlers({
    activeWorktreeId: owner.activeWorktreeId,
    runtimeEnvironmentId: owner.activeRuntimeEnvironmentId,
    workspacePanelTabId,
    openFile,
    makePreviewFilePermanent,
    toggleDir: view.hasNameFilter ? actions.handleToggleNameFilterDir : toggleDir,
    loadDir: tree.loadDir,
    statPath: tree.statPath,
    markPathAsDirectory: tree.markPathAsDirectory,
    setSelectedPath: selection.setSingleSelectedPath,
    scrollRef
  })
  const { handleClick } = handlers
  const activateNode = useCallback((node: TreeNode) => void handleClick(node), [handleClick])
  const scrollToIndex = useCallback(
    (index: number) => explorerScrollController.scrollToIndex(index, { align: 'auto' }),
    [explorerScrollController]
  )
  useFileExplorerKeys({
    containerRef: explorerShellRef,
    rowProjection: tree.rowProjection,
    expandedPaths: tree.rowExpandedPaths,
    canToggleDirectories: true,
    inlineInput: inline.inlineInput,
    selectedPaths: selection.selectedPaths,
    selectedNode,
    activateNode,
    moveSelection: selection.moveSelection,
    toggleDir: view.hasNameFilter ? actions.handleToggleNameFilterDir : toggleDir,
    startRename: inline.startRename,
    requestDelete: deletion.requestDelete,
    requestDeleteAll: deletion.requestDeleteAll,
    scrollToIndex,
    activeWorktreeId: owner.activeWorktreeId,
    nativeTreeNavigation: true
  })

  const { requestDelete, requestDeleteAll } = deletion
  const handleContextMenuDelete = useCallback(
    (node: TreeNode) => {
      if (selection.selectedPaths.has(node.path) && selectedNodes.length > 1) {
        requestDeleteAll(selectedNodes)
      } else {
        requestDelete(node)
      }
    },
    [requestDelete, requestDeleteAll, selectedNodes, selection.selectedPaths]
  )
  const handleDuplicate = useFileDuplicate({
    activeWorktreeId: owner.activeWorktreeId,
    worktreePath: owner.worktreePath,
    refreshDir: tree.refreshDir
  })
  const handleCollapseFolderSubtree = useCallback(
    (node: TreeNode) => {
      if (owner.activeWorktreeId && node.isDirectory) {
        collapseDirSubtree(owner.activeWorktreeId, node.path)
      }
    },
    [collapseDirSubtree, owner.activeWorktreeId]
  )
  const handleFindInFolder = useCallback(
    (node: TreeNode) => {
      if (owner.activeWorktreeId && node.isDirectory) {
        showRightSidebarSearch({
          includePattern: folderRelativePathToIncludeGlob(node.relativePath)
        })
      }
    },
    [owner.activeWorktreeId, showRightSidebarSearch]
  )
  const handleAddFolderAsProject = useCallback(
    (node: TreeNode) => {
      if (owner.activeRepo && canShowAddAsProjectAction(node, owner.activeRepo)) {
        openModal(
          'confirm-add-project-from-folder',
          buildAddProjectFromFolderModalData(node, owner.activeRepo)
        )
      }
    },
    [openModal, owner.activeRepo]
  )
  const handleOpenInTerminal = useCallback(
    (node: TreeNode) => {
      if (owner.activeWorktreeId && node.isDirectory) {
        createNewTerminalTab(owner.activeWorktreeId, undefined, { startupCwd: node.path })
      }
    },
    [owner.activeWorktreeId]
  )
  const handlePierreRenameNode = useCallback(
    (node: TreeNode, newName: string) => {
      if (owner.activeWorktreeId && owner.worktreePath) {
        void renameFileOnDisk({
          oldPath: node.path,
          newName,
          worktreeId: owner.activeWorktreeId,
          worktreePath: owner.worktreePath,
          refreshDir: tree.refreshDir
        })
      }
    },
    [owner.activeWorktreeId, owner.worktreePath, tree.refreshDir]
  )
  const handleCollapseAll = useCallback(() => {
    if (owner.activeWorktreeId && view.explorerView === 'files' && !view.hasNameFilter) {
      collapseAllDirs(owner.activeWorktreeId)
    }
  }, [collapseAllDirs, owner.activeWorktreeId, view.explorerView, view.hasNameFilter])
  const handleToggleDotfiles = useCallback(() => {
    if (owner.activeWorktreeId) {
      toggleShowDotfilesForWorktree(owner.activeWorktreeId)
    }
  }, [owner.activeWorktreeId, toggleShowDotfilesForWorktree])
  const handleBackgroundContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const isTreeRow = event.nativeEvent
      .composedPath()
      .some((entry) => entry instanceof HTMLElement && entry.dataset.type === 'item')
    if (isTreeRow || (event.target as HTMLElement).closest('[data-slot="context-menu-trigger"]')) {
      return
    }
    event.preventDefault()
    window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
    setBgMenuPoint({ x: event.clientX, y: event.clientY })
    setBgMenuOpen(true)
  }, [])
  const { inlineInput, startNew } = inline
  const handleBackgroundDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!owner.worktreePath || inlineInput) {
        return
      }
      const isTreeRow = event.nativeEvent
        .composedPath()
        .some((entry) => entry instanceof HTMLElement && entry.dataset.type === 'item')
      if (
        !(isTreeRow || (event.target as HTMLElement).closest('[data-slot="context-menu-trigger"]'))
      ) {
        startNew('file', owner.worktreePath, 0)
      }
    },
    [inlineInput, owner.worktreePath, startNew]
  )

  return {
    selection: { ...selection, selectedNode },
    deletion,
    dragDrop,
    inline,
    handlers,
    refs: { scrollRef, pierreTreeRef, setExplorerShellRef },
    menu: { bgMenuOpen, setBgMenuOpen, bgMenuPoint },
    display: { flashingPath, activeFileId },
    actions: {
      handleContextMenuDelete,
      handleDuplicate,
      handleCollapseFolderSubtree,
      handleFindInFolder,
      handleAddFolderAsProject,
      handleOpenInTerminal,
      handlePierreRenameNode,
      handleCollapseAll,
      handleToggleDotfiles,
      handleBackgroundContextMenu,
      handleBackgroundDoubleClick,
      toggleDir
    }
  }
}

export type FileExplorerInteractions = ReturnType<typeof useFileExplorerInteractions>
