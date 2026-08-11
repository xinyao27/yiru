import type { KeybindingActionId, KeybindingFileSnapshot } from '~shared/keybindings'
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
} from '~shared/yiru-profiles'

import { getWebShellConfigurationApis } from '../web/preload-api'
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

function restoreShellConfiguration<T>(value: unknown): T {
  // Why: these documents use desktop-only shared types that runtime-protocol
  // cannot import; their owning services validate them before transport.
  return value as T
}

const electronShellKeybindingsApi: ShellKeybindingsApi = {
  get: async () =>
    restoreShellConfiguration(
      await callShellOrpc((client) => client.shell.keybindings.get, undefined)
    ),
  ensureFile: async () =>
    restoreShellConfiguration(
      await callShellOrpc((client) => client.shell.keybindings.ensureFile, undefined)
    ),
  setAction: async (args) =>
    restoreShellConfiguration(
      await callShellOrpc((client) => client.shell.keybindings.setAction, args)
    ),
  reload: async () =>
    restoreShellConfiguration(
      await callShellOrpc((client) => client.shell.keybindings.reload, undefined)
    ),
  openFile: async () =>
    restoreShellConfiguration(
      await callShellOrpc((client) => client.shell.keybindings.openFile, undefined)
    ),
  revealFile: async () =>
    restoreShellConfiguration(
      await callShellOrpc((client) => client.shell.keybindings.revealFile, undefined)
    ),
  onChanged: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'keybindingsChanged') {
        callback(restoreShellConfiguration<KeybindingFileSnapshot>(event.snapshot))
      }
    })
}

const electronShellYiruProfilesApi: ShellYiruProfilesApi = {
  list: async () =>
    restoreShellConfiguration(
      await callShellOrpc((client) => client.shell.yiruProfiles.list, undefined)
    ),
  createLocal: async (args) =>
    restoreShellConfiguration(
      await callShellOrpc((client) => client.shell.yiruProfiles.createLocal, args)
    ),
  switchProfile: async (args) =>
    restoreShellConfiguration(
      await callShellOrpc((client) => client.shell.yiruProfiles.switchProfile, args)
    ),
  transferProject: async (args) =>
    restoreShellConfiguration(
      await callShellOrpc((client) => client.shell.yiruProfiles.transferProject, args)
    ),
  findProjectProfiles: async (args) =>
    restoreShellConfiguration(
      await callShellOrpc((client) => client.shell.yiruProfiles.findProjectProfiles, args)
    )
}

const isWebClient = (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ === true
const webApis = isWebClient ? getWebShellConfigurationApis() : null

export const shellKeybindingsApi: ShellKeybindingsApi =
  webApis?.keybindings ?? electronShellKeybindingsApi
export const shellYiruProfilesApi: ShellYiruProfilesApi =
  webApis?.yiruProfiles ?? electronShellYiruProfilesApi
