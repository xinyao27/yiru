import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ButtonGroup } from '~renderer/components/ui/button-group'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger
} from '~renderer/components/ui/context-menu'
import { SidebarResizeOverlay, useSidebarResize } from '~renderer/hooks/use-sidebar-resize'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'
import type { ActiveRightSidebarTab } from '~shared/types'

import {
  ActivityBarButton,
  TopActivityOverflowMenu,
  type ActivityBarItem
} from './activity-bar-buttons'
import { getTopActivityBarLayout } from './activity-bar-overflow'
import { setWorkspaceSidebarChromeWidth, WorkspaceSidebarToggleButton } from './sidebar-chrome'
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
  onOpenChange: (open: boolean) => void
  onSelectView: (view: ActiveRightSidebarTab) => void
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
  onOpenChange,
  onSelectView,
  onWidthChange,
  reservedLeftWidth,
  toggleShortcut,
  width
}: WorkspaceSidebarFrameProps): React.JSX.Element {
  const [activityStripWidth, setActivityStripWidth] = useState<number | null>(null)
  const collapsedChromeRef = useRef<HTMLDivElement | null>(null)
  const windowWidth = useWindowWidth()
  const workspaceWidth = windowWidth === null ? null : windowWidth - reservedLeftWidth
  const activityBarWidth = activityBarPosition === 'side' ? SIDE_ACTIVITY_BAR_WIDTH : 0
  const hasSidebarSpace = canFitWorkspaceSidebar(workspaceWidth, activityBarWidth)
  const isVisible = isOpen && hasSidebarSpace
  const maxWidth = getWorkspaceSidebarMaxWidth(workspaceWidth, activityBarWidth)
  const renderedWidth = clampWorkspaceSidebarWidth(width, workspaceWidth, activityBarWidth)
  const {
    containerRef,
    isResizing,
    onResizeStart,
    renderedWidth: liveRenderedWidth
  } = useSidebarResize<HTMLDivElement>({
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

  useCollapsedChromeWidth(collapsedChromeRef, isVisible)

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

  const sidebarToggle = isVisible ? (
    <WorkspaceSidebarToggleButton shortcut={toggleShortcut} onToggle={() => onOpenChange(false)} />
  ) : null

  return (
    <div
      ref={containerRef}
      className="relative flex shrink-0 flex-row overflow-visible"
      style={{ width: liveRenderedWidth }}
    >
      <SidebarResizeOverlay visible={isResizing} />
      {!isVisible ? (
        <div
          ref={collapsedChromeRef}
          className="fixed top-0 right-[var(--window-controls-width,0px)] z-20 h-[var(--titlebar-height)] [-webkit-app-region:no-drag]"
        >
          {/* Why: collapsed chrome keeps the panel destinations reachable; selecting
              one uses the same route as the expanded activity bar and opens the sidebar. */}
          <ButtonGroup presentation="titlebar" className="h-full">
            {items.map((item) => (
              <ActivityBarButton
                key={item.id}
                item={item}
                active={false}
                onClick={() => onSelectView(item.id)}
                layout="top"
              />
            ))}
            <WorkspaceSidebarToggleButton
              shortcut={toggleShortcut}
              onToggle={() => onOpenChange(true)}
            />
          </ButtonGroup>
        </div>
      ) : null}
      <div
        className={cn(
          'bg-sidebar flex min-w-0 flex-1 flex-col overflow-hidden',
          isVisible && activityBarPosition === 'side'
            ? 'border-sidebar-border border-l'
            : 'border-l-0'
        )}
      >
        {activityBarPosition === 'top' ? (
          <ContextMenu>
            <ContextMenuTrigger
              render={
                <div className="border-border flex h-[var(--titlebar-height)] min-h-[var(--titlebar-height)] items-center border-b pr-[var(--window-controls-width,0px)] [-webkit-app-region:drag]">
                  <div
                    ref={activityStripRef}
                    className="flex h-full min-w-0 flex-1 items-center overflow-hidden [-webkit-app-region:no-drag]"
                  >
                    <TopActivityItems
                      activeView={activeView}
                      layout={activityLayout}
                      onSelectView={onSelectView}
                    />
                  </div>
                  <div className="h-full shrink-0 [-webkit-app-region:no-drag]">
                    {sidebarToggle}
                  </div>
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
            <div className="h-full [-webkit-app-region:no-drag]">{sidebarToggle}</div>
          </div>
        )}

        {isVisible ? (
          <div
            className={cn(
              'scrollbar-sleek-parent flex min-h-0 flex-1 flex-col overflow-hidden',
              activityBarPosition === 'top' && 'border-sidebar-border border-l'
            )}
          >
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

function useCollapsedChromeWidth(
  chromeRef: React.RefObject<HTMLDivElement | null>,
  isVisible: boolean
): void {
  useLayoutEffect(() => {
    const chrome = chromeRef.current
    if (isVisible || !chrome) {
      setWorkspaceSidebarChromeWidth(0)
      return
    }

    const updateWidth = (): void => {
      setWorkspaceSidebarChromeWidth(chrome.getBoundingClientRect().width)
    }
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(chrome)
    return () => {
      observer.disconnect()
      setWorkspaceSidebarChromeWidth(0)
    }
  }, [chromeRef, isVisible])
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
    <div className="flex h-full min-w-0 flex-1 shrink">
      <ButtonGroup presentation="titlebar" className="min-w-0 shrink-0">
        {layout.visibleItems.map((item) => (
          <ActivityBarButton
            key={item.id}
            item={item}
            active={activeView === item.id}
            onClick={() => onSelectView(item.id)}
            layout="top"
          />
        ))}
        {layout.overflowItems.length > 0 ? (
          <TopActivityOverflowMenu
            items={layout.overflowItems}
            activeTab={activeView}
            onSelect={onSelectView}
          />
        ) : null}
      </ButtonGroup>
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
