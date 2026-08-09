import { SidebarSimple as PanelRight } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '~renderer/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger
} from '~renderer/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { useSidebarResize } from '~renderer/hooks/use-sidebar-resize'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'
import type { ActiveRightSidebarTab } from '~shared/types'

import {
  ActivityBarButton,
  TopActivityOverflowMenu,
  type ActivityBarItem
} from './activity-bar-buttons'
import { getTopActivityBarLayout } from './activity-bar-overflow'
import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from './right-sidebar-button-styles'
import {
  WORKSPACE_SIDEBAR_MIN_WIDTH,
  canFitWorkspaceSidebar,
  clampWorkspaceSidebarWidth,
  getWorkspaceSidebarMaxWidth
} from './sidebar-width'

const SIDE_ACTIVITY_BAR_WIDTH = 40
const KEYBOARD_RESIZE_STEP = 16

type ActivityBarPosition = 'top' | 'side'

type WorkspaceSidebarFrameProps = {
  activeView: ActiveRightSidebarTab
  activityBarPosition: ActivityBarPosition
  children: React.ReactNode
  isOpen: boolean
  items: readonly ActivityBarItem[]
  onActivityBarPositionChange: (position: ActivityBarPosition) => void
  onSelectView: (view: ActiveRightSidebarTab) => void
  onToggle: () => void
  onWidthChange: (width: number) => void
  reservedLeftWidth: number
  toggleShortcut: string
  width: number
}

export function WorkspaceSidebarFrame({
  activeView,
  activityBarPosition,
  children,
  isOpen,
  items,
  onActivityBarPositionChange,
  onSelectView,
  onToggle,
  onWidthChange,
  reservedLeftWidth,
  toggleShortcut,
  width
}: WorkspaceSidebarFrameProps): React.JSX.Element {
  const [activityStripWidth, setActivityStripWidth] = useState<number | null>(null)
  const windowWidth = useWindowWidth()
  const workspaceWidth = windowWidth === null ? null : windowWidth - reservedLeftWidth
  const activityBarWidth = activityBarPosition === 'side' ? SIDE_ACTIVITY_BAR_WIDTH : 0
  const hasSidebarSpace = canFitWorkspaceSidebar(workspaceWidth, activityBarWidth)
  const isVisible = isOpen && hasSidebarSpace
  const maxWidth = getWorkspaceSidebarMaxWidth(workspaceWidth, activityBarWidth)
  const renderedWidth = clampWorkspaceSidebarWidth(width, workspaceWidth, activityBarWidth)
  const { containerRef, onResizeStart } = useSidebarResize<HTMLDivElement>({
    isOpen: isVisible,
    width: renderedWidth,
    minWidth: WORKSPACE_SIDEBAR_MIN_WIDTH,
    maxWidth,
    deltaSign: -1,
    renderedExtraWidth: activityBarWidth,
    setWidth: onWidthChange
  })
  const activityStripRef = useMeasuredWidth(setActivityStripWidth)
  const activityLayout = useMemo(
    () => getTopActivityBarLayout(items, activityStripWidth, activeView),
    [activeView, activityStripWidth, items]
  )
  const activeTitle = items.find((item) => item.id === activeView)?.title ?? ''

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      let nextWidth: number | null = null
      switch (event.key) {
        case 'ArrowLeft':
          nextWidth = renderedWidth + KEYBOARD_RESIZE_STEP
          break
        case 'ArrowRight':
          nextWidth = renderedWidth - KEYBOARD_RESIZE_STEP
          break
        case 'Home':
          nextWidth = WORKSPACE_SIDEBAR_MIN_WIDTH
          break
        case 'End':
          nextWidth = maxWidth
          break
      }
      if (nextWidth === null) {
        return
      }
      event.preventDefault()
      onWidthChange(Math.min(maxWidth, Math.max(WORKSPACE_SIDEBAR_MIN_WIDTH, nextWidth)))
    },
    [maxWidth, onWidthChange, renderedWidth]
  )

  const closeButton = isVisible ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME, 'mr-1')}
            onClick={onToggle}
            aria-label={translate(
              'auto.components.right.sidebar.index.e8e2e4ce74',
              'Toggle right sidebar'
            )}
          >
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
        'relative flex shrink-0 flex-row',
        isVisible ? 'overflow-visible' : 'overflow-hidden'
      )}
    >
      <div
        className={cn(
          'bg-sidebar flex min-w-0 flex-1 flex-col overflow-hidden',
          isVisible ? 'border-sidebar-border border-l' : 'border-l-0'
        )}
      >
        {activityBarPosition === 'top' ? (
          <ContextMenu>
            <ContextMenuTrigger
              render={
                <div className="border-border flex h-[var(--titlebar-height)] min-h-[var(--titlebar-height)] items-center border-b pr-[var(--window-controls-width,0px)] [-webkit-app-region:drag]">
                  <div
                    ref={activityStripRef}
                    className="flex min-w-0 flex-1 items-center overflow-hidden pl-2 [-webkit-app-region:no-drag]"
                  >
                    <TopActivityItems
                      activeView={activeView}
                      layout={activityLayout}
                      onSelectView={onSelectView}
                    />
                  </div>
                  <div className="shrink-0 [-webkit-app-region:no-drag]">{closeButton}</div>
                </div>
              }
            />
            <ActivityBarPositionMenu
              currentPosition={activityBarPosition}
              onChangePosition={onActivityBarPositionChange}
            />
          </ContextMenu>
        ) : (
          <div className="border-border flex h-[var(--titlebar-height)] min-h-[var(--titlebar-height)] items-center justify-between border-b pr-[max(0px,calc(var(--window-controls-width,0px)-40px))] pl-3 [-webkit-app-region:drag]">
            <span className="text-foreground truncate text-[11px] font-semibold tracking-wider uppercase">
              {activeTitle}
            </span>
            <div className="[-webkit-app-region:no-drag]">{closeButton}</div>
          </div>
        )}

        {isVisible ? (
          <div className="scrollbar-sleek-parent flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        ) : null}

        {isVisible ? (
          <div
            className="hover:bg-border active:bg-ring absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize transition-colors"
            role="separator"
            tabIndex={0}
            aria-label={activeTitle}
            aria-orientation="vertical"
            aria-valuemin={WORKSPACE_SIDEBAR_MIN_WIDTH}
            aria-valuemax={Math.round(maxWidth)}
            aria-valuenow={Math.round(renderedWidth)}
            onKeyDown={handleResizeKeyDown}
            onMouseDown={onResizeStart}
          />
        ) : null}
      </div>

      {isVisible && activityBarPosition === 'side' ? (
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <div className="border-border bg-sidebar flex w-10 min-w-10 flex-col items-center border-l pt-[var(--window-controls-height,0px)]">
                {items.map((item) => (
                  <ActivityBarButton
                    key={item.id}
                    item={item}
                    active={activeView === item.id}
                    onClick={() => onSelectView(item.id)}
                    layout="side"
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
  activeView,
  layout,
  onSelectView
}: {
  activeView: ActiveRightSidebarTab
  layout: { visibleItems: ActivityBarItem[]; overflowItems: ActivityBarItem[] }
  onSelectView: (view: ActiveRightSidebarTab) => void
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 shrink">
      <div className="flex min-w-0 shrink gap-0.5">
        {layout.visibleItems.map((item) => (
          <ActivityBarButton
            key={item.id}
            item={item}
            active={activeView === item.id}
            onClick={() => onSelectView(item.id)}
            layout="top"
          />
        ))}
      </div>
      {layout.overflowItems.length > 0 ? (
        <TopActivityOverflowMenu
          items={layout.overflowItems}
          activeTab={activeView}
          onSelect={onSelectView}
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
        onValueChange={(value) => {
          if (value === 'top' || value === 'side') {
            onChangePosition(value)
          }
        }}
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

function useMeasuredWidth(onWidth: (width: number | null) => void) {
  const observerRef = useRef<ResizeObserver | null>(null)
  const widthRef = useRef<number | null>(null)

  return useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null

      const commitWidth = (width: number | null): void => {
        if (Object.is(widthRef.current, width)) {
          return
        }
        widthRef.current = width
        onWidth(width)
      }

      if (!node || typeof ResizeObserver === 'undefined') {
        commitWidth(node ? node.getBoundingClientRect().width : null)
        return
      }

      const updateWidth = (): void => commitWidth(node.getBoundingClientRect().width)
      updateWidth()
      const observer = new ResizeObserver(updateWidth)
      observer.observe(node)
      observerRef.current = observer
    },
    [onWidth]
  )
}

function useWindowWidth(): number | null {
  const [windowWidth, setWindowWidth] = useState<number | null>(() => getWindowWidth())

  useEffect(() => {
    const update = (): void => setWindowWidth(getWindowWidth())
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
