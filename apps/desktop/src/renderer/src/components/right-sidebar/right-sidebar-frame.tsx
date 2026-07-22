import { SidebarSimple as PanelRight } from '@phosphor-icons/react'
import React, { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSidebarResize } from '@/hooks/use-sidebar-resize'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import {
  isPairedWebClientWindow,
  shouldRenderDesktopWindowChrome
} from '@/lib/desktop-window-chrome'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import type { ActiveRightSidebarTab, ActivityBarPosition } from '@/store/slices/editor'

import type { CheckStatus } from '../../../../shared/types'
import {
  ActivityBarButton,
  TopActivityOverflowMenu,
  type ActivityBarItem
} from './activity-bar-buttons'
import { getTopActivityBarLayout } from './activity-bar-overflow'
import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from './right-sidebar-button-styles'
import { useMeasuredWidth } from './right-sidebar-measured-width'
import {
  RIGHT_SIDEBAR_HEADER_DRAG_CLASS_NAME,
  RIGHT_SIDEBAR_HEADER_NO_DRAG_CLASS_NAME,
  RIGHT_SIDEBAR_TOP_ACTIVITY_STRIP_CLASS_NAME,
  RIGHT_SIDEBAR_WINDOWS_TOP_ACTIVITY_STRIP_CLASS_NAME
} from './right-sidebar-titlebar-drag-regions'
import {
  RIGHT_SIDEBAR_MIN_WIDTH,
  clampRightSidebarPanelWidth,
  computeMaxRightSidebarPanelWidth
} from './right-sidebar-width'

const ACTIVITY_BAR_SIDE_WIDTH = 40

export type RightSidebarFrameProps = {
  activeTab: ActiveRightSidebarTab
  activityBarPosition: ActivityBarPosition
  activityNavigation?: boolean
  children: React.ReactNode
  checksStatus?: CheckStatus | null
  isOpen: boolean
  items: readonly ActivityBarItem[]
  onActivityBarPositionChange: (position: ActivityBarPosition) => void
  onSelectTab: (tab: ActiveRightSidebarTab) => void
  onToggle: () => void
  onWidthChange: (width: number) => void
  toggleShortcut: string
  width: number
}

export function RightSidebarFrame({
  activeTab,
  activityBarPosition,
  activityNavigation = true,
  children,
  checksStatus,
  isOpen,
  items,
  onActivityBarPositionChange,
  onSelectTab,
  onToggle,
  onWidthChange,
  toggleShortcut,
  width
}: RightSidebarFrameProps): React.JSX.Element {
  const hasDesktopWindowChrome = shouldRenderDesktopWindowChrome({
    platform: getRendererAppPlatform(),
    isWebClient: isPairedWebClientWindow()
  })
  const [topActivityStripWidth, setTopActivityStripWidth] = useState<number | null>(null)
  const activityBarSideWidth =
    activityNavigation && activityBarPosition === 'side' ? ACTIVITY_BAR_SIDE_WIDTH : 0
  const windowWidth = useWindowWidth()
  const maxWidth = computeMaxRightSidebarPanelWidth(windowWidth, activityBarSideWidth)
  const renderedWidth = clampRightSidebarPanelWidth(width, windowWidth, activityBarSideWidth)
  const { containerRef, onResizeStart } = useSidebarResize<HTMLDivElement>({
    isOpen,
    width: renderedWidth,
    minWidth: RIGHT_SIDEBAR_MIN_WIDTH,
    maxWidth,
    deltaSign: -1,
    renderedExtraWidth: activityBarSideWidth,
    setWidth: onWidthChange
  })
  const topActivityStripRef = useMeasuredWidth(setTopActivityStripWidth)
  const topActivityLayout = useMemo(
    () => getTopActivityBarLayout(items, topActivityStripWidth, activeTab),
    [activeTab, items, topActivityStripWidth]
  )
  const closeButton = isOpen ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME,
              'mr-1',
              RIGHT_SIDEBAR_HEADER_NO_DRAG_CLASS_NAME
            )}
            onClick={onToggle}
            aria-label={translate(
              'auto.components.right.sidebar.index.e8e2e4ce74',
              'Toggle right sidebar'
            )}
          >
            {/* Why: Phosphor's sidebar glyph is left-oriented by default. */}
            <PanelRight className="-scale-x-100" />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {translate(
          'auto.components.right.sidebar.index.9fffaf17c1',
          'Toggle right sidebar ({{value0}})',
          { value0: toggleShortcut }
        )}
      </TooltipContent>
    </Tooltip>
  ) : null

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex flex-shrink-0 flex-row',
        // Why: the frame stays mounted at width zero, so closed chrome must not leak into the app.
        isOpen ? 'overflow-visible' : 'overflow-hidden'
      )}
    >
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col overflow-hidden bg-sidebar',
          isOpen ? 'border-l border-sidebar-border' : 'border-l-0'
        )}
      >
        {activityNavigation && activityBarPosition === 'top' ? (
          <ContextMenu>
            {/* Why: the desktop window controls overlay the right edge of this header. */}
            <div
              data-testid="right-sidebar-titlebar"
              className={cn(
                'right-sidebar-header-drag flex h-[36px] min-h-[36px] items-center overflow-hidden border-b border-border pr-[var(--window-controls-width,0px)] select-none [[data-regular-terminal-input-focused]_&]:[-webkit-app-region:no-drag]',
                RIGHT_SIDEBAR_HEADER_DRAG_CLASS_NAME
              )}
            >
              {!hasDesktopWindowChrome ? (
                <>
                  <ContextMenuTrigger
                    render={
                      <div
                        ref={topActivityStripRef}
                        data-testid="right-sidebar-activity-strip"
                        className={RIGHT_SIDEBAR_TOP_ACTIVITY_STRIP_CLASS_NAME}
                      >
                        <TopActivityItems
                          activeTab={activeTab}
                          checksStatus={checksStatus}
                          containerNoDrag
                          layout={topActivityLayout}
                          onSelectTab={onSelectTab}
                        />
                      </div>
                    }
                  />
                  <div
                    className={cn(
                      'flex shrink-0 items-center pr-1',
                      RIGHT_SIDEBAR_HEADER_NO_DRAG_CLASS_NAME
                    )}
                  >
                    {closeButton}
                  </div>
                </>
              ) : (
                <div
                  className={cn(
                    'ml-auto flex shrink-0 items-center pr-1',
                    RIGHT_SIDEBAR_HEADER_NO_DRAG_CLASS_NAME
                  )}
                >
                  {closeButton}
                </div>
              )}
            </div>
            {hasDesktopWindowChrome ? (
              <ContextMenuTrigger
                render={
                  <div
                    ref={topActivityStripRef}
                    data-testid="right-sidebar-activity-strip"
                    className={RIGHT_SIDEBAR_WINDOWS_TOP_ACTIVITY_STRIP_CLASS_NAME}
                  >
                    {/* Why: desktop controls own the titlebar; navigation moves below them. */}
                    <TopActivityItems
                      activeTab={activeTab}
                      checksStatus={checksStatus}
                      layout={topActivityLayout}
                      onSelectTab={onSelectTab}
                    />
                  </div>
                }
              />
            ) : null}
            <ActivityBarPositionMenu
              currentPosition={activityBarPosition}
              onChangePosition={onActivityBarPositionChange}
            />
          </ContextMenu>
        ) : (
          // Why: local panel launchers live in the workspace tab menu; the
          // sidebar header only identifies the active destination and closes it.
          <div
            className={cn(
              'right-sidebar-header-drag flex h-[36px] min-h-[36px] items-center justify-between border-b border-border pl-3 select-none [[data-regular-terminal-input-focused]_&]:[-webkit-app-region:no-drag]',
              activityNavigation
                ? 'pr-[max(0px,calc(var(--window-controls-width,0px)-40px))]'
                : 'pr-[var(--window-controls-width,0px)]',
              RIGHT_SIDEBAR_HEADER_DRAG_CLASS_NAME
            )}
          >
            <span className="text-foreground text-[11px] font-semibold tracking-wider uppercase">
              {items.find((item) => item.id === activeTab)?.title ?? ''}
            </span>
            <div className="flex items-center">{closeButton}</div>
          </div>
        )}

        {isOpen ? (
          <div className="scrollbar-sleek-parent flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        ) : null}

        <div
          className="hover:bg-ring/20 active:bg-ring/30 absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize transition-colors"
          onMouseDown={onResizeStart}
        />
      </div>

      {activityNavigation && activityBarPosition === 'side' ? (
        <ContextMenu>
          <ContextMenuTrigger
            render={
              // Why: desktop window controls otherwise cover the first icon in the rail.
              <div className="side-activity-bar-windows-inset border-border bg-sidebar flex w-10 min-w-[40px] flex-col items-center border-l pt-[var(--window-controls-height,0px)]">
                {items.map((item) => (
                  <ActivityBarButton
                    key={item.id}
                    item={item}
                    active={activeTab === item.id}
                    onClick={() => onSelectTab(item.id)}
                    layout="side"
                    statusIndicator={item.id === 'checks' ? checksStatus : null}
                  />
                ))}
              </div>
            }
          />
          <ActivityBarPositionMenu
            currentPosition={activityBarPosition}
            onChangePosition={onActivityBarPositionChange}
          />
        </ContextMenu>
      ) : null}
    </div>
  )
}

function TopActivityItems({
  activeTab,
  checksStatus,
  containerNoDrag = false,
  layout,
  onSelectTab
}: {
  activeTab: ActiveRightSidebarTab
  checksStatus?: CheckStatus | null
  containerNoDrag?: boolean
  layout: { visibleItems: ActivityBarItem[]; overflowItems: ActivityBarItem[] }
  onSelectTab: (tab: ActiveRightSidebarTab) => void
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 shrink',
        containerNoDrag && RIGHT_SIDEBAR_HEADER_NO_DRAG_CLASS_NAME
      )}
    >
      <div className="flex min-w-0 shrink gap-0.5">
        {layout.visibleItems.map((item) => (
          <ActivityBarButton
            key={item.id}
            item={item}
            active={activeTab === item.id}
            onClick={() => onSelectTab(item.id)}
            layout="top"
            statusIndicator={item.id === 'checks' ? checksStatus : null}
          />
        ))}
      </div>
      {layout.overflowItems.length > 0 ? (
        <TopActivityOverflowMenu
          items={layout.overflowItems}
          activeTab={activeTab}
          onSelect={onSelectTab}
          checksStatus={checksStatus}
        />
      ) : null}
    </div>
  )
}

function ActivityBarPositionMenu({
  currentPosition,
  onChangePosition
}: {
  currentPosition: ActivityBarPosition
  onChangePosition: (position: ActivityBarPosition) => void
}): React.JSX.Element {
  return (
    <ContextMenuContent>
      <ContextMenuLabel>
        {translate('auto.components.right.sidebar.index.864111caa2', 'Activity Bar Position')}
      </ContextMenuLabel>
      <ContextMenuRadioGroup
        value={currentPosition}
        onValueChange={(value) => onChangePosition(value as ActivityBarPosition)}
      >
        <ContextMenuRadioItem value="top">
          {translate('auto.components.right.sidebar.index.7b415c39e9', 'Top')}
        </ContextMenuRadioItem>
        <ContextMenuRadioItem value="side">
          {translate('auto.components.right.sidebar.index.70893f017b', 'Side')}
        </ContextMenuRadioItem>
      </ContextMenuRadioGroup>
    </ContextMenuContent>
  )
}

// Why: persisted widths must be reclamped when the host window changes size.
function useWindowWidth(): number | null {
  const [windowWidth, setWindowWidth] = useState(() => getWindowWidth())

  useEffect(() => {
    function update(): void {
      setWindowWidth(getWindowWidth())
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return windowWidth
}

function getWindowWidth(): number | null {
  if (typeof window === 'undefined' || !Number.isFinite(window.innerWidth)) {
    return null
  }
  return window.innerWidth
}
