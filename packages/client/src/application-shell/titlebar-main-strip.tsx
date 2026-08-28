import { useShallow } from 'zustand/react/shallow'

import { TOGGLE_TERMINAL_PANE_EXPAND_EVENT } from '../constants/terminal'
import { translate } from '../i18n/i18n'
import { ArrowsIn as Minimize2 } from '../icons/hugeicons'
import { useAppStore } from '../store/state'
import { selectActiveTerminalChromeState } from '../terminal/state/chrome-selector'
import { Button } from '../ui/button'
import { cn } from '../ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { YiruProfileSwitcher } from '../yiru-profiles/yiru-profile-switcher'
import { TITLEBAR_BUTTON_NO_DRAG_CLASS_NAME } from './titlebar-classes'
import type { LeftTitlebarChromeLayout } from './titlebar-left-chrome'
import { hasCustomTitleBar } from './window-chrome-environment'

type TitlebarMainStripProps = {
  creationLayoutActive: boolean
  showProfileSwitcher: boolean
  workspaceChromeActive: boolean
}

export function TitlebarMainStrip({
  creationLayoutActive,
  showProfileSwitcher,
  workspaceChromeActive
}: TitlebarMainStripProps): React.JSX.Element {
  const { activeTabCanExpand, effectiveActiveTabExpanded, effectiveActiveTabId, tabCount } =
    useAppStore(useShallow(selectActiveTerminalChromeState))
  const showExpandButton = workspaceChromeActive && tabCount < 2 && effectiveActiveTabExpanded

  return (
    <>
      {creationLayoutActive ? null : (
        <div
          id="titlebar-tabs"
          className={cn(
            'flex flex-1 min-w-0 self-stretch',
            !workspaceChromeActive && 'invisible pointer-events-none'
          )}
        />
      )}
      {showExpandButton ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={cn(
                  'bg-background text-muted-foreground mr-2',
                  TITLEBAR_BUTTON_NO_DRAG_CLASS_NAME
                )}
                onClick={() => {
                  if (effectiveActiveTabId) {
                    window.dispatchEvent(
                      new CustomEvent(TOGGLE_TERMINAL_PANE_EXPAND_EVENT, {
                        detail: { tabId: effectiveActiveTabId }
                      })
                    )
                  }
                }}
                aria-label={translate('auto.App.c1cf0b0e4a', 'Collapse pane')}
                disabled={!activeTabCanExpand}
              >
                <Minimize2 className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.App.c1cf0b0e4a', 'Collapse pane')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {showProfileSwitcher ? <YiruProfileSwitcher /> : null}
      {hasCustomTitleBar ? (
        <div className="w-[var(--window-controls-width,0px)] shrink-0 [[data-regular-terminal-input-focused]_&]:[-webkit-app-region:no-drag]" />
      ) : null}
    </>
  )
}

type WorkspaceProfileSwitcherProps = {
  layout: LeftTitlebarChromeLayout
  showProfileSwitcher: boolean
  stackedSidebarOpen: boolean
  workspaceChromeActive: boolean
}

export function WorkspaceProfileSwitcher({
  layout,
  showProfileSwitcher,
  stackedSidebarOpen,
  workspaceChromeActive
}: WorkspaceProfileSwitcherProps): React.JSX.Element | null {
  if (!showProfileSwitcher || !workspaceChromeActive || !layout.shouldMount || stackedSidebarOpen) {
    return null
  }
  return (
    <div className="absolute top-0 right-[var(--window-controls-width)] z-10 flex h-[var(--titlebar-height)] items-center [-webkit-app-region:no-drag]">
      <YiruProfileSwitcher />
    </div>
  )
}
