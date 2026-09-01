import { useEffect, useRef, useState } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { useAppStore } from '~renderer/store/state'

import { splitPathSegments } from '../path-tree'
import { useFileDeletion } from '../use-file-deletion'
import type { FileExplorerModel } from './model'
import { getFileExplorerOwnerUnresolvedMessage } from './operation-owner'
import type { PierreFileExplorerTreeHandle } from './pierre-file-explorer-tree'
import { shouldResetFileExplorerForVisibleWorktree } from './reset'
import type { TreeNode } from './types'
import { clearFileExplorerUndoHistory } from './undo-redo'
import { useFileExplorerAutoReveal } from './use-auto-reveal'
import { useFileExplorerDragDrop } from './use-drag-drop'
import { useFileExplorerHandlers } from './use-handlers'
import { useFileExplorerInlineInput } from './use-inline-input'
import { useFileExplorerKeys } from './use-keys'
import { useFileExplorerReveal } from './use-reveal'
import { useFileExplorerRowActions } from './use-row-actions'
import { useFileExplorerSelection } from './use-selection'
import { useFileExplorerWatch } from './use-watch'

export function useFileExplorerInteractions(
  model: FileExplorerModel,
  workspacePanelTabId?: string
) {
  const { view, owner, tree, actions } = model
  const toggleDir = useAppStore((state) => state.toggleDir)
  const pendingExplorerReveal = useAppStore((state) => state.pendingExplorerReveal)
  const clearPendingExplorerReveal = useAppStore((state) => state.clearPendingExplorerReveal)
  const openFile = useAppStore((state) => state.openFile)
  const makePreviewFilePermanent = useAppStore((state) => state.makePreviewFilePermanent)
  const activeFileId = useAppStore((state) => state.activeFileId)
  const openFiles = useAppStore((state) => state.openFiles)
  const closeFile = useAppStore((state) => state.closeFile)

  const [flashingPath, setFlashingPath] = useState<string | null>(null)
  const [bgMenuOpen, setBgMenuOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pierreTreeRef = useRef<PierreFileExplorerTreeHandle>(null)
  const explorerShellRef = useRef<HTMLDivElement | null>(null)
  const flashTimeoutRef = useRef<number | null>(null)
  const isMac = (() => navigator.userAgent.includes('Mac'))()
  const isWindows = (() => navigator.userAgent.includes('Windows'))()
  const selection = useFileExplorerSelection(tree.rowProjection, isMac)
  const selectedNode = selection.selectedPath
    ? tree.rowProjection.getRowByPath(selection.selectedPath)
    : null
  const selectedNodes = (() => tree.rowProjection.getRowsByPaths(selection.selectedPaths))()
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

  // Why: the first root load can land before the host catalog does — on the web
  // client the paired runtime answers over the relay seconds after first paint —
  // and an owner-unresolved failure would otherwise stay on screen until the user
  // switched workspaces. Retry once the catalog that names the owner arrives —
  // and only for that failure, so a real read error (missing path, denied
  // directory) does not re-run on every catalog refresh.
  const projectCatalog = useProjectCatalog()
  const ownerEvidence = projectCatalog.repos
  const ownerWorktreeEvidence = projectCatalogRepoBuckets(projectCatalog).worktreesByRepo
  useEffect(() => {
    if (
      !owner.visibleFilesWorktreePath ||
      tree.rootError !== getFileExplorerOwnerUnresolvedMessage()
    ) {
      return
    }
    tree.resetAndLoad()
  }, [ownerEvidence, ownerWorktreeEvidence]) // eslint-disable-line react-hooks/exhaustive-deps

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
    dragSourcePath: dragDrop.dragSourcePath
  })
  const explorerScrollController = (() => ({
    scrollToIndex: (index: number, options: { align: 'center' | 'auto' }) => {
      const node = tree.rowProjection.getRowAtIndex(index)
      if (node) {
        pierreTreeRef.current?.scrollToAbsolutePath(
          node.path,
          options.align === 'center' ? 'center' : 'nearest'
        )
      }
    }
  }))()
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
  const setExplorerShellRef = (node: HTMLDivElement | null): void => {
    explorerShellRef.current = node
    if (node === null) {
      // Why: reveal timers target this owner and must stop when it detaches.
      cancelRevealTimers()
    }
  }
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
  const activateNode = (node: TreeNode) => void handleClick(node)
  const scrollToIndex = (index: number) =>
    explorerScrollController.scrollToIndex(index, { align: 'auto' })
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
    requestDeleteAll: deletion.requestDeleteAll,
    refreshDir: tree.refreshDir,
    scrollToIndex,
    setSelectedPaths: selection.setSelectedPaths,
    activeWorktreeId: owner.activeWorktreeId,
    worktreePath: owner.visibleFilesWorktreePath,
    nativeTreeNavigation: true
  })

  // Why: delete/duplicate/collapse/rename/open-in-terminal/background-menu
  // actions live in a sibling hook (use-file-explorer-row-actions.ts) so this
  // file stays under the .tsx line budget; actionsGroup adds only `toggleDir`.
  const rowActions = useFileExplorerRowActions({
    activeWorktreeId: owner.activeWorktreeId,
    activeRepo: owner.activeRepo,
    worktreePath: owner.worktreePath,
    explorerView: view.explorerView,
    hasNameFilter: view.hasNameFilter,
    refreshDir: tree.refreshDir,
    selectedPaths: selection.selectedPaths,
    selectedNodes,
    requestDelete: deletion.requestDelete,
    requestDeleteAll: deletion.requestDeleteAll,
    inlineInput: inline.inlineInput,
    startNew: inline.startNew
  })

  // Why: expose only the selection capabilities the tree consumes instead of
  // leaking the selection hook's entire internal model.
  const selectionGroup = (() => ({
    selectedPath: selection.selectedPath,
    selectedPaths: selection.selectedPaths,
    setSingleSelectedPath: selection.setSingleSelectedPath,
    setSelectedPaths: selection.setSelectedPaths,
    resetSelection: selection.resetSelection,
    selectRowWithModifiers: selection.selectRowWithModifiers,
    moveSelection: selection.moveSelection,
    preserveSelectionForContextMenu: selection.preserveSelectionForContextMenu,
    copyPathsForNode: selection.copyPathsForNode,
    selectedNode
  }))()
  const refsGroup = (() => ({ scrollRef, pierreTreeRef, setExplorerShellRef }))()
  const menuGroup = (() => ({ bgMenuOpen, setBgMenuOpen }))()
  const displayGroup = (() => ({ flashingPath, activeFileId }))()
  const actionsGroup = (() => ({ ...rowActions, toggleDir }))()

  // Why: this is the component boundary contract; grouping the feature state
  // keeps the tree surface independent from the hooks that produce it.
  return (() => ({
    selection: selectionGroup,
    deletion,
    dragDrop,
    inline,
    handlers,
    refs: refsGroup,
    menu: menuGroup,
    display: displayGroup,
    actions: actionsGroup
  }))()
}

export type FileExplorerInteractions = ReturnType<typeof useFileExplorerInteractions>
