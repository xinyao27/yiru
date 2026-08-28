import { keybindingMatchesAction } from '@yiru/runtime-protocol/workbench/keybindings'
import { useEffect, useRef } from 'react'
import type React from 'react'
import { toast } from 'sonner'
import { APP_MENU_PASTE_EVENT } from '~renderer/application-shell/menu-paste'
import { translate } from '~renderer/i18n/i18n'
import { isEditableTarget } from '~renderer/keyboard-input/editable-target'
import { getShortcutPlatform } from '~renderer/keyboard-input/shortcut-platform'
import { joinPath } from '~renderer/path'
import { useAppStore } from '~renderer/store/state'

import { pasteFileExplorerClipboard } from './clipboard'
import { applyFileExplorerNavigation, type SelectionMode } from './keyboard-navigation'
import { handleFileExplorerOperationShortcut } from './keyboard-operations'
import type { InlineInput } from './row'
import type { FileExplorerRowProjection } from './row-projection'
import type { TreeNode } from './types'
import {
  fileExplorerHasRedo,
  fileExplorerHasUndo,
  redoFileExplorer,
  undoFileExplorer
} from './undo-redo'

export function shouldIgnoreFileExplorerKeyTarget(target: EventTarget | null): boolean {
  return (
    isEditableTarget(target) ||
    (target instanceof Element &&
      target.closest('[data-ignore-file-explorer-keys="true"]') !== null)
  )
}

/**
 * Keyboard shortcuts for the file explorer.
 *
 * All shortcuts (bare-key and modifier) only fire when focus is inside
 * the explorer container — they must never intercept the editor or terminal.
 */
export function useFileExplorerKeys(opts: {
  containerRef: React.RefObject<HTMLDivElement | null>
  rowProjection: FileExplorerRowProjection
  expandedPaths: Set<string>
  canToggleDirectories: boolean
  inlineInput: InlineInput | null
  selectedPaths: Set<string>
  selectedNode: TreeNode | null
  activateNode: (node: TreeNode) => void
  moveSelection: (targetPath: string, mode: SelectionMode) => void
  toggleDir: (worktreeId: string, dirPath: string) => void
  startRename: (node: TreeNode) => void
  requestDeleteAll: (nodes: TreeNode[]) => void
  refreshDir: (dirPath: string) => Promise<void>
  scrollToIndex: (index: number) => void
  setSelectedPaths: (paths: Set<string>) => void
  activeWorktreeId: string | null
  worktreePath: string | null
  nativeTreeNavigation?: boolean
}): void {
  const rightSidebarExplorerView = useAppStore((s) => s.rightSidebarExplorerView)
  const keybindings = useAppStore((s) => s.keybindings)

  const rowProjectionRef = useRef(opts.rowProjection)
  rowProjectionRef.current = opts.rowProjection
  const expandedPathsRef = useRef(opts.expandedPaths)
  expandedPathsRef.current = opts.expandedPaths
  const canToggleDirectoriesRef = useRef(opts.canToggleDirectories)
  canToggleDirectoriesRef.current = opts.canToggleDirectories
  const inlineInputRef = useRef(opts.inlineInput)
  inlineInputRef.current = opts.inlineInput
  const selectedPathsRef = useRef(opts.selectedPaths)
  selectedPathsRef.current = opts.selectedPaths
  const selectedNodeRef = useRef(opts.selectedNode)
  selectedNodeRef.current = opts.selectedNode
  const startRenameRef = useRef(opts.startRename)
  startRenameRef.current = opts.startRename
  const requestDeleteAllRef = useRef(opts.requestDeleteAll)
  requestDeleteAllRef.current = opts.requestDeleteAll
  const activateNodeRef = useRef(opts.activateNode)
  activateNodeRef.current = opts.activateNode
  const moveSelectionRef = useRef(opts.moveSelection)
  moveSelectionRef.current = opts.moveSelection
  const toggleDirRef = useRef(opts.toggleDir)
  toggleDirRef.current = opts.toggleDir
  const scrollToIndexRef = useRef(opts.scrollToIndex)
  scrollToIndexRef.current = opts.scrollToIndex
  const activeWorktreeIdRef = useRef(opts.activeWorktreeId)
  activeWorktreeIdRef.current = opts.activeWorktreeId
  const worktreePathRef = useRef(opts.worktreePath)
  worktreePathRef.current = opts.worktreePath
  const refreshDirRef = useRef(opts.refreshDir)
  refreshDirRef.current = opts.refreshDir
  const setSelectedPathsRef = useRef(opts.setSelectedPaths)
  setSelectedPathsRef.current = opts.setSelectedPaths

  useEffect(() => {
    // Find the row index whose button is currently focused. Each virtualized
    // row's wrapper carries data-index; the inline-rename slot is the only
    // wrapper without a real TreeNode, so it falls back to the row above.
    const findFocusedIndex = (): number | null => {
      const el = document.activeElement as HTMLElement | null
      if (!el || !opts.containerRef.current?.contains(el)) {
        return null
      }
      const wrapper = el.closest<HTMLElement>('[data-index]')
      if (!wrapper) {
        return null
      }
      const raw = wrapper.dataset.index
      if (raw === undefined) {
        return null
      }
      const idx = Number(raw)
      if (rowProjectionRef.current.getRowAtIndex(idx) === null) {
        return idx > 0 ? idx - 1 : null
      }
      return idx
    }

    const focusInExplorer = (): boolean => {
      const el = document.activeElement
      if (!el || !opts.containerRef.current) {
        return false
      }
      if (opts.containerRef.current.contains(el)) {
        return true
      }
      // Fallback: Radix portaled nodes or timing quirks — shell is marked explicitly.
      return (
        el instanceof Element &&
        el.closest('[data-yiru-explorer-shell]') === opts.containerRef.current
      )
    }

    const focusRowAtIndex = (index: number): void => {
      const wrapper = opts.containerRef.current?.querySelector<HTMLElement>(
        `[data-index="${index}"]`
      )
      const button = wrapper?.querySelector<HTMLButtonElement>('button')
      button?.focus()
    }

    const findFocusedNode = (): TreeNode | null => {
      const focusedIndex = findFocusedIndex()
      const indexedNode =
        focusedIndex !== null ? rowProjectionRef.current.getRowAtIndex(focusedIndex) : null
      if (indexedNode) {
        return indexedNode
      }
      const shadowActiveElement = document.activeElement?.shadowRoot?.activeElement
      const canonicalPath =
        shadowActiveElement instanceof HTMLElement
          ? shadowActiveElement.dataset.itemPath?.replace(/\/$/u, '')
          : undefined
      const worktreePath = worktreePathRef.current
      if (canonicalPath && worktreePath) {
        const focusedNode = rowProjectionRef.current.getRowByPath(
          joinPath(worktreePath, canonicalPath)
        )
        if (focusedNode) {
          return focusedNode
        }
      }
      return selectedNodeRef.current
    }

    const isDirExpanded = (path: string): boolean => {
      return expandedPathsRef.current.has(path)
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (rightSidebarExplorerView !== 'files') {
        return
      }
      if (inlineInputRef.current) {
        return
      }
      if (
        e
          .composedPath()
          .some(
            (entry) =>
              entry instanceof HTMLInputElement && entry.hasAttribute('data-item-rename-input')
          )
      ) {
        // Why: keyboard events retarget to the Trees host when its native rename
        // input lives in Shadow DOM; global shortcuts must not consume filename edits.
        return
      }
      if (shouldIgnoreFileExplorerKeyTarget(e.target)) {
        return
      }

      // ── Undo/redo for explorer mutations (only when this panel should own the chord).
      // Why: require focus inside the explorer shell (includes the scrollbar, not just
      // the viewport — Radix renders the scrollbar as a sibling of the viewport).
      const inExplorer = focusInExplorer()
      const platform = getShortcutPlatform()
      const wantUndo =
        keybindingMatchesAction('fileExplorer.undo', e, platform, keybindings) &&
        fileExplorerHasUndo()
      const wantRedo =
        keybindingMatchesAction('fileExplorer.redo', e, platform, keybindings) &&
        fileExplorerHasRedo()
      if (inExplorer && (wantUndo || wantRedo)) {
        e.preventDefault()
        const run = wantRedo ? redoFileExplorer() : undoFileExplorer()
        void run.catch((err: unknown) => {
          toast.error(
            err instanceof Error
              ? err.message
              : translate(
                  'auto.components.right.sidebar.useFileExplorerKeys.8adb953095',
                  'Operation failed'
                )
          )
        })
        return
      }

      // ── Bare-key shortcuts: only when explorer has focus ──
      if (focusInExplorer()) {
        if (
          !opts.nativeTreeNavigation &&
          applyFileExplorerNavigation(
            {
              rowProjection: rowProjectionRef.current,
              activeWorktreeId: activeWorktreeIdRef.current,
              selectedNode: selectedNodeRef.current,
              isExpanded: isDirExpanded,
              canToggleDirectories: canToggleDirectoriesRef.current,
              findFocusedIndex,
              handlers: {
                moveSelection: moveSelectionRef.current,
                toggleDir: toggleDirRef.current,
                scrollToIndex: scrollToIndexRef.current,
                focusRowAtIndex
              }
            },
            e
          )
        ) {
          return
        }

        // ── Space activates the focused row (open file / toggle folder). ──
        if (!opts.nativeTreeNavigation && e.key === ' ' && !e.shiftKey) {
          const node = findFocusedNode()
          if (node) {
            e.preventDefault()
            activateNodeRef.current(node)
            return
          }
        }

        const node = findFocusedNode()
        if (node) {
          if (keybindingMatchesAction('fileExplorer.rename', e, platform, keybindings)) {
            e.preventDefault()
            e.stopPropagation()
            startRenameRef.current(node)
            return
          }
          const wantsDelete = keybindingMatchesAction(
            'fileExplorer.delete',
            e,
            platform,
            keybindings
          )
          if (wantsDelete) {
            e.preventDefault()
            const selectedNodes = rowProjectionRef.current.getRowsByPaths(selectedPathsRef.current)
            requestDeleteAllRef.current(selectedNodes.length > 1 ? selectedNodes : [node])
            return
          }
        }
      }

      // ── Modifier shortcuts: only when focus is inside the explorer ──
      // Scoped to explorer focus to avoid intercepting editor/terminal shortcuts
      if (!focusInExplorer()) {
        return
      }
      const node = findFocusedNode()
      const selectedNodes = rowProjectionRef.current.getRowsByPaths(selectedPathsRef.current)
      const fallbackNodes = selectedNodes.length > 0 ? selectedNodes : node ? [node] : []
      const didHandleOperation = handleFileExplorerOperationShortcut({
        activeWorktreeId: activeWorktreeIdRef.current,
        destinationNode: node,
        event: e,
        keybindings,
        platform,
        refreshDir: refreshDirRef.current,
        rowProjection: rowProjectionRef.current,
        selectedNodes: fallbackNodes,
        setSelectedPaths: setSelectedPathsRef.current,
        worktreePath: worktreePathRef.current
      })
      if (didHandleOperation) {
        e.stopPropagation()
      }
    }

    // Why: Electron's CmdOrCtrl+V menu accelerator sends this owned paste event
    // instead of a keydown, so the focused explorer must claim it explicitly.
    const onAppMenuPaste = (event: Event): void => {
      if (rightSidebarExplorerView !== 'files' || inlineInputRef.current || !focusInExplorer()) {
        return
      }
      event.preventDefault()
      pasteFileExplorerClipboard({
        activeWorktreeId: activeWorktreeIdRef.current,
        destinationNode: findFocusedNode(),
        refreshDir: refreshDirRef.current,
        setSelectedPaths: setSelectedPathsRef.current,
        worktreePath: worktreePathRef.current
      })
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener(APP_MENU_PASTE_EVENT, onAppMenuPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener(APP_MENU_PASTE_EVENT, onAppMenuPaste)
    }
  }, [keybindings, opts.containerRef, opts.nativeTreeNavigation, rightSidebarExplorerView])
}
