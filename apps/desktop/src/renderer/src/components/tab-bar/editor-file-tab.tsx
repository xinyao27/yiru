import { useSortable } from '@dnd-kit/sortable'
import {
  GitDiff as GitCompareArrows,
  Eye,
  ShieldWarning as ShieldAlert,
  PushPin as Pin,
  ListChecks
} from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getEditorDisplayLabel } from '@/components/editor/editor-labels'
import { canOpenMarkdownPreview } from '@/components/editor/markdown-preview-controls'
import { getUntitledFileRoot } from '@/components/editor/untitled-file-rename-path'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { getFileTypeIcon } from '@/lib/file-type-icons'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import { detectLanguage } from '@/lib/language-detect'
import { basename, normalizeRelativePath } from '@/lib/path'
import { renameFileOnDisk } from '@/lib/rename-file'
import { useAppStore } from '@/store'
import { useRepoById, useWorktreeById } from '@/store/selectors'

import type { GitFileStatus } from '../../../../shared/types'
import type { OpenFile } from '../../store/slices/editor'
import { STATUS_COLORS, STATUS_LABELS } from '../right-sidebar/status-display'
import type { TabDragItemData } from '../tab-group/use-tab-drag-split'
import { getDropIndicatorClasses, type DropIndicator } from './drop-indicator'
import { EditorFileTabContextMenu } from './editor-file-tab-context-menu'
import { preventMiddleButtonDefault } from './middle-button-default-guard'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from './sortable-tab'
import {
  getTitlebarTabStateClasses,
  TAB_LEADING_ICON_CLASSES,
  TAB_ROOT_CLASSES
} from './tab-chrome-classes'
import { TabCloseButton } from './tab-close-button'
import { useTabStripPointerActivation } from './tab-strip-pointer-activation'
import { TAB_CONTAINER_WIDTH_CLASSES, TAB_LABEL_WIDTH_CLASSES } from './tab-width-rules'

export default function EditorFileTab({
  file,
  isActive,
  isPinned,
  hasTabsToRight,
  statusByRelativePath,
  onActivate,
  onClose,
  onCloseToRight,
  onCloseAll,
  onMakePermanent,
  onTogglePin,
  dragData,
  dropIndicator
}: {
  file: OpenFile & { tabId?: string }
  isActive: boolean
  isPinned: boolean
  hasTabsToRight: boolean
  statusByRelativePath: Map<string, GitFileStatus>
  onActivate: () => void
  onClose: () => void
  onCloseToRight: () => void
  onCloseAll: () => void
  onMakePermanent?: () => void
  onTogglePin: () => void
  dragData: TabDragItemData
  dropIndicator?: DropIndicator
}): React.JSX.Element {
  const worktree = useWorktreeById(file.worktreeId)
  const repo = useRepoById(worktree?.repoId ?? null)
  const FileIcon = getFileTypeIcon(file.filePath)
  // Why: no transform/transition/isDragging styling — the drag design is
  // that tabs stay visually anchored; only the blue insertion bar moves.
  const { attributes, listeners, setNodeRef } = useSortable({
    // Why: split groups can duplicate the same open file into multiple visible
    // tabs. Using the unified tab ID keeps each rendered tab draggable as a
    // distinct item instead of collapsing every copy onto the file entity ID.
    id: file.tabId ?? file.id,
    data: dragData
  })

  const isDiff = file.mode === 'diff'
  const isConflictReview = file.mode === 'conflict-review'
  const isCheckDetails = file.mode === 'check-details'
  const isMarkdownPreviewTab = file.mode === 'markdown-preview'
  // Why: only deleted/renamed mean the file is gone from its path, which is
  // what strikethrough conveys. 'changed' keeps a normal label — its surface
  // is the changed-on-disk banner inside the editor.
  const isMissingFileMutation =
    file.externalMutation === 'deleted' || file.externalMutation === 'renamed'
  const resolvedLanguage =
    file.mode === 'diff'
      ? detectLanguage(file.relativePath)
      : isConflictReview
        ? 'plaintext'
        : file.language
  const canShowMarkdownPreview = canOpenMarkdownPreview({
    language: resolvedLanguage,
    mode: file.mode,
    diffSource: file.diffSource
  })
  const openMarkdownPreview = useAppStore((s) => s.openMarkdownPreview)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPoint, setMenuPoint] = useState({ x: 0, y: 0 })
  const [isRenaming, setIsRenaming] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const renameFocusFrameRef = useRef<number | null>(null)
  const skipMenuFocusRestoreRef = useRef(false)
  // Escape fires setIsRenaming(false), which unmounts the input. The browser
  // still fires focusout as the focused node is removed, so onBlur can invoke
  // commitRename *after* cancel — committing the typed value against the
  // user's intent. This flag suppresses the trailing blur-commit.
  const renameCancelledRef = useRef(false)
  // Only on-disk edit tabs are renameable. Diff, conflict-review, and
  // combined/virtual views don't point at a single concrete file we can safely
  // rename. Read-only tabs (AI Vault View Log) also stay unrenameable — rename
  // would rewrite the agent-owned artifact's backing path.
  const canRename = file.mode === 'edit' && !file.diffSource && !file.conflict && !file.readOnly

  const openRenameInput = (): void => {
    if (!canRename) {
      return
    }
    renameCancelledRef.current = false
    setIsRenaming(true)
  }

  const commitRename = (): void => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false
      setIsRenaming(false)
      return
    }
    const input = renameInputRef.current
    if (!input) {
      setIsRenaming(false)
      return
    }
    const newName = input.value.trim()
    setIsRenaming(false)
    if (!newName) {
      return
    }
    const oldName = basename(file.filePath)
    if (newName === oldName) {
      return
    }
    const worktreePath = getUntitledFileRoot(file, worktree?.path ?? null)
    void renameFileOnDisk({
      oldPath: file.filePath,
      newName,
      worktreeId: file.worktreeId,
      worktreePath
    })
  }

  const setRenameInputElement = useCallback(
    (input: HTMLInputElement | null) => {
      if (renameFocusFrameRef.current !== null) {
        cancelAnimationFrame(renameFocusFrameRef.current)
        renameFocusFrameRef.current = null
      }
      renameInputRef.current = input
      if (!input) {
        return
      }
      // Why: Radix closes the context menu after onSelect; defer focus so its
      // teardown cannot steal focus back or blur-commit the newly mounted input.
      renameFocusFrameRef.current = requestAnimationFrame(() => {
        renameFocusFrameRef.current = null
        if (renameInputRef.current !== input) {
          return
        }
        input.focus()
        const name = basename(file.filePath)
        const dotIndex = name.lastIndexOf('.')
        if (dotIndex > 0) {
          input.setSelectionRange(0, dotIndex)
        } else {
          input.select()
        }
      })
    },
    [file.filePath]
  )

  const tabStatus =
    file.relativePath === 'All Changes'
      ? null
      : (statusByRelativePath.get(normalizeRelativePath(file.relativePath)) ?? null)
  const tabStatusColor = tabStatus ? STATUS_COLORS[tabStatus] : undefined
  const tabLabel = getEditorDisplayLabel(file)

  useEffect(() => {
    const closeMenu = (): void => setMenuOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [])

  // Why: Electron <webview> elements run in a separate process, so clicking
  // inside one never dispatches a pointerdown on the renderer document. Radix
  // DropdownMenu relies on document pointerdown for outside-click detection,
  // so it misses webview clicks. Listening for window blur catches the moment
  // focus leaves the renderer (including into a webview).
  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const dismiss = (): void => setMenuOpen(false)
    window.addEventListener('blur', dismiss)
    return () => window.removeEventListener('blur', dismiss)
  }, [menuOpen])

  const dragListeners = isRenaming ? undefined : listeners
  // Why: defer activation to pointer-up so dragging the tab (reorder / move into
  // another pane / split) does not switch the active tab mid-gesture.
  const { onPointerDown: onTabPointerDown } = useTabStripPointerActivation({
    onActivate,
    disabled: isRenaming
  })
  const tabIconClassName = cn(TAB_LEADING_ICON_CLASSES, 'text-muted-foreground')
  const conflictIconClassName = cn(
    TAB_LEADING_ICON_CLASSES,
    isActive ? 'text-orange-400' : 'text-orange-400/70'
  )

  const tabRoot = (
    <div
      ref={setNodeRef}
      data-tab-id={file.tabId ?? file.id}
      data-pinned={isPinned ? 'true' : 'false'}
      {...attributes}
      {...dragListeners}
      className={cn(
        TAB_ROOT_CLASSES,
        getDropIndicatorClasses(dropIndicator ?? null),
        getTitlebarTabStateClasses(isActive)
      )}
      onPointerDown={(e) => {
        onTabPointerDown(
          e,
          dragListeners?.onPointerDown as ((event: React.PointerEvent<Element>) => void) | undefined
        )
      }}
      onDoubleClick={() => {
        if (file.isPreview && onMakePermanent) {
          onMakePermanent()
        }
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault()
        }
      }}
      onMouseUp={preventMiddleButtonDefault}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault()
          e.stopPropagation()
          if (isPinned) {
            return
          }
          onClose()
        }
      }}
    >
      {isConflictReview ? (
        <ShieldAlert className={conflictIconClassName} />
      ) : isCheckDetails ? (
        <ListChecks className={tabIconClassName} />
      ) : isDiff ? (
        <GitCompareArrows className={tabIconClassName} />
      ) : isMarkdownPreviewTab ? (
        <Eye className={tabIconClassName} />
      ) : (
        <FileIcon className={tabIconClassName} />
      )}
      {isPinned && <Pin className="text-muted-foreground mr-1 size-3.5 shrink-0" aria-hidden />}
      <span className="mr-1 flex min-w-0 flex-1 items-baseline gap-1">
        {isRenaming ? (
          <Input
            ref={setRenameInputElement}
            data-tab-rename-input="true"
            aria-label={translate(
              'auto.components.tab.bar.EditorFileTab.3da7445c84',
              'Rename file {{value0}}',
              { value0: basename(file.filePath) }
            )}
            defaultValue={basename(file.filePath)}
            // Why: keep the inline field compact enough for the titlebar while
            // giving filenames a little more room than the static tab label.
            className="bg-input/40 text-foreground mr-1 h-5 w-[12ch] max-w-[132px] min-w-[72px] rounded-sm px-1 py-0 text-xs md:text-xs"
            spellCheck={false}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              // Why: an Enter that only confirms a CJK IME candidate must not
              // commit the rename; wait for a non-composition Enter.
              if (isImeCompositionKeyDown(e)) {
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                commitRename()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                renameCancelledRef.current = true
                setIsRenaming(false)
              }
            }}
            onBlur={commitRename}
          />
        ) : (
          <span
            className={cn(
              TAB_LABEL_WIDTH_CLASSES,
              file.isPreview && 'italic',
              isMissingFileMutation && 'line-through'
            )}
            style={tabStatusColor ? { color: tabStatusColor } : undefined}
            onDoubleClick={(e) => {
              if (file.isPreview && onMakePermanent) {
                e.stopPropagation()
                onMakePermanent()
                return
              }
              // Why: preview tabs use double-click to become permanent. Scope
              // rename to non-preview filename text so preview promotion wins on
              // the tab label as well as the surrounding tab chrome.
              if (!canRename) {
                return
              }
              e.stopPropagation()
              openRenameInput()
            }}
          >
            {tabLabel}
          </span>
        )}
        {isMissingFileMutation && !isRenaming && (
          <span className="text-muted-foreground shrink-0 text-[10px] leading-none font-semibold tracking-wide">
            {file.externalMutation}
          </span>
        )}
        {tabStatus && !isRenaming && !isMissingFileMutation && (
          <span
            className="shrink-0 text-[10px] leading-none font-semibold tracking-wide"
            style={{ color: tabStatusColor }}
          >
            {STATUS_LABELS[tabStatus]}
          </span>
        )}
      </span>
      {/* Why: clean tabs keep close outside layout; dirty tabs reserve only the
          status dot's slot, which the hover close affordance replaces in place. */}
      {file.isDirty ? (
        <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          <span className="bg-foreground/60 absolute size-1.5 rounded-full group-focus-within:hidden group-hover:hidden" />
          {!isPinned && (
            <TabCloseButton
              className="right-0"
              ariaLabel={translate(
                'auto.components.tab.bar.EditorFileTabCloseButton.4655cf570e',
                'Close tab'
              )}
              onClose={onClose}
            />
          )}
        </div>
      ) : !isPinned ? (
        <TabCloseButton
          className="right-0"
          ariaLabel={translate(
            'auto.components.tab.bar.EditorFileTabCloseButton.4655cf570e',
            'Close tab'
          )}
          onClose={onClose}
        />
      ) : null}
    </div>
  )

  return (
    <>
      <div
        className={TAB_CONTAINER_WIDTH_CLASSES}
        onContextMenuCapture={(event) => {
          event.preventDefault()
          window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
          setMenuPoint({ x: event.clientX, y: event.clientY })
          setMenuOpen(true)
        }}
      >
        {isRenaming || menuOpen ? (
          tabRoot
        ) : (
          <Tooltip>
            <TooltipTrigger render={tabRoot} />
            <TooltipContent
              side="bottom"
              sideOffset={6}
              className="max-w-80 text-left break-words whitespace-normal"
            >
              {tabLabel}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <EditorFileTabContextMenu
        open={menuOpen}
        menuPoint={menuPoint}
        file={file}
        unifiedTabId={dragData.unifiedTabId}
        groupId={dragData.groupId}
        isPinned={isPinned}
        isRenaming={isRenaming}
        hasTabsToRight={hasTabsToRight}
        canRename={canRename}
        canShowMarkdownPreview={canShowMarkdownPreview}
        resolvedLanguage={resolvedLanguage}
        repoConnectionId={repo?.connectionId ?? null}
        skipMenuFocusRestoreRef={skipMenuFocusRestoreRef}
        onOpenChange={setMenuOpen}
        onActivate={onActivate}
        onOpenRenameInput={openRenameInput}
        onTogglePin={onTogglePin}
        onClose={onClose}
        onCloseAll={onCloseAll}
        onCloseToRight={onCloseToRight}
        onOpenMarkdownPreview={openMarkdownPreview}
      />
    </>
  )
}
