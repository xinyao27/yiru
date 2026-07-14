import type React from 'react'
import { useCallback, useState } from 'react'
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
import { cn } from '@/lib/utils'
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
  const setRoute = useAppStore((state) => state.setActiveSpoolWorkspaceRoute)
  const [activeTab, setActiveTab] = useState<SpoolWorkspaceTab>('sessions')
  const [requesting, setRequesting] = useState(false)

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
          {WORKSPACE_TABS.map((tab) => {
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
          <div className="flex h-full min-h-0">
            <aside className="scrollbar-sleek w-56 shrink-0 overflow-y-auto border-r border-border bg-card p-2 text-card-foreground">
              <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                {translate('auto.components.spool.SpoolWorkspaceSurface.sessions', 'Sessions')}
              </div>
              <div className="space-y-0.5">
                {workspace.worktree.sessions.map((session) => {
                  const selected = route.sessionRef === session.sessionRef
                  return (
                    <button
                      key={session.sessionRef}
                      type="button"
                      data-current={selected ? 'true' : undefined}
                      onClick={() =>
                        setRoute({
                          ...route,
                          sessionRef: session.sessionRef
                        })
                      }
                      className={cn(
                        'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'
                      )}
                    >
                      <SquareTerminal
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    </button>
                  )
                })}
              </div>
            </aside>
            {workspace.session && route.sessionRef ? (
              <SpoolSessionPane
                key={getSpoolSessionRouteKey({ ...route, sessionRef: route.sessionRef })}
                route={{ ...route, sessionRef: route.sessionRef }}
              />
            ) : (
              <SpoolWorkspaceEmptyPane
                icon={SquareTerminal}
                title={workspace.worktree.name}
                description={translate(
                  'auto.components.spool.SpoolWorkspaceSurface.selectSession',
                  'Select a session to open its remote terminal.'
                )}
                canControl={canControl}
              />
            )}
          </div>
        </TabsContent>
        <TabsContent value="files" className="min-h-0 overflow-hidden">
          <SpoolFilesPane route={route} />
        </TabsContent>
        <TabsContent value="changes" className="min-h-0 overflow-hidden">
          <SpoolGitPane route={route} />
        </TabsContent>
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
