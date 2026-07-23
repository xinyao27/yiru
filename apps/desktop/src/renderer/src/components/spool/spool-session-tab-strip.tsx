import { TerminalWindow as SquareTerminal } from '@phosphor-icons/react'
import type React from 'react'
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'

import { WorkspaceSelectableTab } from '@/components/tab-bar/workspace-selectable-tab'
import { WorkspaceTabStripViewport } from '@/components/tab-bar/workspace-tab-strip-viewport'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/lib/agent-catalog'

import type { SpoolSessionCatalogEntry } from '../../../../shared/spool/spool-catalog-contract'
import type { WorkspacePanelTabContentType } from '../../../../shared/types'
import type { ActivityBarItem } from '../right-sidebar/activity-bar-buttons'
import { getSpoolWorkspacePanelTabId, SpoolWorkspacePanelTab } from './spool-workspace-panel-tab'

const MAX_VISIBLE_SPOOL_SESSION_TABS = 24
const MAX_RECENT_SPOOL_SESSION_TABS = 8

type SpoolSessionTabStripProps = {
  sessions: readonly SpoolSessionCatalogEntry[]
  activeSessionRef: string | null
  onSelect: (sessionRef: string) => void
  createMenu: React.ReactNode
  panelItems: readonly ActivityBarItem[]
  activePanel: WorkspacePanelTabContentType | null
  onSelectPanel: (panel: WorkspacePanelTabContentType) => void
  onClosePanel: (panel: WorkspacePanelTabContentType) => void
}

export function SpoolSessionTabStrip({
  sessions,
  activeSessionRef,
  onSelect,
  createMenu,
  panelItems,
  activePanel,
  onSelectPanel,
  onClosePanel
}: SpoolSessionTabStripProps): React.JSX.Element {
  const navigationScopeId = useId()
  const [recentSessionRefs, setRecentSessionRefs] = useState<readonly string[]>([])
  useEffect(() => {
    if (!activeSessionRef) {
      return
    }
    setRecentSessionRefs((current) => {
      if (current[0] === activeSessionRef) {
        return current
      }
      return [
        activeSessionRef,
        ...current.filter((sessionRef) => sessionRef !== activeSessionRef)
      ].slice(0, MAX_RECENT_SPOOL_SESSION_TABS)
    })
  }, [activeSessionRef])
  const visibleSessions = useMemo(
    () => projectVisibleSpoolSessionTabs(sessions, activeSessionRef, recentSessionRefs),
    [activeSessionRef, recentSessionRefs, sessions]
  )
  const activeTabId = activePanel ? getSpoolWorkspacePanelTabId(activePanel) : activeSessionRef
  const activeTabIsVisible = activePanel
    ? panelItems.some((item) => item.id === activePanel)
    : visibleSessions.some((session) => session.sessionRef === activeSessionRef)
  const layoutKey = useMemo(
    () =>
      visibleSessions
        .map(
          (session) =>
            `${session.sessionRef}:${session.kind}:${session.agent ?? ''}:${session.title}`
        )
        .concat(panelItems.map((item) => `panel:${item.id}:${item.title}`))
        .join('\u001f'),
    [panelItems, visibleSessions]
  )

  return (
    <div className="flex h-full min-w-0 flex-1 items-stretch overflow-hidden">
      <WorkspaceTabStripViewport
        activeTabId={activeTabId}
        layoutKey={layoutKey}
        tabCount={visibleSessions.length + panelItems.length}
        navigationScopeId={navigationScopeId}
        stripProps={{
          role: 'tablist',
          'aria-label': translate(
            'auto.components.spool.SpoolWorkspaceSurface.tabs.sessions',
            'Sessions'
          ),
          onKeyDown: handleSpoolSessionTabKeyDown
        }}
      >
        {visibleSessions.map((session, index) => (
          <WorkspaceSelectableTab
            key={session.sessionRef}
            id={session.sessionRef}
            title={session.title}
            active={activePanel === null && session.sessionRef === activeSessionRef}
            tabIndex={
              (activePanel === null && session.sessionRef === activeSessionRef) ||
              (!activeTabIsVisible && index === 0)
                ? 0
                : -1
            }
            icon={
              session.kind === 'terminal' ? (
                <SquareTerminal className="size-3.5" />
              ) : (
                <AgentIcon agent={session.agent} size={14} />
              )
            }
            onSelect={onSelect}
          />
        ))}
        {panelItems.map((item, index) => (
          <SpoolWorkspacePanelTab
            key={item.id}
            item={item}
            active={item.id === activePanel}
            tabIndex={
              item.id === activePanel ||
              (!activeTabIsVisible && visibleSessions.length === 0 && index === 0)
                ? 0
                : -1
            }
            onSelect={() => onSelectPanel(item.id)}
            onClose={() => onClosePanel(item.id)}
          />
        ))}
      </WorkspaceTabStripViewport>
      {createMenu}
    </div>
  )
}

function projectVisibleSpoolSessionTabs(
  sessions: readonly SpoolSessionCatalogEntry[],
  activeSessionRef: string | null,
  recentSessionRefs: readonly string[]
): readonly SpoolSessionCatalogEntry[] {
  if (sessions.length <= MAX_VISIBLE_SPOOL_SESSION_TABS) {
    return sessions
  }
  const sessionByRef = new Map(sessions.map((session) => [session.sessionRef, session]))
  const priorityRefs = recentSessionRefs.toReversed()
  if (activeSessionRef && !priorityRefs.includes(activeSessionRef)) {
    priorityRefs.push(activeSessionRef)
  }
  const prioritySessions = priorityRefs
    .map((sessionRef) => sessionByRef.get(sessionRef))
    .filter((session): session is SpoolSessionCatalogEntry => session !== undefined)
  const prioritySet = new Set(prioritySessions.map((session) => session.sessionRef))
  const visible = sessions.slice(0, MAX_VISIBLE_SPOOL_SESSION_TABS)

  for (const prioritySession of prioritySessions) {
    if (visible.some((session) => session.sessionRef === prioritySession.sessionRef)) {
      continue
    }
    let replaceIndex = visible.length - 1
    while (replaceIndex >= 0 && prioritySet.has(visible[replaceIndex]?.sessionRef ?? '')) {
      replaceIndex -= 1
    }
    if (replaceIndex < 0) {
      break
    }
    visible.splice(replaceIndex, 1)
    visible.push(prioritySession)
  }
  return visible
}

function handleSpoolSessionTabKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
  if (
    event.key !== 'ArrowLeft' &&
    event.key !== 'ArrowRight' &&
    event.key !== 'Home' &&
    event.key !== 'End'
  ) {
    return
  }
  const target = event.target as HTMLElement
  const currentTab = target.closest<HTMLButtonElement>('[role="tab"]')
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
  const currentIndex = currentTab ? tabs.indexOf(currentTab) : -1
  if (currentIndex < 0 || tabs.length === 0) {
    return
  }
  event.preventDefault()
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : event.key === 'ArrowLeft'
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length
  const nextTab = tabs[nextIndex]
  nextTab?.focus()
  nextTab?.click()
}
