import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'

const SHELL_SYSTEM_READ_ACCESS = {
  scope: 'host',
  tier: 'read',
  principals: ['local']
} as const
const SHELL_SYSTEM_WRITE_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local']
} as const

export const shellAppContract = {
  getIdentity: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<unknown>()),
  relaunch: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  restart: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  reload: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  awaitFirstWindowStartupServices: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<void>()),
  startupDiagnostic: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<{ event: string; details?: Record<string, unknown> }>())
    .output(type<void>()),
  getKeyboardInputSourceId: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<string | null>()),
  setUnreadDockBadgeCount: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<{ count: number }>())
    .output(type<void>()),
  getFloatingTerminalCwd: withAccess(SHELL_SYSTEM_READ_ACCESS)
    .input(type<unknown>())
    .output(type<string>()),
  getFloatingMarkdownDirectory: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<string>()),
  pickFloatingMarkdownDocument: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<unknown>()),
  pickFloatingWorkspaceDirectory:
    withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<string | null>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellRepoHostContract = {
  pickFolder: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<string | null>()),
  pickFolders: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<string[]>()),
  pickDirectory: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<string | null>()),
  removeForHost: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<{ repoId: string; hostId: string }>())
    .output(type<void>()),
  reorderForHost: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<{ orderedIds: string[]; hostId: string }>())
    .output(type<{ status: 'applied' | 'rejected' }>()),
  cloneAbort: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  getDefaultCreateProjectParent: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<string>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellRuntimeStateContract = {
  syncWindowGraph: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<unknown>())
    .output(type<unknown>()),
  getTerminalFitOverrides: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<unknown>()),
  getTerminalDrivers: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<unknown>()),
  getBrowserDrivers: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<unknown>()),
  restoreTerminalFit: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<{ ptyId: string }>())
    .output(type<{ restored: boolean }>()),
  reclaimBrowserForDesktop: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<{ browserPageId: string }>())
    .output(type<{ reclaimed: boolean }>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellGitHubContract = {
  viewer: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<unknown>()),
  enqueuePRRefresh: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<unknown>())
    .output(type<unknown>()),
  reportVisiblePRRefreshCandidates: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<unknown>())
    .output(type<boolean>()),
  checkYiruStarred: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<boolean | null>()),
  starYiru: withAccess(SHELL_SYSTEM_WRITE_ACCESS).input(type<unknown>()).output(type<boolean>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellNotificationsContract = {
  displayNative: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<unknown>())
    .output(type<unknown>()),
  dismissNative: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<{ notificationIds: string[] }>())
    .output(type<unknown>()),
  openSystemSettings: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  getPermissionStatus: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<unknown>()),
  probeDelivery: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<unknown>())
    .output(type<unknown>()),
  playSound: withAccess(SHELL_SYSTEM_WRITE_ACCESS).input(type<unknown>()).output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellStarNagContract = {
  dismiss: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  later: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  complete: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  disable: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  openWeb: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  starYiru: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<boolean>()),
  forceShow: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  agentValueMoment: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<unknown>()),
  showAgentValueMoment: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  onboardingCompleted: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellUpdaterContract = {
  getVersion: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<string>()),
  getStatus: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<unknown>()),
  check: withAccess(SHELL_SYSTEM_WRITE_ACCESS).input(type<unknown>()).output(type<void>()),
  download: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  quitAndInstall: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  dismissNudge: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>
