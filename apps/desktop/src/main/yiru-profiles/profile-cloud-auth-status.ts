import type { YiruProfileAuthStatus } from '../../shared/yiru-profiles'
import { getYiruCloudAuthConfig, isYiruCloudDevAuthEnabled } from './profile-cloud-auth-config'
import { readYiruCloudSession } from './profile-cloud-session-store'
import type { ActiveYiruProfileState } from './profile-index-store'

export function getYiruProfileAuthStatusFromProfile(
  active: ActiveYiruProfileState,
  userDataPath: string
): YiruProfileAuthStatus {
  const configState = getYiruCloudAuthConfig()
  const devAuthEnabled = isYiruCloudDevAuthEnabled()
  const configured = configState.configured || devAuthEnabled
  const cloud = active.profile.cloud
  if (!cloud) {
    return {
      activeProfileId: active.profile.id,
      configured,
      state: configured ? 'local' : 'unconfigured',
      persistence: 'none',
      setupMessage: configured ? undefined : configState.setupMessage
    }
  }

  const session = readYiruCloudSession(active.profile.id, userDataPath)
  if (!configured) {
    return {
      activeProfileId: active.profile.id,
      configured: false,
      state: 'unconfigured',
      persistence: session.status === 'found' ? session.persistence : 'none',
      cloud,
      credentialError: session.status === 'decrypt-failed' ? session.error : undefined,
      setupMessage: configState.setupMessage
    }
  }
  if (session.status === 'found') {
    return {
      activeProfileId: active.profile.id,
      configured,
      state: 'connected',
      persistence: session.persistence,
      cloud,
      organizations: session.session.organizations,
      capabilities: session.session.capabilities
    }
  }

  return {
    activeProfileId: active.profile.id,
    configured,
    state: 'reconnect-required',
    persistence: 'none',
    cloud,
    credentialError: session.status === 'decrypt-failed' ? session.error : undefined
  }
}
