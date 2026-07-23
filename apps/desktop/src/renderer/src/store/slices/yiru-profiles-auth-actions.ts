import type { StateCreator } from 'zustand'

import { publishRendererCommandResult } from '@/runtime/renderer-command-result-channel'

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
        publishRendererCommandResult({
          type: 'yiru-profile',
          operation: 'create-cloud',
          outcome: 'succeeded'
        })
      } else if (result.status === 'reconnect-required') {
        publishRendererCommandResult({
          type: 'yiru-profile',
          operation: 'create-cloud',
          outcome: 'reconnect-required'
        })
      } else if (result.status === 'failed') {
        publishRendererCommandResult({
          type: 'yiru-profile',
          operation: 'create-cloud',
          outcome: 'failed',
          error: result.error
        })
      }
      return result
    } catch (err) {
      console.error('Failed to create Yiru cloud profile:', err)
      publishRendererCommandResult({
        type: 'yiru-profile',
        operation: 'create-cloud',
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err)
      })
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
        publishRendererCommandResult({
          type: 'yiru-profile',
          operation: 'connect',
          outcome: 'unconfigured',
          error: result.auth.setupMessage
        })
      } else if (result.status === 'failed') {
        publishRendererCommandResult({
          type: 'yiru-profile',
          operation: 'connect',
          outcome: 'failed',
          error: result.error
        })
      } else if (result.status === 'connected') {
        publishRendererCommandResult({
          type: 'yiru-profile',
          operation: 'connect',
          outcome: 'succeeded'
        })
      }
      return result
    } catch (err) {
      console.error('Failed to connect Yiru profile:', err)
      set({ yiruProfileConnecting: false })
      publishRendererCommandResult({
        type: 'yiru-profile',
        operation: 'connect',
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err)
      })
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
        publishRendererCommandResult({
          type: 'yiru-profile',
          operation: 'refresh-auth',
          outcome: 'reconnect-required'
        })
      } else if (result.status === 'failed') {
        publishRendererCommandResult({
          type: 'yiru-profile',
          operation: 'refresh-auth',
          outcome: 'failed',
          error: result.error
        })
      }
      return result
    } catch (err) {
      console.error('Failed to refresh Yiru profile auth:', err)
      publishRendererCommandResult({
        type: 'yiru-profile',
        operation: 'refresh-auth',
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err)
      })
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
      publishRendererCommandResult({
        type: 'yiru-profile',
        operation: 'sign-out',
        outcome: 'succeeded'
      })
      return result
    } catch (err) {
      console.error('Failed to sign out of Yiru profile:', err)
      publishRendererCommandResult({
        type: 'yiru-profile',
        operation: 'sign-out',
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err)
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
        publishRendererCommandResult({
          type: 'yiru-profile',
          operation: 'select-org',
          outcome: 'reconnect-required'
        })
      } else if (result.status === 'failed') {
        publishRendererCommandResult({
          type: 'yiru-profile',
          operation: 'select-org',
          outcome: 'failed',
          error: result.error
        })
      }
      return result
    } catch (err) {
      console.error('Failed to switch Yiru profile org:', err)
      publishRendererCommandResult({
        type: 'yiru-profile',
        operation: 'select-org',
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return null
    }
  }
})
