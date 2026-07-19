import { toast } from 'sonner'
import type { StateCreator } from 'zustand'

import { translate } from '@/i18n/i18n'

import type {
  ConnectCurrentYiruProfileResult,
  CreateCloudLinkedYiruProfileResult,
  RefreshCurrentYiruProfileAuthResult,
  SelectYiruProfileOrgResult,
  SignOutCurrentYiruProfileResult
} from '../../../../shared/yiru-profiles'
import type { AppState } from '../types'

export type YiruProfilesAuthActions = {
  createCloudLinkedYiruProfile: (args: {
    orgId?: string
    name?: string
  }) => Promise<CreateCloudLinkedYiruProfileResult | null>
  connectCurrentYiruProfile: () => Promise<ConnectCurrentYiruProfileResult | null>
  refreshCurrentYiruProfileAuth: () => Promise<RefreshCurrentYiruProfileAuthResult | null>
  signOutCurrentYiruProfile: () => Promise<SignOutCurrentYiruProfileResult | null>
  selectYiruProfileOrg: (orgId: string) => Promise<SelectYiruProfileOrgResult | null>
}

// Why a separate module: the cloud-auth actions share the profiles slice's
// state keys but form their own cohesive surface (connect/refresh/sign-out/
// org selection), and the combined slice file exceeded the repo line budget.
export const createYiruProfilesAuthActions: StateCreator<
  AppState,
  [],
  [],
  YiruProfilesAuthActions
> = (set, get) => ({
  createCloudLinkedYiruProfile: async (args) => {
    try {
      const result = await window.api.yiruProfiles.createCloudLinked(args)
      set({
        yiruProfileAuthStatus: result.auth,
        ...(result.status === 'created'
          ? {
              activeYiruProfileId: result.activeProfileId,
              yiruProfiles: result.profiles
            }
          : {})
      })
      if (result.status === 'created') {
        toast.success(
          translate('auto.store.slices.yiru.profiles.319d7cf39b', 'Cloud profile created')
        )
      } else if (result.status === 'reconnect-required') {
        toast.error(
          translate('auto.store.slices.yiru.profiles.d6e764e7db', 'Reconnect this profile')
        )
      } else if (result.status === 'failed') {
        toast.error(
          translate('auto.store.slices.yiru.profiles.f0c9e11a6d', 'Failed to create cloud profile'),
          { description: result.error }
        )
      }
      return result
    } catch (err) {
      console.error('Failed to create Yiru cloud profile:', err)
      toast.error(
        translate('auto.store.slices.yiru.profiles.f0c9e11a6d', 'Failed to create cloud profile'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  },

  connectCurrentYiruProfile: async () => {
    if (get().yiruProfileConnecting) {
      return null
    }
    set({ yiruProfileConnecting: true })
    try {
      const result = await window.api.yiruProfiles.connectCurrent()
      set({
        yiruProfileConnecting: false,
        yiruProfileAuthStatus: result.auth,
        ...(result.status === 'connected'
          ? {
              activeYiruProfileId: result.activeProfileId,
              yiruProfiles: result.profiles
            }
          : {})
      })
      if (result.status === 'unconfigured') {
        toast.error(
          translate(
            'auto.store.slices.yiru.profiles.8b8fa73174',
            'Yiru Cloud sign-in is not configured'
          ),
          {
            description: result.auth.setupMessage
          }
        )
      } else if (result.status === 'failed') {
        toast.error(
          translate('auto.store.slices.yiru.profiles.33290e88ed', 'Failed to connect profile'),
          { description: result.error }
        )
      } else if (result.status === 'connected') {
        toast.success(translate('auto.store.slices.yiru.profiles.9fcb07a796', 'Profile connected'))
      }
      return result
    } catch (err) {
      console.error('Failed to connect Yiru profile:', err)
      set({ yiruProfileConnecting: false })
      toast.error(
        translate('auto.store.slices.yiru.profiles.33290e88ed', 'Failed to connect profile'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  },

  refreshCurrentYiruProfileAuth: async () => {
    try {
      const result = await window.api.yiruProfiles.refreshAuth()
      set({
        yiruProfileAuthStatus: result.auth,
        ...(result.status === 'refreshed'
          ? {
              activeYiruProfileId: result.activeProfileId,
              yiruProfiles: result.profiles
            }
          : {})
      })
      if (result.status === 'reconnect-required') {
        toast.error(
          translate('auto.store.slices.yiru.profiles.d6e764e7db', 'Reconnect this profile')
        )
      } else if (result.status === 'failed') {
        toast.error(
          translate('auto.store.slices.yiru.profiles.2f6c78a039', 'Failed to refresh profile auth'),
          { description: result.error }
        )
      }
      return result
    } catch (err) {
      console.error('Failed to refresh Yiru profile auth:', err)
      toast.error(
        translate('auto.store.slices.yiru.profiles.2f6c78a039', 'Failed to refresh profile auth'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  },

  signOutCurrentYiruProfile: async () => {
    try {
      const result = await window.api.yiruProfiles.signOutCurrent()
      set({
        activeYiruProfileId: result.activeProfileId,
        yiruProfiles: result.profiles,
        yiruProfileAuthStatus: result.auth
      })
      toast.success(
        translate('auto.store.slices.yiru.profiles.a37b5e6d37', 'Signed out of profile')
      )
      return result
    } catch (err) {
      console.error('Failed to sign out of Yiru profile:', err)
      toast.error(translate('auto.store.slices.yiru.profiles.83600521e7', 'Failed to sign out'), {
        description: err instanceof Error ? err.message : String(err)
      })
      return null
    }
  },

  selectYiruProfileOrg: async (orgId) => {
    try {
      const result = await window.api.yiruProfiles.selectOrg({ orgId })
      set({
        yiruProfileAuthStatus: result.auth,
        ...(result.status === 'selected'
          ? {
              activeYiruProfileId: result.activeProfileId,
              yiruProfiles: result.profiles
            }
          : {})
      })
      if (result.status === 'reconnect-required') {
        toast.error(
          translate('auto.store.slices.yiru.profiles.d6e764e7db', 'Reconnect this profile')
        )
      } else if (result.status === 'failed') {
        toast.error(
          translate('auto.store.slices.yiru.profiles.76deec8f58', 'Failed to switch organization'),
          { description: result.error }
        )
      }
      return result
    } catch (err) {
      console.error('Failed to switch Yiru profile org:', err)
      toast.error(
        translate('auto.store.slices.yiru.profiles.76deec8f58', 'Failed to switch organization'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  }
})
