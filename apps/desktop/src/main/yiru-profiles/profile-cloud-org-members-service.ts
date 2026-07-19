import type {
  YiruProfileOrgInviteRevokeArgs,
  YiruProfileOrgMemberChangeRoleArgs,
  YiruProfileOrgMemberInviteArgs,
  YiruProfileOrgMemberMutationResult,
  YiruProfileOrgMemberRemoveArgs,
  YiruProfileOrgMembersListResult
} from '../../shared/yiru-profiles'
import type { YiruCloudAuthConfig } from './profile-cloud-auth-config'
import { getYiruCloudAuthConfig, isYiruCloudDevAuthEnabled } from './profile-cloud-auth-config'
import { YiruCloudRequestError } from './profile-cloud-client'
import {
  changeDevYiruCloudOrgMemberRole,
  inviteDevYiruCloudOrgMember,
  listDevYiruCloudOrgMembers,
  removeDevYiruCloudOrgMember,
  revokeDevYiruCloudOrgInvite
} from './profile-cloud-dev-org-members'
import {
  changeYiruCloudOrgMemberRole,
  inviteYiruCloudOrgMember,
  listYiruCloudOrgMembers,
  removeYiruCloudOrgMember,
  revokeYiruCloudOrgInvite
} from './profile-cloud-org-members-client'
import { runWithFreshYiruCloudSession } from './profile-cloud-session-refresh'
import type { YiruCloudSession } from './profile-cloud-session-store'
import type { ActiveYiruProfileState } from './profile-index-store'
import { ensureActiveYiruProfile } from './profile-index-store'

type OrgCallResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'reconnect-required' }
  | { status: 'request-error'; error: YiruCloudRequestError }
  | { status: 'failed'; error: string }

// Why: only a 401 means the token itself is stale and should drive a session
// refresh/reconnect. 403/404/409/400 are business or permission outcomes the UI
// must interpret, so they are surfaced as values rather than thrown — otherwise
// runWithFreshYiruCloudSession would treat a 403 as an auth failure and burn a
// pointless token refresh + retry before giving up.
async function runOrgMemberCall<T>(
  config: YiruCloudAuthConfig,
  active: ActiveYiruProfileState,
  userDataPath: string,
  call: (session: YiruCloudSession) => Promise<T>
): Promise<OrgCallResult<T>> {
  try {
    const operation = await runWithFreshYiruCloudSession(
      config,
      active,
      userDataPath,
      async (session) => {
        try {
          return { ok: true as const, value: await call(session) }
        } catch (error) {
          if (error instanceof YiruCloudRequestError && error.statusCode !== 401) {
            return { ok: false as const, error }
          }
          throw error
        }
      }
    )
    if (operation.status !== 'ok') {
      return { status: 'reconnect-required' }
    }
    const outcome = operation.value
    return outcome.ok
      ? { status: 'ok', value: outcome.value }
      : { status: 'request-error', error: outcome.error }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

function mapMutationRequestError(error: YiruCloudRequestError): YiruProfileOrgMemberMutationResult {
  switch (error.statusCode) {
    case 403:
      return { status: 'forbidden' }
    case 404:
      return { status: 'not-found' }
    case 409:
      return {
        status: 'conflict',
        reason: error.errorCode === 'already_member' ? 'already_member' : 'already_invited'
      }
    case 400:
      return {
        status: 'invalid',
        reason:
          error.errorCode === 'cannot_remove_self' ? 'cannot_remove_self' : 'cannot_change_own_role'
      }
    default:
      return { status: 'failed', error: error.message }
  }
}

function mapMutationResult(result: OrgCallResult<void>): YiruProfileOrgMemberMutationResult {
  switch (result.status) {
    case 'ok':
      return { status: 'ok' }
    case 'reconnect-required':
      return { status: 'reconnect-required' }
    case 'request-error':
      return mapMutationRequestError(result.error)
    case 'failed':
      return { status: 'failed', error: result.error }
  }
}

export async function listYiruProfileOrgMembers(
  userDataPath: string,
  orgId: string
): Promise<YiruProfileOrgMembersListResult> {
  const active = ensureActiveYiruProfile(userDataPath)
  if (isYiruCloudDevAuthEnabled()) {
    return { status: 'ok', roster: listDevYiruCloudOrgMembers(orgId) }
  }
  const configState = getYiruCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  const result = await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
    listYiruCloudOrgMembers(configState.config, session, orgId)
  )
  switch (result.status) {
    case 'ok':
      return { status: 'ok', roster: result.value }
    case 'reconnect-required':
      return { status: 'reconnect-required' }
    case 'request-error':
      return { status: 'failed', error: result.error.message }
    case 'failed':
      return { status: 'failed', error: result.error }
  }
}

export async function inviteYiruProfileOrgMember(
  userDataPath: string,
  args: YiruProfileOrgMemberInviteArgs
): Promise<YiruProfileOrgMemberMutationResult> {
  const active = ensureActiveYiruProfile(userDataPath)
  if (isYiruCloudDevAuthEnabled()) {
    return inviteDevYiruCloudOrgMember(args)
  }
  const configState = getYiruCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      inviteYiruCloudOrgMember(configState.config, session, args)
    )
  )
}

export async function revokeYiruProfileOrgInvite(
  userDataPath: string,
  args: YiruProfileOrgInviteRevokeArgs
): Promise<YiruProfileOrgMemberMutationResult> {
  const active = ensureActiveYiruProfile(userDataPath)
  if (isYiruCloudDevAuthEnabled()) {
    return revokeDevYiruCloudOrgInvite(args)
  }
  const configState = getYiruCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      revokeYiruCloudOrgInvite(configState.config, session, args)
    )
  )
}

export async function changeYiruProfileOrgMemberRole(
  userDataPath: string,
  args: YiruProfileOrgMemberChangeRoleArgs
): Promise<YiruProfileOrgMemberMutationResult> {
  const active = ensureActiveYiruProfile(userDataPath)
  if (isYiruCloudDevAuthEnabled()) {
    return changeDevYiruCloudOrgMemberRole(args)
  }
  const configState = getYiruCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      changeYiruCloudOrgMemberRole(configState.config, session, args)
    )
  )
}

export async function removeYiruProfileOrgMember(
  userDataPath: string,
  args: YiruProfileOrgMemberRemoveArgs
): Promise<YiruProfileOrgMemberMutationResult> {
  const active = ensureActiveYiruProfile(userDataPath)
  if (isYiruCloudDevAuthEnabled()) {
    return removeDevYiruCloudOrgMember(args)
  }
  const configState = getYiruCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      removeYiruCloudOrgMember(configState.config, session, args)
    )
  )
}
