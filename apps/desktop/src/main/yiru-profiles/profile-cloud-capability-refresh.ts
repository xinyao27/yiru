import type { RefreshCurrentYiruProfileAuthResult } from '../../shared/yiru-profiles'
import { getYiruCloudAuthConfig, isYiruCloudDevAuthEnabled } from './profile-cloud-auth-config'
import { getYiruProfileAuthStatusFromProfile } from './profile-cloud-auth-status'
import { refreshYiruCloudCapabilities } from './profile-cloud-client'
import { refreshDevYiruCloudProfile } from './profile-cloud-dev-service'
import { linkYiruProfileToCloud } from './profile-cloud-index'
import {
  captureCloudSessionMutation,
  cloudSessionIdentity,
  recordCloudSessionIdentityMutationIfCurrent
} from './profile-cloud-session-mutation'
import { runWithFreshYiruCloudSession } from './profile-cloud-session-refresh'
import { readYiruCloudSession, saveYiruCloudSessionIfCurrent } from './profile-cloud-session-store'
import { ensureActiveYiruProfile, getYiruProfileListState } from './profile-index-store'

export async function refreshCurrentYiruProfileAuth(
  userDataPath: string
): Promise<RefreshCurrentYiruProfileAuthResult> {
  const active = ensureActiveYiruProfile(userDataPath)
  const auth = () => getYiruProfileAuthStatusFromProfile(active, userDataPath)
  if (!active.profile.cloud) {
    return { status: 'local', auth: auth() }
  }
  if (isYiruCloudDevAuthEnabled()) {
    const result = refreshDevYiruCloudProfile(active, userDataPath)
    if (result.status !== 'updated') {
      return { status: 'reconnect-required', auth: auth() }
    }
    return {
      status: 'refreshed',
      auth: auth(),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles
    }
  }
  const configState = getYiruCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured', auth: auth() }
  }
  try {
    const identity = cloudSessionIdentity(active.profile.id, active.profile.cloud)
    let mutationSnapshot = captureCloudSessionMutation(identity, userDataPath)
    const operation = await runWithFreshYiruCloudSession(
      configState.config,
      active,
      userDataPath,
      (session) => refreshYiruCloudCapabilities(configState.config, session)
    )
    if (operation.status !== 'ok') {
      return { status: 'reconnect-required', auth: auth() }
    }
    const refresh = operation.value
    if (refresh.cloud) {
      const refreshedIdentity = cloudSessionIdentity(active.profile.id, refresh.cloud)
      if (
        refreshedIdentity.cloudUserId !== identity.cloudUserId ||
        refreshedIdentity.cloudProfileId !== identity.cloudProfileId
      ) {
        throw new Error('yiru_cloud_identity_changed_during_capability_refresh')
      }
      if (refreshedIdentity.organizationId !== identity.organizationId) {
        const advanced = recordCloudSessionIdentityMutationIfCurrent(
          refreshedIdentity,
          userDataPath,
          mutationSnapshot
        )
        if (!advanced) {
          return { status: 'reconnect-required', auth: auth() }
        }
        mutationSnapshot = advanced
      }
    }
    const session = readYiruCloudSession(active.profile.id, userDataPath)
    if (session.status !== 'found') {
      return { status: 'reconnect-required', auth: auth() }
    }
    if (
      saveYiruCloudSessionIfCurrent(
        active.profile.id,
        userDataPath,
        {
          ...session.session,
          organizations: refresh.organizations ?? session.session.organizations,
          capabilities: refresh.capabilities
        },
        mutationSnapshot
      ) === null
    ) {
      return { status: 'reconnect-required', auth: auth() }
    }
    const list = refresh.cloud
      ? linkYiruProfileToCloud(active.profile.id, refresh.cloud, userDataPath)
      : getYiruProfileListState(userDataPath)
    return {
      status: 'refreshed',
      auth: getYiruProfileAuthStatusFromProfile(
        ensureActiveYiruProfile(userDataPath),
        userDataPath
      ),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: auth(),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
