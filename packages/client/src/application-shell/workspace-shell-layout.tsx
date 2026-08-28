import { Suspense } from 'react'

import { RecoverableRenderErrorBoundary } from '../error-boundaries/recoverable-render-error-boundary'
import { SidePanelNavigation } from '../extension/side-panel/navigation'
import { translate } from '../i18n/i18n'
import { isExtensionRenderer } from '../runtime/renderer-host'
import Sidebar from '../sidebar/panel'
import type { AppState } from '../store/types'
import { cn } from '../ui/class-names'
import { lazyWithRetry as lazy } from './lazy-with-retry'
import { TITLEBAR_CLASS_NAME, TITLEBAR_LEFT_CLASS_NAME } from './titlebar-classes'
import type { LeftTitlebarChromeLayout } from './titlebar-left-chrome'

const HomePage = lazy(() => import('../home/page'))
const Landing = lazy(() => import('./landing-page'))
const MobilePage = lazy(() => import('../mobile/page'))
const Settings = lazy(() => import('../settings/page'))
const SkillsPage = lazy(() => import('../skills/page'))
const Terminal = lazy(() => import('../terminal-workspace/panel'))
const WorkspaceSidebar = lazy(() => import('../workspace-panel/sidebar'))
const WorkspaceSpacePage = lazy(() => import('../workspace-space/page'))
const WorktreeCreationPanel = lazy(() => import('../worktree-creation/panel'))

type WorkspaceShellLayoutProps = {
  activePendingCreationId: string | null
  activeView: AppState['activeView']
  activeWorktreeId: string | null
  appearanceStyle: React.CSSProperties | undefined
  creationLayoutActive: boolean
  layout: LeftTitlebarChromeLayout
  projectId: string | undefined
  settingsChromeOverlayActive: boolean
  settingsNativeSidebarMaterialActive: boolean
  shouldMountTerminalWorkbench: boolean
  showSidebar: boolean
  sidebarOpen: boolean
  stackedPageOwnsTitlebar: boolean
  stackedSidebarOpen: boolean
  terminalWorkbenchVisible: boolean
  titlebarLeftControls: React.ReactNode
  titlebarMainStrip: React.ReactNode
  windowBackgroundBlurEnabled: boolean
  workspaceChromeActive: boolean
  workspaceProfileSwitcher: React.ReactNode
  worktreeScrollOffsetRef: React.MutableRefObject<number>
}

export function WorkspaceShellLayout({
  activePendingCreationId,
  activeView,
  activeWorktreeId,
  appearanceStyle,
  creationLayoutActive,
  layout,
  projectId,
  settingsChromeOverlayActive,
  settingsNativeSidebarMaterialActive,
  shouldMountTerminalWorkbench,
  showSidebar,
  sidebarOpen,
  stackedPageOwnsTitlebar,
  stackedSidebarOpen,
  terminalWorkbenchVisible,
  titlebarLeftControls,
  titlebarMainStrip,
  windowBackgroundBlurEnabled,
  workspaceChromeActive,
  workspaceProfileSwitcher,
  worktreeScrollOffsetRef
}: WorkspaceShellLayoutProps): React.JSX.Element {
  const isExtensionHost = isExtensionRenderer()
  const workspacePanelPlacement = isExtensionHost ? 'left' : 'right'
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="app.workspace-shell"
      surface="workspace-shell"
      resetKey={activeView}
      title={translate('auto.App.df1d56bf87', 'The workspace shell hit an error.')}
      description={translate(
        'auto.App.8504ddf267',
        'The app is still running. Retry the shell or use the menu to report the crash details.'
      )}
    >
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            workspacePanelPlacement === 'left' && 'order-last'
          )}
        >
          {!isExtensionHost && !layout.shouldMount ? (
            <div
              className={cn(
                TITLEBAR_CLASS_NAME,
                settingsChromeOverlayActive &&
                  'absolute inset-x-0 top-0 z-20 border-b-0 bg-transparent'
              )}
            >
              <div
                className={cn(
                  'mr-2 flex h-full shrink-0 items-center',
                  settingsChromeOverlayActive && 'mr-0 w-[var(--settings-sidebar-width)]'
                )}
                style={settingsChromeOverlayActive ? appearanceStyle : undefined}
              >
                {titlebarLeftControls}
              </div>
              {titlebarMainStrip}
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
            {showSidebar ? (
              isExtensionHost ? (
                <ExtensionNavigationColumn />
              ) : (
                <WorktreeSidebarColumn
                  activeView={activeView}
                  appearanceStyle={appearanceStyle}
                  layout={layout}
                  projectId={projectId}
                  placement={workspacePanelPlacement === 'left' ? 'right' : 'left'}
                  sidebarOpen={sidebarOpen}
                  titlebarLeftControls={titlebarLeftControls}
                  worktreeScrollOffsetRef={worktreeScrollOffsetRef}
                />
              )
            ) : null}
            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
                windowBackgroundBlurEnabled || settingsNativeSidebarMaterialActive
                  ? 'bg-transparent'
                  : workspaceChromeActive || creationLayoutActive
                    ? 'workspace-native-material-frame'
                    : 'bg-background'
              )}
            >
              {!isExtensionHost && stackedSidebarOpen && !stackedPageOwnsTitlebar ? (
                <div className={TITLEBAR_CLASS_NAME}>{titlebarMainStrip}</div>
              ) : null}
              <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
                {workspaceProfileSwitcher}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {shouldMountTerminalWorkbench ? (
                    <div
                      className={
                        terminalWorkbenchVisible
                          ? 'flex min-h-0 min-w-0 flex-1'
                          : 'hidden min-h-0 min-w-0 flex-1'
                      }
                    >
                      <Suspense fallback={null}>
                        <RecoverableRenderErrorBoundary
                          boundaryId="terminal.workbench"
                          surface="terminal-workbench"
                          resetKey="terminal"
                          title={translate(
                            'auto.App.5a9519aef0',
                            'The workspace workbench hit an error.'
                          )}
                          description={translate(
                            'auto.App.98d4ea2823',
                            'Terminal, browser, or editor rendering failed in this workspace. Retry to remount it.'
                          )}
                        >
                          <Terminal />
                        </RecoverableRenderErrorBoundary>
                      </Suspense>
                    </div>
                  ) : null}
                  <WorkspacePage
                    activePendingCreationId={activePendingCreationId}
                    activeView={activeView}
                    activeWorktreeId={activeWorktreeId}
                    appearanceStyle={appearanceStyle}
                    creationLayoutActive={creationLayoutActive}
                    isFloating={!isExtensionHost && layout.isFloating}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        {workspaceChromeActive && activeWorktreeId ? (
          <Suspense fallback={null}>
            <RecoverableRenderErrorBoundary
              boundaryId="workspace.sidebar"
              surface="right-sidebar"
              resetKey="workspace-sidebar"
              title={translate(
                'workspace.sidebar.errorTitle',
                'The workspace sidebar hit an error.'
              )}
              description={translate(
                'auto.App.8d1e160ed1',
                'Retry the sidebar or switch tabs to reload this surface.'
              )}
            >
              <WorkspaceSidebar />
            </RecoverableRenderErrorBoundary>
          </Suspense>
        ) : null}
      </div>
    </RecoverableRenderErrorBoundary>
  )
}

function ExtensionNavigationColumn(): React.JSX.Element {
  return (
    <div className="order-last flex min-h-0 shrink-0">
      <SidePanelNavigation presentation="workbench" />
    </div>
  )
}

type WorktreeSidebarColumnProps = Pick<
  WorkspaceShellLayoutProps,
  | 'activeView'
  | 'appearanceStyle'
  | 'layout'
  | 'projectId'
  | 'sidebarOpen'
  | 'titlebarLeftControls'
  | 'worktreeScrollOffsetRef'
> & { placement: 'left' | 'right' }

function WorktreeSidebarColumn({
  activeView,
  appearanceStyle,
  layout,
  placement,
  projectId,
  sidebarOpen,
  titlebarLeftControls,
  worktreeScrollOffsetRef
}: WorktreeSidebarColumnProps): React.JSX.Element {
  const sidebar = (
    <RecoverableRenderErrorBoundary
      boundaryId="sidebar.worktrees"
      surface="sidebar"
      resetKey={activeView}
      title={translate('auto.App.1468601e7b', 'The workspace list hit an error.')}
      description={translate(
        layout.shouldMount ? 'auto.App.bdc71dddc9' : 'auto.App.cba0fafda5',
        layout.shouldMount
          ? 'The active workspace remains open. Retry the list or switch views.'
          : 'The active page remains open. Retry the list or switch views.'
      )}
    >
      <Sidebar
        placement={placement}
        projectId={projectId}
        surface={projectId ? 'project-workspace' : 'workspace'}
        worktreeScrollOffsetRef={worktreeScrollOffsetRef}
        appearanceStyle={appearanceStyle}
      />
    </RecoverableRenderErrorBoundary>
  )
  if (!layout.shouldMount) {
    return sidebar
  }
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col shrink-0',
        placement === 'right' && 'order-last',
        sidebarOpen ? '' : 'relative w-0 overflow-visible'
      )}
    >
      <div
        data-testid="titlebar-left"
        className={cn(
          TITLEBAR_LEFT_CLASS_NAME,
          layout.isFloating && 'absolute top-0 z-10 w-max border-b-0 bg-transparent',
          layout.isFloating && (placement === 'left' ? 'left-0' : 'right-0')
        )}
        style={{
          ...(sidebarOpen ? appearanceStyle : undefined),
          width: sidebarOpen ? '100%' : undefined
        }}
      >
        {titlebarLeftControls}
      </div>
      <div className="flex min-h-0 flex-1">{sidebar}</div>
    </div>
  )
}

type WorkspacePageProps = Pick<
  WorkspaceShellLayoutProps,
  | 'activePendingCreationId'
  | 'activeView'
  | 'activeWorktreeId'
  | 'appearanceStyle'
  | 'creationLayoutActive'
> & { isFloating: boolean }

function WorkspacePage({
  activePendingCreationId,
  activeView,
  activeWorktreeId,
  appearanceStyle,
  creationLayoutActive,
  isFloating
}: WorkspacePageProps): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <RecoverableRenderErrorBoundary
        boundaryId={`page.${activeView}`}
        surface="page"
        resetKey={activeView}
        title={translate('auto.App.b7a714db1e', 'This page hit an error.')}
        description={translate(
          'auto.App.03a14f6b5b',
          'Retry the page or navigate to another Yiru surface.'
        )}
      >
        {activeView === 'settings' ? <Settings sidebarAppearanceStyle={appearanceStyle} /> : null}
        {activeView === 'home' ? <HomePage /> : null}
        {activeView === 'skills' ? <SkillsPage /> : null}
        {activeView === 'space' ? <WorkspaceSpacePage /> : null}
        {activeView === 'mobile' ? <MobilePage /> : null}
        {activeView === 'terminal' && creationLayoutActive && activePendingCreationId ? (
          <WorktreeCreationPanel
            creationId={activePendingCreationId}
            reserveCollapsedSidebarHeaderSpace={isFloating}
          />
        ) : null}
        {activeView === 'terminal' && !activeWorktreeId && !creationLayoutActive ? (
          <Landing />
        ) : null}
      </RecoverableRenderErrorBoundary>
    </Suspense>
  )
}
