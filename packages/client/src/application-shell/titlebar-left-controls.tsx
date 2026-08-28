import type { Ref } from 'react'

import logo from '../assets/brand/yiru-wordmark.png?url'
import { translate } from '../i18n/i18n'
import {
  ArrowLeft,
  ArrowRight,
  DotsThree as MoreHorizontal,
  SidebarSimple as PanelLeft
} from '../icons/hugeicons'
import { useShortcutLabel } from '../keyboard-input/use-shortcut-label'
import { shellClient } from '../runtime/shell-client'
import { useAppStore } from '../store/state'
import type { AppState } from '../store/types'
import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import { cn } from '../ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import {
  canGoBackWorktreeHistory,
  canGoForwardWorktreeHistory
} from '../worktree/state/nav-history'
import { TITLEBAR_BUTTON_NO_DRAG_CLASS_NAME } from './titlebar-classes'
import type { LeftTitlebarChromeLayout } from './titlebar-left-chrome'
import { shouldShowWorktreeHistoryControls } from './titlebar-worktree-history-controls'
import { hasCustomTitleBar, isMacApp, isPairedWebClient } from './window-chrome-environment'

type TitlebarLeftControlsProps = {
  activeView: AppState['activeView']
  controlsRef: Ref<HTMLDivElement>
  isFullScreen: boolean
  layout: LeftTitlebarChromeLayout
  showSidebar: boolean
  sidebarOpen: boolean
}

export function TitlebarLeftControls({
  activeView,
  controlsRef,
  isFullScreen,
  layout,
  showSidebar,
  sidebarOpen
}: TitlebarLeftControlsProps): React.JSX.Element {
  const canGoBack = useAppStore(canGoBackWorktreeHistory)
  const canGoForward = useAppStore(canGoForwardWorktreeHistory)
  const leftSidebarShortcutLabel = useShortcutLabel('sidebar.left.toggle')
  const historyBackShortcutLabel = useShortcutLabel('worktree.history.back')
  const historyForwardShortcutLabel = useShortcutLabel('worktree.history.forward')
  const showHistoryControls = shouldShowWorktreeHistoryControls(activeView)
  const controlVariant = layout.shouldMount ? 'outline-transparent' : 'ghost'
  const sidebarToggle = showSidebar ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={controlVariant}
            size="icon-titlebar-wide"
            className={cn(
              TITLEBAR_BUTTON_NO_DRAG_CLASS_NAME,
              showHistoryControls && !sidebarOpen && 'border-r-0'
            )}
            onClick={() => useAppStore.getState().toggleSidebar()}
            aria-label={translate('worktree.sidebar.toggle', 'Toggle worktree sidebar')}
          >
            <PanelLeft />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {translate('worktree.sidebar.toggleShortcut', 'Toggle worktree sidebar ({{value0}})', {
          value0: leftSidebarShortcutLabel
        })}
      </TooltipContent>
    </Tooltip>
  ) : null

  return (
    <div
      ref={controlsRef}
      className={cn('flex h-full shrink-0 items-center', layout.isFloating ? 'w-max' : 'w-full')}
    >
      {(!isMacApp || !isFullScreen || (showSidebar && !showHistoryControls)) && (
        <div className="flex h-full items-center">
          {isMacApp && !isPairedWebClient && !isFullScreen ? (
            <div className="w-[calc(92px/var(--ui-zoom-factor,1))] shrink-0" />
          ) : hasCustomTitleBar ? (
            <>
              <img
                src={logo}
                alt=""
                aria-hidden
                className="mr-1 ml-2.5 h-4 shrink-0 opacity-75 invert dark:invert-0"
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className={cn('mr-2', TITLEBAR_BUTTON_NO_DRAG_CLASS_NAME)}
                      aria-label={translate('auto.App.8b0b8eb54f', 'Application menu')}
                      onClick={() => shellClient.ui.popupMenu()}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  }
                />
                <TooltipContent side="bottom" sideOffset={6}>
                  {translate('auto.App.8b0b8eb54f', 'Application menu')}
                </TooltipContent>
              </Tooltip>
            </>
          ) : null}
          {!showHistoryControls ? sidebarToggle : null}
        </div>
      )}
      {showHistoryControls ? (
        <div className={cn('flex h-full items-stretch', sidebarOpen && 'min-w-0 flex-1')}>
          <ButtonGroup className="h-full">{sidebarToggle}</ButtonGroup>
          <ButtonGroup className={cn('h-full', sidebarOpen && 'ml-auto')}>
            <HistoryButton
              direction="back"
              disabled={!canGoBack}
              label={historyBackShortcutLabel}
              variant={controlVariant}
            />
            <HistoryButton
              direction="forward"
              disabled={!canGoForward}
              label={historyForwardShortcutLabel}
              variant={controlVariant}
            />
          </ButtonGroup>
        </div>
      ) : null}
    </div>
  )
}

type HistoryButtonProps = {
  direction: 'back' | 'forward'
  disabled: boolean
  label: string
  variant: 'ghost' | 'outline-transparent'
}

function HistoryButton({
  direction,
  disabled,
  label,
  variant
}: HistoryButtonProps): React.JSX.Element {
  const isBack = direction === 'back'
  const ariaLabel = isBack
    ? translate('auto.App.064bd07810', 'Go back')
    : translate('auto.App.cf9099fe98', 'Go forward')
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size="icon-titlebar"
            className={cn(TITLEBAR_BUTTON_NO_DRAG_CLASS_NAME, 'border-r-0')}
            onClick={() => {
              const state = useAppStore.getState()
              if (isBack) {
                state.goBackWorktree()
              } else {
                state.goForwardWorktree()
              }
            }}
            disabled={disabled}
            aria-label={ariaLabel}
          >
            {isBack ? <ArrowLeft /> : <ArrowRight />}
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {isBack
          ? translate('auto.App.fe21e8f6f5', 'Go back ({{value0}})', { value0: label })
          : translate('auto.App.f7aa73e785', 'Go forward ({{value0}})', { value0: label })}
      </TooltipContent>
    </Tooltip>
  )
}
