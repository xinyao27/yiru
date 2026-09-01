import type {
  KeybindingActionId,
  KeybindingFileSnapshot
} from '@yiru/runtime-protocol/workbench/keybindings'
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
} from '@yiru/runtime-protocol/workbench/yiru-profiles'

import { callShellOrpc } from './orpc-client'
import { subscribeShellEvent } from './shell-events-client'

export type ShellKeybindingsApi = {
  get: () => Promise<KeybindingFileSnapshot>
  ensureFile: () => Promise<KeybindingFileSnapshot>
  setAction: (args: {
    actionId: KeybindingActionId
    bindings: string[] | null
  }) => Promise<KeybindingFileSnapshot>
  reload: () => Promise<KeybindingFileSnapshot>
  openFile: () => Promise<KeybindingFileSnapshot>
  revealFile: () => Promise<KeybindingFileSnapshot>
  onChanged: (callback: (snapshot: KeybindingFileSnapshot) => void) => () => void
}

export type ShellYiruProfilesApi = {
  list: () => Promise<YiruProfileListResult>
  createLocal: (args?: CreateLocalYiruProfileArgs) => Promise<CreateLocalYiruProfileResult>
  switchProfile: (args: SwitchYiruProfileArgs) => Promise<SwitchYiruProfileResult>
  transferProject: (
    args: TransferYiruProfileProjectArgs
  ) => Promise<TransferYiruProfileProjectResult>
  findProjectProfiles: (
    args: FindYiruProfileProjectsByPathArgs
  ) => Promise<FindYiruProfileProjectsByPathResult>
}

export const shellKeybindingsApi: ShellKeybindingsApi = {
  get: () => callShellOrpc((client) => client.shell.keybindings.get, undefined),
  ensureFile: () => callShellOrpc((client) => client.shell.keybindings.ensureFile, undefined),
  setAction: (args) => callShellOrpc((client) => client.shell.keybindings.setAction, args),
  reload: () => callShellOrpc((client) => client.shell.keybindings.reload, undefined),
  openFile: () => callShellOrpc((client) => client.shell.keybindings.openFile, undefined),
  revealFile: () => callShellOrpc((client) => client.shell.keybindings.revealFile, undefined),
  onChanged: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'keybindingsChanged') {
        callback(event.snapshot)
      }
    })
}

export const shellYiruProfilesApi: ShellYiruProfilesApi = {
  list: () => callShellOrpc((client) => client.shell.yiruProfiles.list, undefined),
  createLocal: (args) => callShellOrpc((client) => client.shell.yiruProfiles.createLocal, args),
  switchProfile: (args) => callShellOrpc((client) => client.shell.yiruProfiles.switchProfile, args),
  transferProject: (args) =>
    callShellOrpc((client) => client.shell.yiruProfiles.transferProject, args),
  findProjectProfiles: (args) =>
    callShellOrpc((client) => client.shell.yiruProfiles.findProjectProfiles, args)
}
