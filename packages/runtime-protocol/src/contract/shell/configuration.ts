import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'

const SHELL_CONFIGURATION_READ_ACCESS = {
  scope: 'host',
  tier: 'read',
  principals: ['local']
} as const
const SHELL_CONFIGURATION_WRITE_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local']
} as const

export const shellKeybindingsContract = {
  get: withAccess(SHELL_CONFIGURATION_READ_ACCESS).output(type<unknown>()),
  ensureFile: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS).output(type<unknown>()),
  setAction: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS)
    .input(type<{ actionId: string; bindings: string[] | null }>())
    .output(type<unknown>()),
  reload: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS).output(type<unknown>()),
  openFile: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS).output(type<unknown>()),
  revealFile: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS).output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>

// Why: profiles select this Electron installation's userData directory and
// relaunch this binary; they never follow a selected runtime environment.
export const shellYiruProfilesContract = {
  list: withAccess(SHELL_CONFIGURATION_READ_ACCESS).output(type<unknown>()),
  createLocal: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS)
    .input(type<unknown>())
    .output(type<unknown>()),
  switchProfile: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS)
    .input(type<unknown>())
    .output(type<unknown>()),
  transferProject: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS)
    .input(type<unknown>())
    .output(type<unknown>()),
  findProjectProfiles: withAccess(SHELL_CONFIGURATION_READ_ACCESS)
    .input(type<unknown>())
    .output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>
