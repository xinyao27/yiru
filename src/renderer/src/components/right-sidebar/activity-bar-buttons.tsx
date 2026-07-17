import React from 'react'
import { DotsThree as MoreHorizontal } from '@phosphor-icons/react'
import type { ActiveRightSidebarTab } from '@/store/slices/editor'
import type { CheckStatus } from '../../../../shared/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RIGHT_SIDEBAR_HEADER_NO_DRAG_CLASS_NAME } from './right-sidebar-titlebar-drag-regions'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { getTabRootStateClasses } from '../tab-bar/drop-indicator'

export type ActivityBarItem = {
  id: ActiveRightSidebarTab
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  shortcut: string
  /** When true, hidden for non-git (folder-mode) repos. */
  gitOnly?: boolean
  /** When true, shown only for folder workspaces. */
  folderOnly?: boolean
  /** When true, shown only for worktrees that belong to an SSH repo. */
  sshOnly?: boolean
}

const STATUS_DOT_COLOR: Record<CheckStatus, string> = {
  success: 'bg-emerald-500',
  failure: 'bg-rose-500',
  pending: 'bg-amber-500',
  neutral: 'bg-muted-foreground'
}

export function TopActivityOverflowMenu({
  items,
  activeTab,
  onSelect,
  checksStatus
}: {
  items: ActivityBarItem[]
  activeTab: ActiveRightSidebarTab
  onSelect: (tab: ActiveRightSidebarTab) => void
  checksStatus?: CheckStatus | null
}): React.JSX.Element {
  const hiddenChecksStatus =
    checksStatus && checksStatus !== 'neutral' && items.some((item) => item.id === 'checks')
      ? checksStatus
      : null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              'relative my-auto h-7',
              getTabRootStateClasses(false),
              RIGHT_SIDEBAR_HEADER_NO_DRAG_CLASS_NAME
            )}
            aria-label={translate(
              'auto.components.right.sidebar.activity.bar.buttons.1fd284e931',
              'More sidebar tabs'
            )}
          >
            <MoreHorizontal />
            {hiddenChecksStatus && (
              <div
                className={cn(
                  'absolute top-[4px] right-[4px] size-[7px] rounded-full ring-1 ring-sidebar',
                  STATUS_DOT_COLOR[hiddenChecksStatus] ?? 'bg-muted-foreground'
                )}
              />
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" side="bottom" sideOffset={6}>
        {items.map((item) => {
          const Icon = item.icon
          const active = item.id === activeTab
          return (
            <DropdownMenuItem
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(active && 'bg-accent text-accent-foreground')}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={14} />
              <span>{item.title}</span>
              {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ActivityBarButton({
  item,
  active,
  onClick,
  layout,
  statusIndicator
}: {
  item: ActivityBarItem
  active: boolean
  onClick: () => void
  layout: 'top' | 'side'
  statusIndicator?: CheckStatus | null
}): React.JSX.Element {
  const Icon = item.icon
  const isTop = layout === 'top'

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size={isTop ? 'icon-sm' : 'icon-lg'}
            className={cn(
              'relative',
              RIGHT_SIDEBAR_HEADER_NO_DRAG_CLASS_NAME,
              isTop ? 'my-auto h-7 w-9' : 'w-10 h-10',
              isTop
                ? getTabRootStateClasses(active)
                : active
                  ? 'text-foreground'
                  : 'text-muted-foreground/60 hover:text-muted-foreground'
            )}
            onClick={onClick}
            aria-label={item.shortcut ? `${item.title} (${item.shortcut})` : item.title}
          >
            <Icon />

            {statusIndicator && statusIndicator !== 'neutral' && (
              <div
                className={cn(
                  'absolute rounded-full size-[7px] ring-1 ring-sidebar',
                  isTop ? 'top-[4px] right-[5px]' : 'top-[7px] right-[7px]',
                  STATUS_DOT_COLOR[statusIndicator] ?? 'bg-muted-foreground'
                )}
              />
            )}

            {active && !isTop && (
              <div className="absolute right-0 top-[25%] bottom-[25%] w-[2px] bg-foreground rounded-l" />
            )}
          </Button>
        }
      />
      <TooltipContent side={isTop ? 'bottom' : 'left'} sideOffset={6}>
        {item.shortcut ? `${item.title} (${item.shortcut})` : item.title}
      </TooltipContent>
    </Tooltip>
  )
}
