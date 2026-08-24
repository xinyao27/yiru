import type { ShellAppApi } from '~renderer/runtime/shell-system-client'

export const webShellAppApi: ShellAppApi = {
  getIdentity: () =>
    Promise.resolve({
      name: 'Yiru',
      isDev: false,
      devLabel: null,
      devBranch: null,
      devWorktreeName: null,
      devRepoRoot: null,
      dockBadgeLabel: null
    }),
  relaunch: () => Promise.resolve(window.location.reload()),
  restart: () => Promise.resolve(window.location.reload()),
  reload: () => Promise.resolve(window.location.reload()),
  awaitFirstWindowStartupServices: () => Promise.resolve(),
  startupDiagnostic: () => Promise.resolve(),
  getKeyboardInputSourceId: () => Promise.resolve(null),
  setUnreadDockBadgeCount: () => Promise.resolve()
}
