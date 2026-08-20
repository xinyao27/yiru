import React from 'react'
import {
  BookOpen,
  CalendarDots as CalendarClock,
  DeviceMobile as Smartphone,
  House,
  MagnifyingGlass as Search
} from '~renderer/components/icons/hugeicons'
import { getSelectableControlStateClasses } from '~renderer/components/selectable-control-state-classes'
import { ShortcutKeyCombo } from '~renderer/components/shortcut-key-combo'
import { Button } from '~renderer/components/ui/button'
import { ContextMenu, ContextMenuTrigger } from '~renderer/components/ui/context-menu'
import { useShortcutKeyComboDetails } from '~renderer/hooks/use-shortcut-label'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import { cn } from '~renderer/lib/class-names'
import { useAppStore } from '~renderer/store'
import type { GlobalSettings } from '~shared/types'

import { useMobileSidebarOnboardingBadge } from './mobile-sidebar-onboarding-badge'
import { HideSidebarMenu } from './nav-controls'
import { SetupGuideSidebarEntry } from './setup-guide-sidebar-entry'

export {
  getSetupGuideSidebarEntryReady,
  shouldShowSetupGuideEntry
} from './setup-guide-sidebar-entry'

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
  // Why: this memo boundary needs its own language subscription.
  useUiLocale()
  const worktreePaletteShortcutCombos = useShortcutKeyComboDetails('worktree.palette')
  const openHomePage = useAppStore((s) => s.openHomePage)
  const openModal = useAppStore((s) => s.openModal)
  const openSkillsPage = useAppStore((s) => s.openSkillsPage)
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const openMobilePage = useAppStore((s) => s.openMobilePage)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const activeView = useAppStore((s) => s.activeView)
  const showAutomationsButton = useAppStore((s) => shouldShowAutomationsButton(s.settings))
  const showMobileButton = useAppStore((s) => shouldShowMobileButton(s.settings))
  const homeActive = activeView === 'home'
  const skillsActive = activeView === 'skills'
  const automationsActive = activeView === 'automations'
  const mobileActive = activeView === 'mobile'
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
      <Button
        variant="ghost"
        size="sidebar-row"
        type="button"
        onClick={openHomePage}
        aria-current={homeActive ? 'page' : undefined}
        className={getSelectableControlStateClasses(homeActive)}
      >
        <House className={cn('size-4 shrink-0', !homeActive && 'text-sidebar-foreground/30')} />
        <span className="flex-1">
          {translate('auto.components.sidebar.SidebarNav.home', 'Home')}
        </span>
      </Button>
      <Button
        variant="ghost"
        size="sidebar-row"
        type="button"
        onClick={() => openModal('worktree-palette')}
        aria-label={translate(
          'auto.components.sidebar.SidebarNav.0c3395fd32',
          'Search worktrees and browser tabs'
        )}
        className={cn('group', getSelectableControlStateClasses(false))}
      >
        <Search className="text-sidebar-foreground/30 size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {translate('auto.components.sidebar.SidebarNav.80611a8b10', 'Search')}
        </span>
        <span
          aria-hidden
          className="pointer-events-none ml-1.5 hidden shrink-0 items-center gap-1.5 group-focus-within:inline-flex group-hover:inline-flex"
        >
          {worktreePaletteShortcutCombos.map((combo) => (
            <ShortcutKeyCombo
              key={combo.keys.join('-')}
              keys={combo.keys}
              doubleTap={combo.doubleTap}
              className="gap-0.5"
              keyCapClassName="border-sidebar-border/80 bg-sidebar-foreground/8 text-sidebar-foreground/55 min-w-4 px-1 py-px text-[9px]"
              separatorClassName="text-sidebar-foreground/45 text-[9px]"
            />
          ))}
        </span>
      </Button>
      <SetupGuideSidebarEntry />
      <Button
        variant="ghost"
        size="sidebar-row"
        type="button"
        onClick={openSkillsPage}
        aria-current={skillsActive ? 'page' : undefined}
        className={getSelectableControlStateClasses(skillsActive)}
      >
        <BookOpen
          className={cn('size-4 shrink-0', !skillsActive && 'text-sidebar-foreground/30')}
        />
        <span className="flex-1">
          {translate('auto.components.sidebar.SidebarNav.skills', 'Skills')}
        </span>
      </Button>
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
