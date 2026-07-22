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
import {
  selectActiveSpoolWorkspace,
  selectSpoolCanControl,
  selectSpoolRequesterControlState
} from '@/store/slices/spool-sharing-selectors'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'

import type {
  SpoolSessionCatalogEntry,
  SpoolSessionCatalogPageState
} from '../../../../shared/spool/spool-catalog-contract'
import { getSpoolSessionCatalogStatusLabel } from './spool-session-catalog-status'
import { SpoolSessionCreateMenu } from './spool-session-create-menu'
import { SpoolSessionPane } from './spool-session-pane'
import { getSpoolSessionRouteKey } from './spool-session-route'
import { SpoolSessionTabStrip } from './spool-session-tab-strip'
import { getSpoolWorktreeRouteKey } from './spool-worktree-route'
import { useSpoolCreatedSessionTabs } from './use-spool-created-session-tabs'
import { useSpoolDefaultSessionRoute } from './use-spool-default-session-route'

const EMPTY_SPOOL_SESSION_TABS: readonly SpoolSessionCatalogEntry[] = []

export default function SpoolWorkspaceSurface(): React.JSX.Element | null {
  const route = useAppStore((state) => state.activeSpoolWorkspaceRoute)
  if (!route) {
    return null
  }
  // Why: worktree-local request state must reset atomically when the remote binding changes.
  return <SpoolWorkspaceSurfaceContent key={getSpoolWorktreeRouteKey(route)} route={route} />
}

function SpoolWorkspaceSurfaceContent({
  route
}: {
  route: SpoolWorkspaceRoute
}): React.JSX.Element | null {
  const workspace = useAppStore(useShallow(selectActiveSpoolWorkspace))
  const canControl = useAppStore((state) => selectSpoolCanControl(state, route))
  const controlState = useAppStore((state) => selectSpoolRequesterControlState(state, route))
  const markControlPending = useAppStore((state) => state.markSpoolControlPending)
  const setActiveRoute = useAppStore((state) => state.setActiveSpoolWorkspaceRoute)
  const [requesting, setRequesting] = useState(false)
  const [pendingFocusSessionRef, setPendingFocusSessionRef] = useState<string | null>(null)
  const catalogSessions = workspace?.worktree.sessions ?? EMPTY_SPOOL_SESSION_TABS
  const sessionCatalogStatus = workspace?.worktree.sessionCatalog.status ?? null
  const catalogRevision = workspace?.desktop.catalog?.catalogRevision ?? null
  const { sessions, retainMissingSession, recordCreatedSession } = useSpoolCreatedSessionTabs({
    catalogSessions,
    catalogStatus: sessionCatalogStatus,
    catalogRevision,
    activeSessionRef: route.sessionRef ?? null
  })
  useSpoolDefaultSessionRoute({ route, sessions, setActiveRoute })
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
      await window.api.spoolSharing.requestControl({
        desktopRef: route.desktopRef,
        worktreeRef: route.worktreeRef
      })
      markControlPending(route)
    } catch {
      toast.error(
        translate(
          'auto.components.spool.SpoolWorkspaceSurface.requestFailed',
          'Could not request control.'
        )
      )
    } finally {
      setRequesting(false)
    }
  }, [controlState, markControlPending, requesting, route])

  const selectSession = useCallback(
    (sessionRef: string): void => {
      setPendingFocusSessionRef(null)
      setActiveRoute({ ...route, sessionRef })
    },
    [route, setActiveRoute]
  )

  const handleSessionCreated = useCallback(
    (session: SpoolSessionCatalogEntry): void => {
      recordCreatedSession(session)
      setPendingFocusSessionRef(session.sessionRef)
      setActiveRoute({ ...route, sessionRef: session.sessionRef })
    },
    [recordCreatedSession, route, setActiveRoute]
  )

  const handleCreatedSessionFocused = useCallback((sessionRef: string): void => {
    setPendingFocusSessionRef((current) => (current === sessionRef ? null : current))
  }, [])

  if (!workspace) {
    return null
  }

  const connected = workspace.desktop.connectionStatus === 'connected'
  const accessLabel = !connected
    ? translate('auto.components.spool.SpoolWorkspaceSurface.disconnected', 'Disconnected')
    : canControl
      ? translate('auto.components.spool.SpoolWorkspaceSurface.controlGranted', 'Control granted')
      : translate('auto.components.spool.SpoolWorkspaceSurface.readOnly', 'Read-only')
  const worktreeRouteKey = getSpoolWorktreeRouteKey(route)

  const accessControls = (
    <>
      <SpoolSessionCatalogStatus status={workspace.worktree.sessionCatalog.status} />
      <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[11px]">
        {canControl ? <ShieldCheck aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
        {accessLabel}
      </Badge>
      {controlState === 'pending' ? (
        <Button type="button" size="xs" variant="secondary" disabled>
          {translate(
            'auto.components.spool.SpoolWorkspaceSurface.requestPending',
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
            'auto.components.spool.SpoolWorkspaceSurface.requestControl',
            'Request control'
          )}
        </Button>
      ) : null}
    </>
  )

  return (
    <main
      data-spool-workspace=""
      data-can-control={canControl ? 'true' : 'false'}
      className={WORKSPACE_COLUMN_FRAME_CLASS_NAME}
    >
      <div className={WORKSPACE_COLUMN_BODY_CLASS_NAME}>
        <WorkspacePaneFrame
          worktreeId={worktreeRouteKey}
          stripId={`spool:${worktreeRouteKey}`}
          tabBar={
            <SpoolSessionTabStrip
              sessions={sessions}
              activeSessionRef={route.sessionRef ?? null}
              onSelect={selectSession}
              createMenu={
                <SpoolSessionCreateMenu
                  route={route}
                  connected={connected}
                  canControl={canControl}
                  controlState={controlState}
                  onCreated={handleSessionCreated}
                />
              }
            />
          }
          trailingActions={accessControls}
          reserveCollapsedSidebarHeaderSpace
          reserveWindowControlsSpace
          bodyClassName="flex bg-[var(--editor-surface)]"
        >
          {sessionRoute ? (
            <SpoolSessionPane
              key={getSpoolSessionRouteKey(sessionRoute)}
              route={sessionRoute}
              retainMissingSession={retainMissingSession}
              focusRequested={pendingFocusSessionRef === sessionRoute.sessionRef}
              onFocusHandled={handleCreatedSessionFocused}
            />
          ) : (
            <SpoolWorkspaceEmptyPane
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

function SpoolWorkspaceEmptyPane({
  title,
  hasSessions,
  sessionCatalogStatus
}: {
  title: string
  hasSessions: boolean
  sessionCatalogStatus: SpoolSessionCatalogPageState['status']
}): React.JSX.Element {
  const description = hasSessions
    ? translate(
        'auto.components.spool.SpoolWorkspaceSurface.selectSession',
        'Select a Terminal or agent session from the tab bar.'
      )
    : sessionCatalogStatus === 'loading'
      ? getSpoolSessionCatalogStatusLabel('loading')
      : sessionCatalogStatus === 'error'
        ? getSpoolSessionCatalogStatusLabel('error')
        : translate(
            'auto.components.spool.SpoolWorkspaceSurface.noSessions',
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

function SpoolSessionCatalogStatus({
  status
}: {
  status: SpoolSessionCatalogPageState['status']
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
      {getSpoolSessionCatalogStatusLabel(status)}
    </span>
  )
}
