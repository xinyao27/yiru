import {
  Bell,
  CalendarDots as CalendarClock,
  MagnifyingGlass as Search,
  DeviceMobile as Smartphone
} from '@phosphor-icons/react'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useActivityUnreadCount } from '@/components/activity/use-activity-unread-count'
import { ShortcutKeyCombo } from '@/components/shortcut-key-combo'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { useShortcutKeyComboDetails } from '@/hooks/use-shortcut-label'
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
  const worktreePaletteShortcutCombos = useShortcutKeyComboDetails('worktree.palette')
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const openActivityPage = useAppStore((s) => s.openActivityPage)
  const openMobilePage = useAppStore((s) => s.openMobilePage)
  const openModal = useAppStore((s) => s.openModal)
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
              <button
                type="button"
                onClick={openAutomationsPage}
                aria-current={automationsActive ? 'page' : undefined}
                className={cn(
                  'outline-none focus-visible:bg-sidebar-foreground/8',
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
                  automationsActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-foreground/8'
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
              </button>
            }
          />
          <HideSidebarMenu onHide={hideAutomationsButton} />
        </ContextMenu>
      ) : null}
      {showAgentsButton ? (
        <button
          type="button"
          onClick={openActivityPage}
          aria-current={activityActive ? 'page' : undefined}
          className={cn(
            'outline-none focus-visible:bg-sidebar-foreground/8',
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
            activityActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/60 hover:bg-sidebar-foreground/8'
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
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-px text-[10px] font-semibold">
              {activityUnreadCount}
            </span>
          ) : null}
        </button>
      ) : null}
      {showMobileButton ? (
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <button
                type="button"
                onClick={() => {
                  mobileOnboardingBadge.dismiss()
                  openMobilePage()
                }}
                aria-current={mobileActive ? 'page' : undefined}
                className={cn(
                  'outline-none focus-visible:bg-sidebar-foreground/8',
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
                  mobileActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-foreground/8'
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
                  <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-px text-[10px] font-semibold">
                    {translate('auto.components.sidebar.SidebarNav.c86d83b5c3', 'New')}
                  </span>
                ) : null}
              </button>
            }
          />
          <HideSidebarMenu onHide={hideMobileButton} />
        </ContextMenu>
      ) : null}
      <button
        type="button"
        onClick={() => openModal('worktree-palette')}
        aria-label={translate(
          'auto.components.sidebar.SidebarNav.0c3395fd32',
          'Search worktrees and browser tabs'
        )}
        className="group border-sidebar-border/70 bg-sidebar-foreground/5 text-sidebar-foreground/45 hover:border-sidebar-border hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground/60 relative flex h-7 w-full items-center rounded-md border pr-1.5 pl-7 text-left text-[12px] font-medium tracking-tight transition-colors focus-visible:outline-none"
      >
        <Search
          className="text-sidebar-foreground/30 pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2"
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1 truncate">
          {translate('auto.components.sidebar.SidebarNav.80611a8b10', 'Search')}
        </span>
        <span className="pointer-events-none ml-1.5 hidden shrink-0 items-center gap-1.5 group-focus-within:inline-flex group-hover:inline-flex">
          {worktreePaletteShortcutCombos.map((combo) => (
            <ShortcutKeyCombo
              key={combo.keys.join('-')}
              keys={combo.keys}
              doubleTap={combo.doubleTap}
              className="inline-flex gap-0.5"
              keyCapClassName="min-w-4 border-sidebar-border/80 bg-sidebar-foreground/8 px-1 py-px text-[9px] text-sidebar-foreground/55"
              separatorClassName="text-[9px] text-sidebar-foreground/45"
            />
          ))}
        </span>
      </button>
    </div>
  )
})

export default SidebarNav
