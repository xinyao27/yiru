import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { LoaderCircle, LockKeyhole, ShieldCheck, SquareTerminal, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import type { SpoolSessionCatalogPageState } from '../../../../shared/spool/spool-catalog-contract'
import { useAppStore } from '@/store'
import {
  selectActiveSpoolWorkspace,
  selectSpoolCanControl,
  selectSpoolRequesterControlState
} from '@/store/slices/spool-sharing-selectors'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WorkspacePaneFrame } from '@/components/tab-group/WorkspacePaneFrame'
import { SpoolSessionPane } from './SpoolSessionPane'
import { SpoolSessionTabStrip } from './SpoolSessionTabStrip'
import { getSpoolSessionRouteKey } from './spool-session-route'
import { getSpoolWorktreeRouteKey } from './spool-worktree-route'

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
      setActiveRoute({ ...route, sessionRef })
    },
    [route, setActiveRoute]
  )

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
      className="flex min-h-0 min-w-0 flex-1 bg-background"
    >
      <WorkspacePaneFrame
        worktreeId={worktreeRouteKey}
        stripId={`spool:${worktreeRouteKey}`}
        tabBar={
          <SpoolSessionTabStrip
            sessions={workspace.worktree.sessions}
            activeSessionRef={route.sessionRef ?? null}
            onSelect={selectSession}
          />
        }
        trailingActions={accessControls}
        reserveCollapsedSidebarHeaderSpace
        reserveClosedExplorerToggleSpace
        bodyClassName="flex bg-[var(--editor-surface)]"
      >
        {sessionRoute ? (
          <SpoolSessionPane key={getSpoolSessionRouteKey(sessionRoute)} route={sessionRoute} />
        ) : (
          <SpoolWorkspaceEmptyPane
            title={workspace.worktree.name}
            hasSessions={workspace.worktree.sessions.length > 0}
            sessionCatalogStatus={workspace.worktree.sessionCatalog.status}
          />
        )}
      </WorkspacePaneFrame>
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
      ? getSessionCatalogStatusLabel('loading')
      : sessionCatalogStatus === 'error'
        ? getSessionCatalogStatusLabel('error')
        : translate(
            'auto.components.spool.SpoolWorkspaceSurface.noSessions',
            'This shared worktree has no Terminal or agent sessions yet.'
          )
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <SquareTerminal aria-hidden="true" className="mx-auto mb-3 size-7 text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
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
      className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="size-3 animate-spin" />
      ) : (
        <TriangleAlert aria-hidden="true" className="size-3" />
      )}
      {getSessionCatalogStatusLabel(status)}
    </span>
  )
}

function getSessionCatalogStatusLabel(
  status: Exclude<SpoolSessionCatalogPageState['status'], 'complete'>
): string {
  return status === 'loading'
    ? translate('auto.components.sidebar.SpoolWorktreeRow.loadingSessions', 'Loading sessions…')
    : translate(
        'auto.components.sidebar.SpoolWorktreeRow.sessionsUnavailable',
        'Session list unavailable'
      )
}
