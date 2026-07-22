import { Bell, ArrowLeft } from '@phosphor-icons/react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import { useActivityUnreadCount } from './use-activity-unread-count'

export function ActivityTitlebarControls(): React.JSX.Element {
  const unreadCount = useActivityUnreadCount(true, 'agent-events')
  const closeActivityPage = useAppStore((s) => s.closeActivityPage)

  return (
    <div className="border-border flex h-full min-w-0 flex-1 items-center gap-3 border-l px-3">
      <div
        className="flex min-w-0 items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Why: Activity hides the worktree sidebar (full-page surface), so the
            sidebar's nav row isn't available as the back path. This Back button
            is the dedicated exit, mirroring Settings' onBack pattern. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="dark:hover:bg-accent bg-[var(--bg-titlebar,var(--card))] dark:bg-[var(--bg-titlebar,var(--card))]"
                onClick={closeActivityPage}
                aria-label={translate(
                  'auto.components.activity.ActivityTitlebarControls.dc708f3eff',
                  'Close agents'
                )}
              >
                <ArrowLeft className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {translate(
              'auto.components.activity.ActivityTitlebarControls.dc708f3eff',
              'Close agents'
            )}
          </TooltipContent>
        </Tooltip>
        <Bell className="text-muted-foreground size-3.5 shrink-0" />
        <span className="truncate text-xs font-medium">
          {translate('auto.components.activity.ActivityTitlebarControls.d6a8de3934', 'agents')}
        </span>
        <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-normal">
          {unreadCount}{' '}
          {translate('auto.components.activity.ActivityTitlebarControls.f915168c8e', 'unread')}
        </Badge>
      </div>
    </div>
  )
}
