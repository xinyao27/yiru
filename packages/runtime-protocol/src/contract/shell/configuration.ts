import { type, type ContractRouter } from '@orpc/contract'

import type { KeybindingActionId, KeybindingFileSnapshot } from '../../workbench/keybindings.js'
import type {
  CreateLocalYiruProfileArgs,
  CreateLocalYiruProfileResult,
  FindYiruProfileProjectsByPathArgs,
  FindYiruProfileProjectsByPathResult,
  SwitchYiruProfileArgs,
  SwitchYiruProfileResult,
  TransferYiruProfileProjectArgs,
  TransferYiruProfileProjectResult,
  YiruProfileListResult
} from '../../workbench/yiru-profiles.js'
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
  get: withAccess(SHELL_CONFIGURATION_READ_ACCESS).output(type<KeybindingFileSnapshot>()),
  ensureFile: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS).output(type<KeybindingFileSnapshot>()),
  setAction: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS)
    .input(type<{ actionId: KeybindingActionId; bindings: string[] | null }>())
    .output(type<KeybindingFileSnapshot>()),
  reload: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS).output(type<KeybindingFileSnapshot>()),
  openFile: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS).output(type<KeybindingFileSnapshot>()),
  revealFile: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS).output(type<KeybindingFileSnapshot>())
} satisfies ContractRouter<RuntimeProcedureMeta>

// Why: profiles select this installation's userData directory and
// relaunch this binary; they never follow a selected runtime environment.
export const shellYiruProfilesContract = {
  list: withAccess(SHELL_CONFIGURATION_READ_ACCESS).output(type<YiruProfileListResult>()),
  createLocal: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS)
    .input(type<CreateLocalYiruProfileArgs | undefined>())
    .output(type<CreateLocalYiruProfileResult>()),
  switchProfile: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS)
    .input(type<SwitchYiruProfileArgs>())
    .output(type<SwitchYiruProfileResult>()),
  transferProject: withAccess(SHELL_CONFIGURATION_WRITE_ACCESS)
    .input(type<TransferYiruProfileProjectArgs>())
    .output(type<TransferYiruProfileProjectResult>()),
  findProjectProfiles: withAccess(SHELL_CONFIGURATION_READ_ACCESS)
    .input(type<FindYiruProfileProjectsByPathArgs>())
    .output(type<FindYiruProfileProjectsByPathResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
