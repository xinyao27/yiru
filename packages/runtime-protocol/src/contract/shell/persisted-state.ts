import { type, type ContractRouter } from '@orpc/contract'

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

// Why: these documents persist renderer state on the machine rendering the
// window. Their concrete desktop schemas stay opaque at this transport layer.
export const shellSessionContract = {
  get: withAccess(SHELL_STATE_READ_ACCESS)
    .input(type<{ hostId?: string | null } | undefined>())
    .output(type<unknown>()),
  set: withAccess(SHELL_STATE_WRITE_ACCESS)
    .input(type<{ session: unknown; hostId?: string | null }>())
    .output(type<void>()),
  patch: withAccess(SHELL_STATE_WRITE_ACCESS)
    .input(type<{ patch: unknown; hostId?: string | null }>())
    .output(type<void>()),
  flush: withAccess(SHELL_STATE_WRITE_ACCESS).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellOnboardingContract = {
  get: withAccess(SHELL_STATE_READ_ACCESS).output(type<unknown>()),
  update: withAccess(SHELL_STATE_WRITE_ACCESS).input(type<unknown>()).output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellCacheContract = {
  getGitHub: withAccess(SHELL_STATE_READ_ACCESS).output(type<unknown>()),
  setGitHub: withAccess(SHELL_STATE_WRITE_ACCESS).input(type<unknown>()).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>
