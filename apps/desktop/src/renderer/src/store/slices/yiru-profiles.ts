import { toast } from 'sonner'
import type { StateCreator } from 'zustand'

import { translate } from '@/i18n/i18n'

import type {
  YiruProfileAuthStatus,
  YiruProfileSummary,
  SwitchYiruProfileResult,
  TransferYiruProfileProjectArgs,
  TransferYiruProfileProjectResult
} from '../../../../shared/yiru-profiles'
import type { AppState } from '../types'
import {
  createYiruProfilesAuthActions,
  type YiruProfilesAuthActions
} from './yiru-profiles-auth-actions'

export type YiruProfilesSlice = YiruProfilesAuthActions & {
  yiruProfiles: YiruProfileSummary[]
  activeYiruProfileId: string | null
  yiruProfileAuthStatus: YiruProfileAuthStatus | null
  yiruProfilesMultiProfileUi: boolean
  yiruProfilesLoading: boolean
  yiruProfileSwitching: boolean
  yiruProfileConnecting: boolean
  fetchYiruProfiles: () => Promise<void>
  fetchYiruProfileAuthStatus: () => Promise<YiruProfileAuthStatus | null>
  createLocalYiruProfile: (name?: string) => Promise<YiruProfileSummary | null>
  switchYiruProfile: (profileId: string) => Promise<SwitchYiruProfileResult | null>
  transferYiruProfileProject: (
    args: TransferYiruProfileProjectArgs
  ) => Promise<TransferYiruProfileProjectResult | null>
}

export const createYiruProfilesSlice: StateCreator<AppState, [], [], YiruProfilesSlice> = (
  set,
  get,
  api
) => ({
  yiruProfiles: [],
  activeYiruProfileId: null,
  yiruProfileAuthStatus: null,
  yiruProfilesMultiProfileUi: false,
  yiruProfilesLoading: false,
  yiruProfileSwitching: false,
  yiruProfileConnecting: false,

  fetchYiruProfiles: async () => {
    set({ yiruProfilesLoading: true })
    try {
      const [state, authStatus] = await Promise.all([
        window.api.yiruProfiles.list(),
        window.api.yiruProfiles.authStatus()
      ])
      set({
        activeYiruProfileId: state.activeProfileId,
        yiruProfiles: state.profiles,
        yiruProfilesMultiProfileUi: state.multiProfileUi,
        yiruProfileAuthStatus: authStatus,
        yiruProfilesLoading: false
      })
    } catch (err) {
      console.error('Failed to fetch Yiru profiles:', err)
      set({ yiruProfilesLoading: false })
    }
  },

  fetchYiruProfileAuthStatus: async () => {
    try {
      const authStatus = await window.api.yiruProfiles.authStatus()
      set({ yiruProfileAuthStatus: authStatus })
      return authStatus
    } catch (err) {
      console.error('Failed to fetch Yiru profile auth status:', err)
      return null
    }
  },

  createLocalYiruProfile: async (name) => {
    try {
      const state = await window.api.yiruProfiles.createLocal({ name })
      set({
        activeYiruProfileId: state.activeProfileId,
        yiruProfiles: state.profiles
      })
      void get().fetchYiruProfileAuthStatus()
      return state.profile
    } catch (err) {
      console.error('Failed to create Yiru profile:', err)
      toast.error(
        translate('auto.store.slices.yiru.profiles.612f7f6861', 'Failed to create profile'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  },

  ...createYiruProfilesAuthActions(set, get, api),

  switchYiruProfile: async (profileId) => {
    if (!profileId || profileId === get().activeYiruProfileId) {
      return { status: 'already-active' }
    }
    set({ yiruProfileSwitching: true })
    try {
      const result = await window.api.yiruProfiles.switchProfile({ profileId })
      if (result?.status !== 'relaunching') {
        // Why: only a relaunch may keep the switcher locked; a stale
        // "already-active" answer would otherwise disable it forever.
        set({ yiruProfileSwitching: false })
      }
      return result
    } catch (err) {
      console.error('Failed to switch Yiru profile:', err)
      set({ yiruProfileSwitching: false })
      toast.error(
        translate('auto.store.slices.yiru.profiles.7d4bc516ee', 'Failed to switch profile'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  },

  transferYiruProfileProject: async (args) => {
    try {
      const result = await window.api.yiruProfiles.transferProject(args)
      if (result.status === 'duplicate-target') {
        toast.error(
          translate(
            'auto.store.slices.yiru.profiles.f518e89aa5',
            'Project already exists in that profile'
          )
        )
      }
      if (result.status === 'transferred' && result.willRelaunch) {
        set({ yiruProfileSwitching: true })
      }
      return result
    } catch (err) {
      console.error('Failed to transfer Yiru profile project:', err)
      toast.error(
        translate('auto.store.slices.yiru.profiles.f03ae7f27b', 'Failed to transfer project'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  }
})
