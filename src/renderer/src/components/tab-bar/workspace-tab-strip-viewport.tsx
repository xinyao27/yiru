import type React from 'react'
import { CaretLeft as ChevronLeft, CaretRight as ChevronRight } from '@phosphor-icons/react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTabStripDragScrollHandlers } from './tab-strip-drag-scroll'
import { useTabStripOverflowNavigation } from './tab-strip-overflow-navigation'
import { getTabStripScrollMaskClassName } from './tab-strip-scroll-metrics'

type WorkspaceTabStripViewportProps = {
  activeTabId: string | null
  layoutKey: string
  tabCount: number
  navigationScopeId: string
  children: React.ReactNode
  stripClassName?: string
  stripProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'>
}

export function WorkspaceTabStripViewport({
  activeTabId,
  layoutKey,
  tabCount,
  navigationScopeId,
  children,
  stripClassName,
  stripProps
}: WorkspaceTabStripViewportProps): React.JSX.Element {
  const { tabStripRef, tabStripOverflowState, scrollTabStrip } = useTabStripOverflowNavigation({
    activeVisibleTabId: activeTabId,
    layoutKey,
    tabCount,
    worktreeId: navigationScopeId
  })
  const tabStripDragScroll = useTabStripDragScrollHandlers(scrollTabStrip, {
    start: tabStripOverflowState.canScrollStart,
    end: tabStripOverflowState.canScrollEnd
  })

  return (
    // Why: content-sized growth keeps the native new-tab button beside the
    // final tab; flex shrink still bounds overflowing local and remote strips.
    <div className="flex h-full min-w-0 flex-[0_1_auto] items-stretch overflow-hidden">
      {tabStripOverflowState.hasOverflow ? (
        <TabStripScrollButton
          direction="start"
          canScroll={tabStripOverflowState.canScrollStart}
          isTabDragActive={tabStripDragScroll.isTabDragActive}
          onClick={() => scrollTabStrip('start')}
          onPointerEnter={tabStripDragScroll.onDragScrollStartEnter}
          onPointerLeave={tabStripDragScroll.onDragScrollLeave}
        />
      ) : null}
      {/* Why: only the actual tab viewport is no-drag; unused titlebar space
          remains available for moving the window on every workspace surface. */}
      <div
        className="relative flex min-h-0 min-w-0 max-w-full flex-[0_1_auto]"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div
          {...stripProps}
          ref={tabStripRef}
          className={cn(
            'terminal-tab-strip flex h-full min-w-0 max-w-full flex-1 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden pl-1',
            getTabStripScrollMaskClassName(tabStripOverflowState),
            stripClassName
          )}
        >
          {children}
        </div>
      </div>
      {tabStripOverflowState.hasOverflow ? (
        <TabStripScrollButton
          direction="end"
          canScroll={tabStripOverflowState.canScrollEnd}
          isTabDragActive={tabStripDragScroll.isTabDragActive}
          onClick={() => scrollTabStrip('end')}
          onPointerEnter={tabStripDragScroll.onDragScrollEndEnter}
          onPointerLeave={tabStripDragScroll.onDragScrollLeave}
        />
      ) : null}
    </div>
  )
}

function TabStripScrollButton({
  direction,
  canScroll,
  isTabDragActive,
  onClick,
  onPointerEnter,
  onPointerLeave
}: {
  direction: 'start' | 'end'
  canScroll: boolean
  isTabDragActive: boolean
  onClick: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
}): React.JSX.Element {
  const isStart = direction === 'start'
  const label = isStart
    ? translate('auto.components.tab.bar.TabBar.7a9b4af2af', 'Scroll tabs left')
    : translate('auto.components.tab.bar.TabBar.232e075b07', 'Scroll tabs right')
  const Icon = isStart ? ChevronLeft : ChevronRight
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="mx-0.5 my-auto h-6 w-5 text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-35"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            aria-label={label}
            aria-disabled={!canScroll}
            disabled={!isTabDragActive && !canScroll}
            onClick={onClick}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
          >
            <Icon className="size-4" />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
