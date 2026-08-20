import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
  type RefObject
} from 'react'
import {
  ArrowClockwise,
  Clipboard,
  Copy,
  GitFork,
  ChatCentered as MessageSquarePlus,
  Layout as PanelBottomClose,
  Layout as PanelsTopLeft,
  Sidebar as PanelRightClose,
  Pencil,
  TerminalWindow as SquareTerminal,
  ArrowsOut as Maximize2,
  ArrowsIn as Minimize2,
  X
} from '~renderer/components/icons/hugeicons'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut
} from '~renderer/components/ui/context-menu'
import { translate } from '~renderer/i18n/i18n'
import { shellClient } from '~renderer/runtime/shell-client'

import { isMacPlatform, nativeChatToggleShortcutLabel } from './shortcut'

type NativeChatContextMenuState = {
  open: boolean
  selectedText: string
}

type UseNativeChatContextMenuArgs = {
  rootRef: RefObject<HTMLElement | null>
  onSwitchToTerminal?: () => void
  onNewConversation?: () => void
  actions: NativeChatContextMenuActions
}

export type NativeChatContextMenuActions = {
  onPaste: () => void
  onSplitRight: () => void
  onSplitDown: () => void
  canEqualizePaneSizes: boolean
  onEqualizePaneSizes: () => void
  canExpandPane: boolean
  isPaneExpanded: boolean
  onToggleExpand: () => void
  canContinueAgentSessionInNewSession: boolean
  onContinueAgentSessionInNewSession: () => void
  onForkAgentSession: () => void
  onSetTitle: () => void
  onCopyTerminalId: () => void
  onCopyPaneId: () => void
  canClosePane: boolean
  onClosePane: () => void
}

/** No-op defaults for when the view has no pane-management actions wired. */
export const emptyNativeChatContextMenuActions: Omit<NativeChatContextMenuActions, 'onPaste'> = {
  onSplitRight: () => {},
  onSplitDown: () => {},
  canEqualizePaneSizes: false,
  onEqualizePaneSizes: () => {},
  canExpandPane: false,
  isPaneExpanded: false,
  onToggleExpand: () => {},
  canContinueAgentSessionInNewSession: false,
  onContinueAgentSessionInNewSession: () => {},
  onForkAgentSession: () => {},
  onSetTitle: () => {},
  onCopyTerminalId: () => {},
  onCopyPaneId: () => {},
  canClosePane: false,
  onClosePane: () => {}
}

export function useNativeChatContextMenu({
  rootRef,
  onSwitchToTerminal,
  onNewConversation,
  actions
}: UseNativeChatContextMenuArgs): {
  open: boolean
  setOpen: (open: boolean) => void
  onContextMenu: MouseEventHandler<HTMLElement>
  onSelectionCapture: () => void
  menu: React.JSX.Element
} {
  const menuOpenedAtRef = useRef(0)
  const lastSelectedTextRef = useRef('')
  const [state, setState] = useState<NativeChatContextMenuState>({
    open: false,
    selectedText: ''
  })
  const shortcutLabel = useMemo(() => nativeChatToggleShortcutLabel(isMacPlatform()), [])

  const rememberCurrentSelection = useCallback(() => {
    const selectedText = getNativeChatSelectedText(rootRef.current)
    if (selectedText.trim().length > 0) {
      lastSelectedTextRef.current = selectedText
    }
  }, [rootRef])

  useEffect(() => {
    document.addEventListener('selectionchange', rememberCurrentSelection)
    return () => document.removeEventListener('selectionchange', rememberCurrentSelection)
  }, [rememberCurrentSelection])

  // Why: Base UI's trigger owns opening and pointer anchoring; this only
  // snapshots the selection the menu's Copy item acts on.
  const onContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.stopPropagation()
      menuOpenedAtRef.current = Date.now()
      const selectedText = getNativeChatSelectedText(rootRef.current) || lastSelectedTextRef.current
      setState((prev) => ({ ...prev, selectedText }))
    },
    [rootRef]
  )

  const setOpen = useCallback((open: boolean) => {
    if (!open && Date.now() - menuOpenedAtRef.current < 100) {
      return
    }
    setState((prev) => ({ ...prev, open }))
  }, [])

  return {
    open: state.open,
    setOpen,
    onContextMenu,
    onSelectionCapture: rememberCurrentSelection,
    menu: (
      <ContextMenuContent className="w-56" finalFocus={false}>
        <ContextMenuItem
          disabled={state.selectedText.trim().length === 0}
          onClick={() => void shellClient.ui.writeClipboardText(state.selectedText)}
        >
          <Copy />
          {translate('auto.components.nativeChat.contextMenu.copy', 'Copy')}
          <ContextMenuShortcut>{isMacPlatform() ? '⌘C' : 'Ctrl+C'}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={actions.onPaste}>
          <Clipboard />
          {translate('auto.components.terminal.pane.TerminalContextMenu.0a917b591a', 'Paste')}
        </ContextMenuItem>
        {onNewConversation ? (
          <ContextMenuItem onClick={onNewConversation}>
            <ArrowClockwise />
            {translate('components.friday.newConversation', 'New conversation')}
          </ContextMenuItem>
        ) : null}
        {onSwitchToTerminal ? (
          <ContextMenuItem onClick={onSwitchToTerminal}>
            <SquareTerminal />
            {translate(
              'components.tab.bar.SortableTabContextMenu.switchToTerminalView',
              'Switch to terminal view'
            )}
            <ContextMenuShortcut>{shortcutLabel}</ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        {actions.canContinueAgentSessionInNewSession ? (
          <ContextMenuItem onClick={actions.onContinueAgentSessionInNewSession}>
            <MessageSquarePlus />
            {translate(
              'components.agentSessionContinuation.continueInNewSession',
              'Continue in New Session…'
            )}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onClick={actions.onForkAgentSession}>
          <GitFork />
          {translate(
            'auto.components.terminal.pane.TerminalContextMenu.8a7ddb8b8a',
            'Fork Agent Session…'
          )}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={actions.onSplitRight}>
          <PanelRightClose />
          {translate(
            'auto.components.terminal.pane.TerminalContextMenu.20e565d865',
            'Split Terminal Right'
          )}
        </ContextMenuItem>
        <ContextMenuItem onClick={actions.onSplitDown}>
          <PanelBottomClose />
          {translate(
            'auto.components.terminal.pane.TerminalContextMenu.98bccf4fa2',
            'Split Terminal Down'
          )}
        </ContextMenuItem>
        {actions.canEqualizePaneSizes ? (
          <ContextMenuItem onClick={actions.onEqualizePaneSizes}>
            <PanelsTopLeft />
            {translate(
              'auto.components.terminal.pane.TerminalContextMenu.06c2b0f043',
              'Equalize Pane Sizes'
            )}
          </ContextMenuItem>
        ) : null}
        {actions.canExpandPane ? (
          <ContextMenuItem onClick={actions.onToggleExpand}>
            {actions.isPaneExpanded ? <Minimize2 /> : <Maximize2 />}
            {actions.isPaneExpanded
              ? translate(
                  'auto.components.terminal.pane.TerminalContextMenu.df766809e0',
                  'Collapse Pane'
                )
              : translate(
                  'auto.components.terminal.pane.TerminalContextMenu.925f49f210',
                  'Expand Pane'
                )}
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={actions.onSetTitle}>
          <Pencil />
          {translate('auto.components.terminal.pane.TerminalContextMenu.39809d152f', 'Set Title…')}
        </ContextMenuItem>
        <ContextMenuItem onClick={actions.onCopyTerminalId}>
          <Copy />
          {translate(
            'auto.components.terminal.pane.TerminalContextMenu.copyTerminalId',
            'Copy Terminal ID'
          )}
        </ContextMenuItem>
        <ContextMenuItem onClick={actions.onCopyPaneId}>
          <Copy />
          {translate(
            'auto.components.terminal.pane.TerminalContextMenu.2cf85a6a55',
            'Copy Pane ID'
          )}
        </ContextMenuItem>
        {actions.canClosePane ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={actions.onClosePane}>
              <X />
              {translate(
                'auto.components.terminal.pane.TerminalContextMenu.8c17d6786d',
                'Close Pane'
              )}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    )
  }
}

function getNativeChatSelectedText(root: HTMLElement | null): string {
  const selection = window.getSelection()
  if (!root || !selection || selection.isCollapsed) {
    return ''
  }
  const anchor = selection.anchorNode
  const focus = selection.focusNode
  if (!nodeBelongsToRoot(anchor, root) || !nodeBelongsToRoot(focus, root)) {
    return ''
  }
  return selection.toString()
}

function nodeBelongsToRoot(node: Node | null, root: HTMLElement): boolean {
  if (!node) {
    return false
  }
  return root.contains(node)
}
