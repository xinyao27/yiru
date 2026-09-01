import { type, type ContractRouter } from '@orpc/contract'

import type { ExecutionHostId } from '../../model/workspace.js'
import type {
  OnboardingState,
  PRInfo,
  WorkspaceSessionPatch,
  WorkspaceSessionState
} from '../../workbench/types.js'
import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'

const SHELL_STATE_READ_ACCESS = {
  scope: 'host',
  tier: 'read',
  principals: ['local']
} as const
const SHELL_STATE_WRITE_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local']
} as const

export type ShellGitHubCache = {
  pr: Record<string, { data: PRInfo | null; fetchedAt: number }>
}

export type ShellOnboardingUpdate = Partial<Omit<OnboardingState, 'checklist'>> & {
  checklist?: Partial<OnboardingState['checklist']>
}

// Why: these documents persist UI state on the machine rendering the surface,
// but their pure models belong to runtime-protocol rather than either host.
export const shellSessionContract = {
  get: withAccess(SHELL_STATE_READ_ACCESS)
    .input(type<{ hostId?: ExecutionHostId | null } | undefined>())
    .output(type<WorkspaceSessionState>()),
  set: withAccess(SHELL_STATE_WRITE_ACCESS)
    .input(type<{ session: WorkspaceSessionState; hostId?: ExecutionHostId | null }>())
    .output(type<void>()),
  patch: withAccess(SHELL_STATE_WRITE_ACCESS)
    .input(type<{ patch: WorkspaceSessionPatch; hostId?: ExecutionHostId | null }>())
    .output(type<void>()),
  flush: withAccess(SHELL_STATE_WRITE_ACCESS).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellOnboardingContract = {
  get: withAccess(SHELL_STATE_READ_ACCESS).output(type<OnboardingState>()),
  update: withAccess(SHELL_STATE_WRITE_ACCESS)
    .input(type<ShellOnboardingUpdate>())
    .output(type<OnboardingState>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellCacheContract = {
  getGitHub: withAccess(SHELL_STATE_READ_ACCESS).output(type<ShellGitHubCache>()),
  setGitHub: withAccess(SHELL_STATE_WRITE_ACCESS)
    .input(type<{ cache: ShellGitHubCache }>())
    .output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>
