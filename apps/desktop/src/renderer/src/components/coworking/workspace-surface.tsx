import {
  LockKey as LockKeyhole,
  ShieldCheck,
  TerminalWindow as SquareTerminal,
  Warning as TriangleAlert
} from '@phosphor-icons/react'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'

import {
  selectActiveCoworkingWorkspace,
  selectCoworkingCanControl,
  selectCoworkingRequesterControlState
} from '@/components/coworking/selectors'
import type { CoworkingWorkspaceRoute } from '@/components/coworking/types'
import { LoadingIndicator } from '@/components/loading-indicator'
import {
  WORKSPACE_COLUMN_BODY_CLASS_NAME,
  WORKSPACE_COLUMN_FRAME_CLASS_NAME
} from '@/components/tab-group/workspace-column-chrome'
import { WorkspacePaneFrame } from '@/components/tab-group/workspace-pane-frame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import type {
  CoworkingSessionCatalogEntry,
  CoworkingSessionCatalogPageState
} from '../../../../shared/coworking/catalog-contract'
import { getCoworkingSessionCatalogStatusLabel } from './session-catalog-status'
import { CoworkingSessionCreateMenu } from './session-create-menu'
import { CoworkingSessionPane } from './session-pane'
import { getCoworkingSessionRouteKey } from './session-route'
import { CoworkingSessionTabStrip } from './session-tab-strip'
import { useCoworkingCreatedSessionTabs } from './use-created-session-tabs'
import { useCoworkingDefaultSessionRoute } from './use-default-session-route'
import { useCoworkingWorkspacePanelTabs } from './use-workspace-panel-tabs'
import { CoworkingWorkspacePanelPane } from './workspace-panel-pane'
import { getCoworkingWorktreeRouteKey } from './worktree-route'

const EMPTY_COWORKING_SESSION_TABS: readonly CoworkingSessionCatalogEntry[] = []

export default function CoworkingWorkspaceSurface(): React.JSX.Element | null {
  const route = useAppStore((state) => state.activeCoworkingWorkspaceRoute)
  if (!route) {
    return null
  }
  // Why: worktree-local request state must reset atomically when the remote binding changes.
  return (
    <CoworkingWorkspaceSurfaceContent key={getCoworkingWorktreeRouteKey(route)} route={route} />
  )
}

function CoworkingWorkspaceSurfaceContent({
  route
}: {
  route: CoworkingWorkspaceRoute
}): React.JSX.Element | null {
  const workspace = useAppStore(useShallow(selectActiveCoworkingWorkspace))
  const canControl = useAppStore((state) => selectCoworkingCanControl(state, route))
  const controlState = useAppStore((state) => selectCoworkingRequesterControlState(state, route))
  const markControlPending = useAppStore((state) => state.markCoworkingControlPending)
  const setActiveRoute = useAppStore((state) => state.setActiveCoworkingWorkspaceRoute)
  const [requesting, setRequesting] = useState(false)
  const [pendingFocusSessionRef, setPendingFocusSessionRef] = useState<string | null>(null)
  const catalogSessions = workspace?.worktree.sessions ?? EMPTY_COWORKING_SESSION_TABS
  const sessionCatalogStatus = workspace?.worktree.sessionCatalog.status ?? null
  const catalogRevision = workspace?.desktop.catalog?.catalogRevision ?? null
  const connected = workspace?.desktop.connectionStatus === 'connected'
  const supportsGit = workspace?.worktree.kind === 'git'
  const {
    activePanel,
    checksState,
    closePanel,
    items: panelItems,
    openItems: openPanelItems,
    openPanel,
    selectSession: selectSessionPanel
  } = useCoworkingWorkspacePanelTabs({ route, connected, supportsGit })
  const { sessions, retainMissingSession, recordCreatedSession } = useCoworkingCreatedSessionTabs({
    catalogSessions,
    catalogStatus: sessionCatalogStatus,
    catalogRevision,
    activeSessionRef: route.sessionRef ?? null
  })
  useCoworkingDefaultSessionRoute({ route, sessions, setActiveRoute })
  const sessionRoute = useMemo(
    () =>
      route.sessionRef
        ? {
            desktopRef: route.desktopRef,
            worktreeRef: route.worktreeRef,
            connectionEpoch: route.connectionEpoch,
            sessionRef: route.sessionRef
          }
        : null,
    [route.connectionEpoch, route.desktopRef, route.sessionRef, route.worktreeRef]
  )

  const requestControl = useCallback(async (): Promise<void> => {
    if (requesting || controlState !== 'read-only') {
      return
    }
    setRequesting(true)
    try {
      await window.api.coworkingSharing.requestControl({
        desktopRef: route.desktopRef,
        worktreeRef: route.worktreeRef
      })
      markControlPending(route)
    } catch {
      toast.error(
        translate(
          'auto.components.coworking.CoworkingWorkspaceSurface.requestFailed',
          'Could not request control.'
        )
      )
    } finally {
      setRequesting(false)
    }
  }, [controlState, markControlPending, requesting, route])

  const selectSession = useCallback(
    (sessionRef: string): void => {
      selectSessionPanel()
      setPendingFocusSessionRef(null)
      setActiveRoute({ ...route, sessionRef })
    },
    [route, selectSessionPanel, setActiveRoute]
  )

  const handleSessionCreated = useCallback(
    (session: CoworkingSessionCatalogEntry): void => {
      recordCreatedSession(session)
      selectSessionPanel()
      setPendingFocusSessionRef(session.sessionRef)
      setActiveRoute({ ...route, sessionRef: session.sessionRef })
    },
    [recordCreatedSession, route, selectSessionPanel, setActiveRoute]
  )

  const handleCreatedSessionFocused = useCallback((sessionRef: string): void => {
    setPendingFocusSessionRef((current) => (current === sessionRef ? null : current))
  }, [])

  if (!workspace) {
    return null
  }

  const accessLabel = !connected
    ? translate('auto.components.coworking.CoworkingWorkspaceSurface.disconnected', 'Disconnected')
    : canControl
      ? translate(
          'auto.components.coworking.CoworkingWorkspaceSurface.controlGranted',
          'Control granted'
        )
      : translate('auto.components.coworking.CoworkingWorkspaceSurface.readOnly', 'Read-only')
  const worktreeRouteKey = getCoworkingWorktreeRouteKey(route)

  const accessControls = (
    <>
      <CoworkingSessionCatalogStatus status={workspace.worktree.sessionCatalog.status} />
      <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[11px]">
        {canControl ? <ShieldCheck aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
        {accessLabel}
      </Badge>
      {controlState === 'pending' ? (
        <Button type="button" size="xs" variant="secondary" disabled>
          {translate(
            'auto.components.coworking.CoworkingWorkspaceSurface.requestPending',
            'Request pending'
          )}
        </Button>
      ) : !canControl ? (
        <Button
          type="button"
          size="xs"
          disabled={!connected || requesting}
          onClick={() => void requestControl()}
        >
          {translate(
            'auto.components.coworking.CoworkingWorkspaceSurface.requestControl',
            'Request control'
          )}
        </Button>
      ) : null}
    </>
  )

  return (
    <main
      data-coworking-workspace=""
      data-can-control={canControl ? 'true' : 'false'}
      className={WORKSPACE_COLUMN_FRAME_CLASS_NAME}
    >
      <div className={WORKSPACE_COLUMN_BODY_CLASS_NAME}>
        <WorkspacePaneFrame
          worktreeId={worktreeRouteKey}
          stripId={`coworking:${worktreeRouteKey}`}
          tabBar={
            <CoworkingSessionTabStrip
              sessions={sessions}
              activeSessionRef={route.sessionRef ?? null}
              onSelect={selectSession}
              createMenu={
                <CoworkingSessionCreateMenu
                  route={route}
                  connected={connected}
                  canControl={canControl}
                  onCreated={handleSessionCreated}
                  panelItems={panelItems}
                  onOpenPanel={openPanel}
                />
              }
              panelItems={openPanelItems}
              activePanel={activePanel}
              onSelectPanel={openPanel}
              onClosePanel={closePanel}
            />
          }
          trailingActions={accessControls}
          reserveCollapsedSidebarHeaderSpace
          reserveWindowControlsSpace
          bodyClassName="flex bg-background"
        >
          {activePanel ? (
            <CoworkingWorkspacePanelPane
              panel={activePanel}
              route={route}
              supportsGit={supportsGit}
              sessions={sessions}
              catalogStatus={workspace.worktree.sessionCatalog.status}
              checksState={checksState}
            />
          ) : sessionRoute ? (
            <CoworkingSessionPane
              key={getCoworkingSessionRouteKey(sessionRoute)}
              route={sessionRoute}
              retainMissingSession={retainMissingSession}
              focusRequested={pendingFocusSessionRef === sessionRoute.sessionRef}
              onFocusHandled={handleCreatedSessionFocused}
            />
          ) : (
            <CoworkingWorkspaceEmptyPane
              title={workspace.worktree.name}
              hasSessions={sessions.length > 0}
              sessionCatalogStatus={workspace.worktree.sessionCatalog.status}
            />
          )}
        </WorkspacePaneFrame>
      </div>
    </main>
  )
}

function CoworkingWorkspaceEmptyPane({
  title,
  hasSessions,
  sessionCatalogStatus
}: {
  title: string
  hasSessions: boolean
  sessionCatalogStatus: CoworkingSessionCatalogPageState['status']
}): React.JSX.Element {
  const description = hasSessions
    ? translate(
        'auto.components.coworking.CoworkingWorkspaceSurface.selectSession',
        'Select a Terminal or agent session from the tab bar.'
      )
    : sessionCatalogStatus === 'loading'
      ? getCoworkingSessionCatalogStatusLabel('loading')
      : sessionCatalogStatus === 'error'
        ? getCoworkingSessionCatalogStatusLabel('error')
        : translate(
            'auto.components.coworking.CoworkingWorkspaceSurface.noSessions',
            'This shared worktree has no Terminal or agent sessions yet.'
          )
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <SquareTerminal aria-hidden="true" className="text-muted-foreground mx-auto mb-3 size-7" />
        <h2 className="text-foreground text-sm font-medium">{title}</h2>
        <p className="text-muted-foreground mt-1 text-xs leading-5">{description}</p>
      </div>
    </div>
  )
}

function CoworkingSessionCatalogStatus({
  status
}: {
  status: CoworkingSessionCatalogPageState['status']
}): React.JSX.Element | null {
  if (status === 'complete') {
    return null
  }
  const loading = status === 'loading'
  return (
    <span
      role="status"
      className="text-muted-foreground flex shrink-0 items-center gap-1 text-[11px]"
    >
      {loading ? (
        <LoadingIndicator aria-hidden="true" className="size-4" />
      ) : (
        <TriangleAlert aria-hidden="true" className="size-3" />
      )}
      {getCoworkingSessionCatalogStatusLabel(status)}
    </span>
  )
}
