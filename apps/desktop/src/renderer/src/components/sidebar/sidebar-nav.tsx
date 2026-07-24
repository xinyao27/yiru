import {
  Bell,
  CalendarDots as CalendarClock,
  DeviceMobile as Smartphone
} from '@phosphor-icons/react'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useActivityUnreadCount } from '@/components/activity/use-activity-unread-count'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { useAppStore } from '@/store'

import type { GlobalSettings } from '../../../../shared/types'
import { useMobileSidebarOnboardingBadge } from './mobile-sidebar-onboarding-badge'
import { SetupGuideSidebarEntry } from './setup-guide-sidebar-entry'
import { HideSidebarMenu } from './sidebar-nav-controls'

export {
  getSetupGuideSidebarEntryReady,
  shouldShowSetupGuideEntry
} from './setup-guide-sidebar-entry'

export function shouldShowAgentsButton(
  settings: Pick<GlobalSettings, 'experimentalActivity'> | null | undefined
): boolean {
  return settings?.experimentalActivity === true
}

export function shouldShowMobileButton(
  settings: Pick<GlobalSettings, 'showMobileButton'> | null | undefined
): boolean {
  return settings?.showMobileButton !== false
}

export function shouldShowAutomationsButton(
  settings: Pick<GlobalSettings, 'showAutomationsButton'> | null | undefined
): boolean {
  return settings?.showAutomationsButton !== false
}

const SidebarNav = React.memo(function SidebarNav() {
  // Why: this memo boundary needs its own language subscription, while
  // translate() preserves Yiru's pseudo-localization behavior.
  useTranslation()
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const openActivityPage = useAppStore((s) => s.openActivityPage)
  const openMobilePage = useAppStore((s) => s.openMobilePage)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const activeView = useAppStore((s) => s.activeView)
  const showAgentsButton = useAppStore((s) => shouldShowAgentsButton(s.settings))
  const showAutomationsButton = useAppStore((s) => shouldShowAutomationsButton(s.settings))
  const showMobileButton = useAppStore((s) => shouldShowMobileButton(s.settings))
  const automationsActive = activeView === 'automations'
  const activityActive = activeView === 'activity'
  const mobileActive = activeView === 'mobile'
  const activityUnreadCount = useActivityUnreadCount(showAgentsButton, 'sidebar-badge')
  const mobileOnboardingBadge = useMobileSidebarOnboardingBadge(showMobileButton)
  const hideAutomationsButton = React.useCallback(() => {
    void updateSettings({ showAutomationsButton: false })
  }, [updateSettings])
  const hideMobileButton = React.useCallback(() => {
    void updateSettings({ showMobileButton: false })
  }, [updateSettings])

  return (
    <div
      className="flex flex-col gap-0.5 px-2 pt-2 pb-1"
      data-contextual-tour-target="sidebar-navigation"
    >
      <SetupGuideSidebarEntry />
      {showAutomationsButton ? (
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={openAutomationsPage}
                aria-current={automationsActive ? 'page' : undefined}
                className={cn(
                  'border-0 justify-start whitespace-normal gap-2 focus-visible:bg-accent',
                  'flex w-full px-2 py-1.5 text-left text-[13px] tracking-tight transition-colors',
                  automationsActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-sidebar-foreground/60'
                )}
              >
                <CalendarClock
                  className={cn(
                    'size-4 shrink-0',
                    !automationsActive && 'text-sidebar-foreground/30'
                  )}
                  strokeWidth={automationsActive ? 2.25 : 1.75}
                />
                <span className="flex-1">
                  {translate('auto.components.sidebar.SidebarNav.f323383e9a', 'Automations')}
                </span>
              </Button>
            }
          />
          <HideSidebarMenu onHide={hideAutomationsButton} />
        </ContextMenu>
      ) : null}
      {showAgentsButton ? (
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={openActivityPage}
          aria-current={activityActive ? 'page' : undefined}
          className={cn(
            'border-0 justify-start whitespace-normal gap-2 focus-visible:bg-accent',
            'flex w-full px-2 py-1.5 text-left text-[13px] tracking-tight transition-colors',
            activityActive ? 'bg-accent text-accent-foreground' : 'text-sidebar-foreground/60'
          )}
        >
          <Bell
            className={cn('size-4 shrink-0', !activityActive && 'text-sidebar-foreground/30')}
            strokeWidth={activityActive ? 2.25 : 1.75}
          />
          <span className="flex-1">
            {translate('auto.components.sidebar.SidebarNav.9c95e1ce91', 'Agents')}
          </span>
          {activityUnreadCount > 0 ? (
            <span className="bg-primary text-primary-foreground px-1.5 py-px text-[10px] font-semibold">
              {activityUnreadCount}
            </span>
          ) : null}
        </Button>
      ) : null}
      {showMobileButton ? (
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  mobileOnboardingBadge.dismiss()
                  openMobilePage()
                }}
                aria-current={mobileActive ? 'page' : undefined}
                className={cn(
                  'border-0 justify-start whitespace-normal gap-2 focus-visible:bg-accent',
                  'flex w-full px-2 py-1.5 text-left text-[13px] tracking-tight transition-colors',
                  mobileActive ? 'bg-accent text-accent-foreground' : 'text-sidebar-foreground/60'
                )}
              >
                <Smartphone
                  className={cn('size-4 shrink-0', !mobileActive && 'text-sidebar-foreground/30')}
                  strokeWidth={mobileActive ? 2.25 : 1.75}
                />
                <span className="flex-1">
                  {translate('auto.components.sidebar.SidebarNav.1b5c41caee', 'Yiru Mobile')}
                </span>
                {mobileOnboardingBadge.visible ? (
                  <span className="bg-primary text-primary-foreground px-1.5 py-px text-[10px] font-semibold">
                    {translate('auto.components.sidebar.SidebarNav.c86d83b5c3', 'New')}
                  </span>
                ) : null}
              </Button>
            }
          />
          <HideSidebarMenu onHide={hideMobileButton} />
        </ContextMenu>
      ) : null}
    </div>
  )
})

export default SidebarNav
