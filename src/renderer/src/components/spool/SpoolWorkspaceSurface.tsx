import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { FileText, GitCompareArrows, LockKeyhole, ShieldCheck, SquareTerminal } from 'lucide-react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SpoolFilesPane } from './SpoolFilesPane'
import { SpoolGitPane } from './SpoolGitPane'
import { SpoolSessionPane } from './SpoolSessionPane'
import { getSpoolSessionRouteKey } from './spool-session-route'
import { getSpoolWorktreeRouteKey } from './spool-worktree-route'

type SpoolWorkspaceTab = 'sessions' | 'files' | 'changes'

const WORKSPACE_TABS: readonly {
  id: SpoolWorkspaceTab
  icon: typeof SquareTerminal
}[] = [
  { id: 'sessions', icon: SquareTerminal },
  { id: 'files', icon: FileText },
  { id: 'changes', icon: GitCompareArrows }
]
const FOLDER_WORKSPACE_TABS = WORKSPACE_TABS.filter((tab) => tab.id !== 'changes')

function getWorkspaceTabLabel(tab: SpoolWorkspaceTab): string {
  switch (tab) {
    case 'sessions':
      return translate('auto.components.spool.SpoolWorkspaceSurface.tabs.sessions', 'Sessions')
    case 'files':
      return translate('auto.components.spool.SpoolWorkspaceSurface.tabs.files', 'Files')
    case 'changes':
      return translate('auto.components.spool.SpoolWorkspaceSurface.tabs.changes', 'Changes')
  }
}

function isSpoolWorkspaceTab(value: string): value is SpoolWorkspaceTab {
  return WORKSPACE_TABS.some((tab) => tab.id === value)
}

export default function SpoolWorkspaceSurface(): React.JSX.Element | null {
  const route = useAppStore((state) => state.activeSpoolWorkspaceRoute)
  if (!route) {
    return null
  }
  // Why: worktree-local tabs and in-flight UI state must reset atomically when the route changes.
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
  const [activeTab, setActiveTab] = useState<SpoolWorkspaceTab>('sessions')
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

  if (!workspace) {
    return null
  }

  const connected = workspace.desktop.connectionStatus === 'connected'
  // Why: folder projects have no repository boundary, so their wire surface omits Git reads too.
  const workspaceTabs =
    workspace.worktree.kind === 'folder' ? FOLDER_WORKSPACE_TABS : WORKSPACE_TABS
  const accessLabel = !connected
    ? translate('auto.components.spool.SpoolWorkspaceSurface.disconnected', 'Disconnected')
    : canControl
      ? translate('auto.components.spool.SpoolWorkspaceSurface.controlGranted', 'Control granted')
      : translate('auto.components.spool.SpoolWorkspaceSurface.readOnly', 'Read-only')

  return (
    <main
      data-spool-workspace=""
      data-can-control={canControl ? 'true' : 'false'}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
    >
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-border bg-card px-3 text-card-foreground">
        <div className="min-w-0 flex-1 truncate text-[13px]">
          <span className="text-muted-foreground">{workspace.desktop.userDisplayName}</span>
          <span className="px-1.5 text-muted-foreground">/</span>
          <span className="text-muted-foreground">{workspace.project.name}</span>
          <span className="px-1.5 text-muted-foreground">/</span>
          <span className="font-medium text-foreground">{workspace.worktree.name}</span>
        </div>
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
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => isSpoolWorkspaceTab(value) && setActiveTab(value)}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList
          variant="line"
          className="h-9 w-full shrink-0 justify-start rounded-none border-b border-border bg-card px-2 py-0 text-card-foreground"
        >
          {workspaceTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="h-8 flex-none rounded-none px-2 text-xs font-normal"
              >
                <Icon aria-hidden="true" className="size-3.5" />
                {getWorkspaceTabLabel(tab.id)}
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="sessions" className="min-h-0 overflow-hidden">
          {sessionRoute ? (
            <SpoolSessionPane key={getSpoolSessionRouteKey(sessionRoute)} route={sessionRoute} />
          ) : (
            <SpoolWorkspaceEmptyPane
              icon={SquareTerminal}
              title={workspace.worktree.name}
              description={translate(
                'auto.components.spool.SpoolWorkspaceSurface.selectSession',
                'Select a session from the sidebar to open its remote terminal.'
              )}
              canControl={canControl}
            />
          )}
        </TabsContent>
        <TabsContent value="files" className="min-h-0 overflow-hidden">
          <SpoolFilesPane route={route} supportsDiff={workspace.worktree.kind === 'git'} />
        </TabsContent>
        {workspace.worktree.kind === 'git' ? (
          <TabsContent value="changes" className="min-h-0 overflow-hidden">
            <SpoolGitPane route={route} />
          </TabsContent>
        ) : null}
      </Tabs>
    </main>
  )
}

function SpoolWorkspaceEmptyPane({
  icon: Icon,
  title,
  description,
  canControl
}: {
  icon: typeof SquareTerminal
  title: string
  description: string
  canControl: boolean
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--editor-surface)] p-6">
      <div className="max-w-md text-center">
        <Icon aria-hidden="true" className="mx-auto mb-3 size-7 text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {canControl
            ? translate(
                'auto.components.spool.SpoolWorkspaceSurface.mutableMode',
                'This connection can use worktree mutation controls.'
              )
            : translate(
                'auto.components.spool.SpoolWorkspaceSurface.readOnlyMode',
                'This public worktree is read-only until its owner grants control.'
              )}
        </p>
      </div>
    </div>
  )
}
