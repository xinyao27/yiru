import { Copy, Eye, Pencil } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

import { ArrowSquareOut as ExternalLink } from '@/components/regular-icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import type { OpenFile } from '@/store/slices/editor'

import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '../tab-bar/sortable-tab'
import { getEditorHeaderCopyState } from './editor-header'
import { useEditorHeaderFileRename } from './editor-header-file-rename'

const isMac = navigator.userAgent.includes('Mac')
const isLinux = navigator.userAgent.includes('Linux')

/** Platform-appropriate label: macOS -> Finder, Windows -> File Explorer, Linux -> Files */
const revealLabel = isMac
  ? 'Reveal in Finder'
  : isLinux
    ? 'Open Containing Folder'
    : 'Reveal in File Explorer'

type EditorPanelHeaderPathProps = {
  activeFile: OpenFile
  copiedPathVisible: boolean
  canShowMarkdownPreview: boolean
  onCopyPath: () => void
  onOpenMarkdownPreview: () => void
  onOpenContainingFolder: () => void
}

export function EditorPanelHeaderPath({
  activeFile,
  copiedPathVisible,
  canShowMarkdownPreview,
  onCopyPath,
  onOpenMarkdownPreview,
  onOpenContainingFolder
}: EditorPanelHeaderPathProps): React.JSX.Element {
  const [pathMenuOpen, setPathMenuOpen] = useState(false)
  const [pathMenuPoint, setPathMenuPoint] = useState({ x: 0, y: 0 })
  const skipMenuFocusRestoreRef = useRef(false)
  const headerCopyState = getEditorHeaderCopyState(activeFile)
  const canCopyHeaderPath = headerCopyState.copyText !== null
  const isVirtualEditorTab = activeFile.mode === 'check-details'
  const markdownPreviewShortcutLabel = useShortcutLabel('editor.markdownPreview')
  const {
    canRename,
    currentFileName,
    isRenaming,
    renameInputRef,
    openRenameInput,
    commitRename,
    cancelRename
  } = useEditorHeaderFileRename(activeFile)

  useEffect(() => {
    const closeMenu = (): void => setPathMenuOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [])

  return (
    <div className="editor-header-text">
      <div
        className="editor-header-path-row"
        onContextMenuCapture={(event) => {
          event.preventDefault()
          window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
          setPathMenuPoint({ x: event.clientX, y: event.clientY })
          setPathMenuOpen(true)
        }}
      >
        {isRenaming ? (
          <Input
            ref={renameInputRef}
            data-editor-header-rename-input="true"
            aria-label={translate(
              'auto.components.editor.EditorPanelHeader.1bb1e226ec',
              'Rename file {{value0}}',
              { value0: currentFileName }
            )}
            defaultValue={currentFileName}
            // Why: the header is narrow in floating mode; this keeps the
            // edit field aligned with the path label without growing chrome.
            className="bg-input/40 text-foreground h-6 w-[16ch] max-w-full min-w-[104px] rounded-sm px-1.5 py-0 font-mono text-xs md:text-xs"
            spellCheck={false}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.stopPropagation()
                commitRename()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                cancelRename()
              }
            }}
            onBlur={commitRename}
          />
        ) : (
          <button
            type="button"
            className={cn(
              'outline-none focus-visible:bg-accent',
              'editor-header-path',
              canCopyHeaderPath ? '' : 'editor-header-path--static'
            )}
            onClick={canCopyHeaderPath ? onCopyPath : undefined}
            disabled={!canCopyHeaderPath}
            title={headerCopyState.pathTitle}
          >
            {headerCopyState.pathLabel}
          </button>
        )}
        <span
          className={cn('editor-header-copy-toast', copiedPathVisible ? 'is-visible' : '')}
          aria-live="polite"
        >
          {headerCopyState.copyToastLabel}
        </span>
      </div>
      <DropdownMenu open={pathMenuOpen} onOpenChange={setPathMenuOpen} modal={false}>
        <DropdownMenuTrigger
          render={
            <button
              aria-hidden
              tabIndex={-1}
              className="pointer-events-none fixed size-px opacity-0"
              style={{ left: pathMenuPoint.x, top: pathMenuPoint.y }}
            />
          }
        />
        <DropdownMenuContent
          className="w-56"
          sideOffset={0}
          align="start"
          finalFocus={() => {
            if (!skipMenuFocusRestoreRef.current) {
              return
            }
            skipMenuFocusRestoreRef.current = false
            // Return false to suppress the default focus restore.
            return false
          }}
        >
          <DropdownMenuItem
            disabled={!canRename}
            onClick={() => {
              skipMenuFocusRestoreRef.current = true
              openRenameInput()
            }}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {translate('auto.components.editor.EditorPanelHeader.84cdc0794b', 'Rename')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {!isVirtualEditorTab && (
            <>
              <DropdownMenuItem
                onClick={() => {
                  void window.api.ui.writeClipboardText(activeFile.filePath)
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {translate('auto.components.editor.EditorPanelHeader.7c08a1f990', 'Copy Path')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void window.api.ui.writeClipboardText(activeFile.relativePath)
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {translate(
                  'auto.components.editor.EditorPanelHeader.269ce4842b',
                  'Copy Relative Path'
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {canShowMarkdownPreview && (
            <DropdownMenuItem onClick={onOpenMarkdownPreview}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              {translate(
                'auto.components.editor.EditorPanelHeader.4157f3cbf3',
                'Open Markdown Preview'
              )}
              <DropdownMenuShortcut>{markdownPreviewShortcutLabel}</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          {canShowMarkdownPreview && <DropdownMenuSeparator />}
          {!isVirtualEditorTab && (
            <DropdownMenuItem onClick={onOpenContainingFolder}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              {revealLabel}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
