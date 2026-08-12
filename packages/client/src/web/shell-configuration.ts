import {
  createDefaultLocalYiruProfile,
  DEFAULT_LOCAL_YIRU_PROFILE_ID,
  type FindYiruProfileProjectsByPathResult,
  type TransferYiruProfileProjectArgs
} from '~shared/yiru-profiles'

import { createWebKeybindingsApi } from './keybindings'

const webShellYiruProfilesApi = {
  list: () =>
    Promise.resolve({
      activeProfileId: DEFAULT_LOCAL_YIRU_PROFILE_ID,
      profiles: [createDefaultLocalYiruProfile(0)],
      multiProfileUi: false
    }),
  createLocal: () =>
    Promise.resolve({
      activeProfileId: DEFAULT_LOCAL_YIRU_PROFILE_ID,
      profiles: [createDefaultLocalYiruProfile(0)],
      profile: createDefaultLocalYiruProfile(0)
    }),
  switchProfile: () => Promise.resolve({ status: 'already-active' as const }),
  transferProject: (args: TransferYiruProfileProjectArgs) =>
    Promise.resolve({
      status: 'duplicate-target' as const,
      sourceProfileId: args.sourceProfileId,
      targetProfileId: args.targetProfileId,
      sourceRepoId: args.repoId,
      duplicateRepoId: args.repoId
    }),
  findProjectProfiles: async (): Promise<FindYiruProfileProjectsByPathResult> => ({ projects: [] })
}

let webShellKeybindingsApi: ReturnType<typeof createWebKeybindingsApi> | null = null

export function getWebShellConfigurationApis() {
  webShellKeybindingsApi ??= createWebKeybindingsApi()
  return { keybindings: webShellKeybindingsApi, yiruProfiles: webShellYiruProfilesApi }
}
