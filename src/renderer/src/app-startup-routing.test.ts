import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

describe('renderer startup runtime routing', () => {
  it('hydrates persisted UI before local catalog and worktree hydration', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )
    const startupBlockStart = source.indexOf('void (async () => {')
    const startupBlockEnd = source.indexOf("timeRendererStartupStep('session-get'")
    const startupBlock = source.slice(startupBlockStart, startupBlockEnd)

    const settingsIndex = startupBlock.indexOf('actions.fetchSettings()')
    const uiGetIndex = startupBlock.indexOf("timeRendererStartupStep('ui-get'")
    const hydrateUiIndex = startupBlock.indexOf(
      "timeRendererStartupSyncStep('hydrate-persisted-ui'"
    )
    const localReposIndex = startupBlock.indexOf(
      "actions.fetchReposForAllHosts({ remoteHosts: 'skip' })"
    )
    const localGroupsIndex = startupBlock.indexOf(
      "actions.fetchProjectGroupsForAllHosts({ remoteHosts: 'skip' })"
    )
    const localFoldersIndex = startupBlock.indexOf(
      "actions.fetchFolderWorkspacesForAllHosts({ remoteHosts: 'skip' })"
    )
    const localWorktreesIndex = startupBlock.indexOf(
      "actions.fetchAllWorktrees({ hydrationPurge: 'defer' })"
    )
    const lineageIndex = startupBlock.indexOf('actions.fetchWorktreeLineage()')

    expect(settingsIndex).toBeGreaterThanOrEqual(0)
    expect(startupBlockEnd).toBeGreaterThan(startupBlockStart)
    expect(settingsIndex).toBeLessThan(uiGetIndex)
    expect(uiGetIndex).toBeLessThan(hydrateUiIndex)
    expect(hydrateUiIndex).toBeLessThan(localReposIndex)
    expect(localReposIndex).toBeLessThan(localGroupsIndex)
    expect(localGroupsIndex).toBeLessThan(localFoldersIndex)
    expect(localFoldersIndex).toBeLessThan(localWorktreesIndex)
    expect(lineageIndex).toBe(-1)
  })

  it('refreshes remote catalogs after startup hydration succeeds', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )
    const hydrationDoneIndex = source.indexOf(
      "logRendererStartupDiagnostic('startup-hydration-done'"
    )
    const remoteCatalogIndex = source.indexOf("timeRendererStartupStep('remote-catalog-refresh'")
    const remoteWorktreeIndex = source.indexOf("timeRendererStartupStep('remote-worktree-refresh'")
    const lineageIndex = source.indexOf('actions.fetchWorktreeLineage()')

    expect(hydrationDoneIndex).toBeGreaterThanOrEqual(0)
    expect(hydrationDoneIndex).toBeLessThan(remoteCatalogIndex)
    expect(remoteCatalogIndex).toBeLessThan(remoteWorktreeIndex)
    expect(remoteWorktreeIndex).toBeLessThan(lineageIndex)
    expect(source.slice(remoteCatalogIndex, remoteWorktreeIndex)).toContain(
      'actions.fetchReposForAllHosts()'
    )
    expect(source.slice(remoteCatalogIndex, remoteWorktreeIndex)).toContain(
      'actions.fetchProjectGroupsForAllHosts()'
    )
    expect(source.slice(remoteCatalogIndex, remoteWorktreeIndex)).toContain(
      'actions.fetchFolderWorkspacesForAllHosts()'
    )
  })

  it('waits for first-window startup services before terminal reconnect', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )
    const reconnectIndex = source.indexOf('await actions.reconnectPersistedTerminals')
    const servicesIndex = source.indexOf('await window.api.app.awaitFirstWindowStartupServices()')

    expect(servicesIndex).toBeGreaterThanOrEqual(0)
    expect(servicesIndex).toBeLessThan(reconnectIndex)
  })

  it('does not eagerly import the floating terminal panel on startup', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )

    expect(source).toContain(
      "import { FloatingTerminalToggleButton } from './components/floating-terminal/floating-terminal-toggle-button'"
    )
    expect(source).toContain(
      "import('./components/floating-terminal/floating-terminal-panel').then"
    )
    expect(source).not.toContain("from './components/floating-terminal/floating-terminal-panel'")
  })

  it('does not eagerly import idle optional overlay surfaces on startup', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )

    expect(source).toContain("import('./components/update-card').then")
    expect(source).toContain("import('./components/contextual-tours/contextual-tour-overlay').then")
    expect(source).toContain(
      "import('./components/setup-guide/setup-guide-telemetry-observer').then"
    )
    expect(source).not.toContain("from './components/update-card'")
    expect(source).not.toContain("from './components/contextual-tours/contextual-tour-overlay'")
    expect(source).not.toContain("from './components/setup-guide/setup-guide-telemetry-observer'")
    expect(source).toContain('const shouldMountSetupGuideTelemetryObserver = persistedUIReady')
    expect(source).not.toContain(
      "const shouldMountSetupGuideTelemetryObserver = persistedUIReady && activeModal === 'setup-guide'"
    )
  })

  it('keeps crash-report listeners eager while lazy-loading the dialog surface', () => {
    const appSource = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )
    const hostSource = readFileSync(
      join(process.cwd(), 'src/renderer/src/components/crash-report/crash-report-dialog.tsx'),
      'utf8'
    )

    expect(appSource).toContain(
      "import { CrashReportDialog } from './components/crash-report/crash-report-dialog'"
    )
    expect(appSource).not.toContain("from './components/crash-report/crash-report-dialog-surface'")
    expect(hostSource).toContain("import('./crash-report-dialog-surface').then")
    expect(hostSource).toContain('window.api.crashReports.getLatestPending()')
    expect(hostSource).toContain('window.api.ui.onOpenCrashReport')
    expect(hostSource).toContain('REACT_ERROR_BOUNDARY_REPORT_AVAILABLE_EVENT')
    expect(hostSource).toContain('if (!open) {')
    expect(hostSource).not.toContain('if (!open && !loading)')
  })

  it('clears stale crash-report state before opening the lazy manual report surface', () => {
    const hostSource = readFileSync(
      join(process.cwd(), 'src/renderer/src/components/crash-report/crash-report-dialog.tsx'),
      'utf8'
    )
    const manualOpenStart = hostSource.indexOf('return window.api.ui.onOpenCrashReport(() => {')
    const manualOpenEnd = hostSource.indexOf('  }, [loadCrashReport])', manualOpenStart)
    const manualOpenBlock = hostSource.slice(manualOpenStart, manualOpenEnd)

    expect(manualOpenBlock.indexOf('setReport(null)')).toBeGreaterThanOrEqual(0)
    expect(manualOpenBlock.indexOf('setReport(null)')).toBeLessThan(
      manualOpenBlock.indexOf('setOpen(true)')
    )
    expect(manualOpenBlock.indexOf('setReport(null)')).toBeLessThan(
      manualOpenBlock.indexOf('loadCrashReport(false)')
    )
  })

  it('loads dictation only when voice is enabled or a session is active', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )

    expect(source).toContain("import('./components/dictation/dictation-controller').then")
    expect(source).not.toContain("from './components/dictation/dictation-controller'")
    expect(source).toContain("settings?.voice?.enabled === true || dictationState !== 'idle'")
    expect(source).toContain('shouldMountDictationController ?')
  })

  it('loads the SSH passphrase dialog only when a credential request is queued', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )

    expect(source).toContain("import('./components/settings/ssh-passphrase-dialog').then")
    expect(source).not.toContain("from './components/settings/ssh-passphrase-dialog'")
    expect(source).toContain('s.sshCredentialQueue.length > 0')
    expect(source).toContain('hasSshCredentialRequest ?')
  })

  it('defers background polling until the workspace session is ready', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )

    expect(source).toContain('useGitStatusPolling({ enabled: workspaceSessionReady })')
    expect(source).toContain('<WorkspacePortScanner enabled={workspaceSessionReady} />')
  })

  it('does not load the terminal workbench on the no-workspace landing path', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )

    expect(source).toContain(
      "const Terminal = lazy(() => import('./components/terminal-workspace'))"
    )
    expect(source).not.toContain("from './components/terminal-workspace'")
    expect(source).toContain('const hasMountedTerminalWorkbenchRef = useRef(false)')
    expect(source).toContain('hasMountedTerminalWorkbenchRef.current = true')
    expect(source).toContain('activeWorktreeId !== null || backgroundTerminalMountRequested')
    expect(source).toContain('backgroundTerminalMountRequested ||')
    expect(source).toContain('hasMountedTerminalWorkbenchRef.current')
    expect(source).toContain('shouldMountTerminalWorkbench ?')
  })

  it('keeps the new-workspace composer eager because it is a critical create surface', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )
    const lazyModalSource = readFileSync(
      join(process.cwd(), 'src/renderer/src/lazy-modal-mount-state.ts'),
      'utf8'
    )

    expect(source).toContain(
      "import NewWorkspaceComposerModal from './components/new-workspace-composer-modal'"
    )
    expect(source).not.toContain("import('./components/new-workspace-composer-modal')")
    expect(source).toContain("activeModal === 'new-workspace-composer'")
    expect(lazyModalSource).not.toContain("'new-workspace-composer'")
  })

  it('does not eagerly import inactive sidebar dialog flows on startup', () => {
    const appSource = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )
    const sidebarSource = readFileSync(
      join(process.cwd(), 'src/renderer/src/components/sidebar/index.tsx'),
      'utf8'
    )

    expect(appSource).toContain("lazy(() => import('./components/sidebar/add-repo-dialog'))")
    expect(appSource).toContain("lazy(() => import('./components/sidebar/non-git-folder-dialog'))")
    expect(appSource).toContain("import('./components/sidebar/add-project-from-folder-dialog')")
    expect(appSource).toContain("lazy(() => import('./components/sidebar/project-added-dialog'))")
    expect(appSource).toContain("activeModal === 'add-repo'")
    expect(appSource).toContain("activeModal === 'confirm-non-git-folder'")
    expect(appSource).toContain("activeModal === 'confirm-add-project-from-folder'")
    expect(appSource).toContain("activeModal === 'project-added'")
    expect(appSource).toContain('shouldMountAddRepoDialog ? (')
    expect(appSource).toContain('boundaryId="modal.add-repo"')
    expect(appSource).toContain('boundaryId="modal.confirm-non-git-folder"')
    expect(appSource).toContain('boundaryId="modal.confirm-add-project-from-folder"')
    expect(appSource).toContain('boundaryId="modal.project-added"')
    expect(appSource).toContain('setTimeout(() =>')
    expect(sidebarSource).toContain("lazyWithRetry(() => import('./worktree-meta-dialog'))")
    expect(sidebarSource).not.toContain("from './add-repo-dialog'")
    expect(sidebarSource).not.toContain("React.lazy(() => import('./add-repo-dialog'))")
    expect(sidebarSource).not.toContain("React.lazy(() => import('./non-git-folder-dialog'))")
    expect(sidebarSource).not.toContain(
      "React.lazy(() => import('./add-project-from-folder-dialog'))"
    )
    expect(sidebarSource).not.toContain("React.lazy(() => import('./project-added-dialog'))")
    expect(sidebarSource).not.toContain('shouldMountAddRepoDialog ? <AddRepoDialog /> : null')
    expect(sidebarSource).not.toContain(
      "activeModal === 'confirm-non-git-folder' ? <NonGitFolderDialog /> : null"
    )
    expect(sidebarSource).not.toContain(
      "activeModal === 'confirm-add-project-from-folder' ? <AddProjectFromFolderDialog /> : null"
    )
    expect(sidebarSource).not.toContain(
      "activeModal === 'project-added' ? <ProjectAddedDialog /> : null"
    )
    expect(sidebarSource).toContain("activeModal === 'edit-meta' ? <WorktreeMetaDialog /> : null")
    expect(sidebarSource).toContain(
      "activeModal === 'confirm-remove-folder' ? <RemoveFolderDialog /> : null"
    )
  })

  it('does not eagerly import optional status-bar segments on startup', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/components/status-bar/status-bar.tsx'),
      'utf8'
    )

    expect(source).toContain("import('./resource-usage-status-segment').then")
    expect(source).toContain("import('./ports-status-segment').then")
    expect(source).toContain("import('./ssh-status-segment').then")
    expect(source).toContain("import('./pet-status-segment').then")
    expect(source).not.toContain("from './resource-usage-status-segment'")
    expect(source).not.toContain("from './ports-status-segment'")
    expect(source).not.toContain("from './ssh-status-segment'")
    expect(source).not.toContain("from './pet-status-segment'")
  })

  it('does not eagerly import the status bar shell on startup', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/application-shell.tsx'),
      'utf8'
    )

    expect(source).toContain("import('./components/status-bar/status-bar').then")
    expect(source).not.toContain("from './components/status-bar/status-bar'")
    expect(source).toContain('statusBarVisible ? (')
  })
})
