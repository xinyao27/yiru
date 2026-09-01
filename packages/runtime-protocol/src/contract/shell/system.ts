import { type, type ContractRouter } from '@orpc/contract'

import type { AppStarSource } from '../../workbench/gh-star-source.js'
import type {
  RuntimeSyncWindowGraph,
  RuntimeSyncWindowGraphResult,
  RuntimeTerminalDriverState
} from '../../workbench/runtime-types.js'
import type {
  GitHubPRRefreshCandidate,
  GitHubPRRefreshEnqueueResult,
  GitHubPRRefreshReason,
  GitHubViewer,
  UpdateCheckOptions,
  UpdateStatus
} from '../../workbench/types.js'
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

export type ShellTerminalFitOverride = {
  ptyId: string
  mode: 'mobile-fit' | 'remote-desktop-fit'
  cols: number
  rows: number
}

export const shellAppContract = {
  restart: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  startupDiagnostic: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<{ event: string; details?: Record<string, unknown> }>())
    .output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellRepoHostContract = {
  pickFolder: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<string | null>()),
  pickFolders: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<string[]>()),
  pickDirectory: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<string | null>()),
  removeForHost: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<{ expectedRevision: number; repoId: string; hostId: string }>())
    .output(type<{ removed: true; revision: number }>()),
  reorderForHost: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<{ expectedRevision: number; orderedIds: string[]; hostId: string }>())
    .output(type<{ revision?: number; status: 'applied' | 'rejected' }>()),
  cloneAbort: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  getDefaultCreateProjectParent: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<string>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellRuntimeStateContract = {
  syncWindowGraph: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<RuntimeSyncWindowGraph>())
    .output(type<RuntimeSyncWindowGraphResult>()),
  getTerminalFitOverrides:
    withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<ShellTerminalFitOverride[]>()),
  getTerminalDrivers:
    withAccess(SHELL_SYSTEM_READ_ACCESS).output(
      type<{ ptyId: string; driver: RuntimeTerminalDriverState }[]>()
    ),
  restoreTerminalFit: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<{ ptyId: string }>())
    .output(type<{ restored: boolean }>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellGitHubContract = {
  viewer: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<GitHubViewer | null>()),
  enqueuePRRefresh: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(
      type<{
        candidate: GitHubPRRefreshCandidate
        reason: GitHubPRRefreshReason
        priority?: number
      }>()
    )
    .output(type<GitHubPRRefreshEnqueueResult | false>()),
  reportVisiblePRRefreshCandidates: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<{ candidates: GitHubPRRefreshCandidate[]; generation: number }>())
    .output(type<boolean>()),
  checkYiruStarred: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<boolean | null>()),
  starYiru: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<AppStarSource>())
    .output(type<boolean>())
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
  agentValueMoment:
    withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(
      type<{ status: 'ready'; mode: 'gh' | 'web' } | { status: 'skipped' }>()
    ),
  showAgentValueMoment: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  onboardingCompleted: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellUpdaterContract = {
  getVersion: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<string>()),
  getStatus: withAccess(SHELL_SYSTEM_READ_ACCESS).output(type<UpdateStatus>()),
  check: withAccess(SHELL_SYSTEM_WRITE_ACCESS)
    .input(type<UpdateCheckOptions | undefined>())
    .output(type<void>()),
  download: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>()),
  quitAndInstall: withAccess(SHELL_SYSTEM_WRITE_ACCESS).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>
