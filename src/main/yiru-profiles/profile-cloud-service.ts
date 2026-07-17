import type {
  ConnectCurrentYiruProfileResult,
  CreateCloudLinkedYiruProfileArgs,
  CreateCloudLinkedYiruProfileResult,
  YiruProfileAuthStatus,
  SelectYiruProfileOrgResult,
  SignOutCurrentYiruProfileResult
} from '../../shared/yiru-profiles'
import { ensureActiveYiruProfile } from './profile-index-store'
import { getYiruCloudAuthConfig, isYiruCloudDevAuthEnabled } from './profile-cloud-auth-config'
import {
  clearYiruCloudSession,
  readYiruCloudSession,
  saveYiruCloudSessionExchange
} from './profile-cloud-session-store'
import { cloudSessionIdentity, tombstoneCloudSession } from './profile-cloud-session-mutation'
import {
  createYiruCloudProfile,
  exchangeYiruCloudAuthCode,
  revokeYiruCloudSession
} from './profile-cloud-client'
import { beginYiruCloudPkceFlow } from './profile-cloud-pkce'
import {
  createCloudLinkedYiruProfileRecord,
  linkYiruProfileToCloud,
  unlinkYiruProfileFromCloud
} from './profile-cloud-index'
import { runWithFreshYiruCloudSession } from './profile-cloud-session-refresh'
import {
  connectDevYiruCloudProfile,
  createDevCloudLinkedYiruProfile,
  selectDevYiruCloudOrg
} from './profile-cloud-dev-service'
import { getYiruProfileAuthStatusFromProfile } from './profile-cloud-auth-status'
import { selectCloudOrgWithMutationFence } from './profile-cloud-org-selection'

export { refreshCurrentYiruProfileAuth } from './profile-cloud-capability-refresh'

function isUserCancelledAuthError(message: string): boolean {
  return message === 'yiru_cloud_auth_timeout' || message === 'yiru_cloud_auth_denied'
}

function activeAuth(
  active: ReturnType<typeof ensureActiveYiruProfile>,
  userDataPath: string
): YiruProfileAuthStatus {
  return getYiruProfileAuthStatusFromProfile(active, userDataPath)
}

export function getCurrentYiruProfileAuthStatus(userDataPath: string): YiruProfileAuthStatus {
  return getYiruProfileAuthStatusFromProfile(ensureActiveYiruProfile(userDataPath), userDataPath)
}

export async function connectCurrentYiruProfile(
  userDataPath: string
): Promise<ConnectCurrentYiruProfileResult> {
  const active = ensureActiveYiruProfile(userDataPath)
  if (isYiruCloudDevAuthEnabled()) {
    const list = connectDevYiruCloudProfile(active, userDataPath)
    return {
      status: 'connected',
      auth: getCurrentYiruProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  }

  const configState = getYiruCloudAuthConfig()
  if (!configState.configured) {
    return {
      status: 'unconfigured',
      auth: activeAuth(active, userDataPath)
    }
  }

  try {
    const code = await beginYiruCloudPkceFlow(configState.config, active.profile.id)
    const exchange = await exchangeYiruCloudAuthCode(configState.config, {
      ...code,
      localProfileId: active.profile.id
    })
    saveYiruCloudSessionExchange(active.profile.id, userDataPath, exchange)
    const list = linkYiruProfileToCloud(active.profile.id, exchange.cloud, userDataPath)
    return {
      status: 'connected',
      auth: getCurrentYiruProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isUserCancelledAuthError(message)) {
      return {
        status: 'cancelled',
        auth: getCurrentYiruProfileAuthStatus(userDataPath)
      }
    }
    return {
      status: 'failed',
      auth: getCurrentYiruProfileAuthStatus(userDataPath),
      error: message
    }
  }
}

export async function signOutCurrentYiruProfile(
  userDataPath: string
): Promise<SignOutCurrentYiruProfileResult> {
  const active = ensureActiveYiruProfile(userDataPath)
  const configState = getYiruCloudAuthConfig()
  const session = readYiruCloudSession(active.profile.id, userDataPath)
  if (active.profile.cloud) {
    // Why: persist the destructive fence before logout network I/O so a
    // refresh already in flight cannot save after explicit sign-out.
    tombstoneCloudSession(
      cloudSessionIdentity(active.profile.id, active.profile.cloud),
      userDataPath
    )
  }
  if (!isYiruCloudDevAuthEnabled() && configState.configured && session.status === 'found') {
    await revokeYiruCloudSession(configState.config, session.session).catch(() => undefined)
  }
  clearYiruCloudSession(active.profile.id, userDataPath)
  const list = unlinkYiruProfileFromCloud(active.profile.id, userDataPath)
  return {
    status: 'signed-out',
    auth: getCurrentYiruProfileAuthStatus(userDataPath),
    activeProfileId: list.activeProfileId,
    profiles: list.profiles
  }
}

export async function createCloudLinkedYiruProfile(
  userDataPath: string,
  args: CreateCloudLinkedYiruProfileArgs
): Promise<CreateCloudLinkedYiruProfileResult> {
  const active = ensureActiveYiruProfile(userDataPath)
  if (isYiruCloudDevAuthEnabled()) {
    const result = createDevCloudLinkedYiruProfile(active, userDataPath, args)
    if (result.status !== 'created') {
      return { status: 'reconnect-required', auth: activeAuth(active, userDataPath) }
    }
    return {
      status: 'created',
      auth: getCurrentYiruProfileAuthStatus(userDataPath),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles,
      profile: result.list.profile
    }
  }

  const configState = getYiruCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured', auth: activeAuth(active, userDataPath) }
  }
  try {
    const operation = await runWithFreshYiruCloudSession(
      configState.config,
      active,
      userDataPath,
      (session) => createYiruCloudProfile(configState.config, session, args)
    )
    if (operation.status !== 'ok') {
      return { status: 'reconnect-required', auth: activeAuth(active, userDataPath) }
    }
    const created = operation.value
    const list = createCloudLinkedYiruProfileRecord(
      created.cloud,
      { name: args.name },
      userDataPath
    )
    saveYiruCloudSessionExchange(list.profile.id, userDataPath, created)
    return {
      status: 'created',
      auth: getCurrentYiruProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles,
      profile: list.profile
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: getCurrentYiruProfileAuthStatus(userDataPath),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function selectCurrentYiruProfileOrg(
  userDataPath: string,
  orgId: string
): Promise<SelectYiruProfileOrgResult> {
  const active = ensureActiveYiruProfile(userDataPath)
  if (isYiruCloudDevAuthEnabled()) {
    const result = selectDevYiruCloudOrg(active, userDataPath, orgId)
    if (result.status !== 'updated') {
      return { status: 'reconnect-required', auth: activeAuth(active, userDataPath) }
    }
    return {
      status: 'selected',
      auth: getCurrentYiruProfileAuthStatus(userDataPath),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles
    }
  }

  const configState = getYiruCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured', auth: activeAuth(active, userDataPath) }
  }
  try {
    const list = await selectCloudOrgWithMutationFence({
      config: configState.config,
      active,
      userDataPath,
      orgId
    })
    if (!list) {
      return { status: 'reconnect-required', auth: activeAuth(active, userDataPath) }
    }
    return {
      status: 'selected',
      auth: getCurrentYiruProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: getCurrentYiruProfileAuthStatus(userDataPath),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
