import type { YiruCloudAuthConfig } from './profile-cloud-auth-config'
import {
  YiruCloudRequestError,
  refreshYiruCloudSession,
  selectYiruCloudOrg
} from './profile-cloud-client'
import { linkYiruProfileToCloud } from './profile-cloud-index'
import type { ActiveYiruProfileState } from './profile-index-store'
import {
  cloudSessionIdentity,
  recordCloudSessionIdentityMutation,
  recordCloudSessionIdentityMutationIfCurrent
} from './profile-cloud-session-mutation'
import {
  readYiruCloudSession,
  saveYiruCloudSessionIfCurrent,
  type YiruCloudSession
} from './profile-cloud-session-store'

export async function selectCloudOrgWithMutationFence(input: {
  config: YiruCloudAuthConfig
  active: ActiveYiruProfileState
  userDataPath: string
  orgId: string
}): Promise<ReturnType<typeof linkYiruProfileToCloud> | null> {
  const cloud = input.active.profile.cloud
  const stored = readYiruCloudSession(input.active.profile.id, input.userDataPath)
  if (!cloud || stored.status !== 'found') {
    return null
  }
  const oldIdentity = cloudSessionIdentity(input.active.profile.id, cloud)
  const targetIdentity = {
    ...oldIdentity,
    organizationId: input.orgId
  }
  // Why: advance the durable identity fence before the first request. An old
  // refresh may finish, but its compare-and-save can no longer publish.
  const snapshot = recordCloudSessionIdentityMutation(targetIdentity, input.userDataPath)
  let workingSession: YiruCloudSession = stored.session
  try {
    let selected
    try {
      selected = await selectYiruCloudOrg(input.config, workingSession, input.orgId)
    } catch (error) {
      if (!(error instanceof YiruCloudRequestError) || error.statusCode !== 401) {
        throw error
      }
      const refreshed = await refreshYiruCloudSession(input.config, workingSession)
      if (
        refreshed.cloud.userId !== cloud.userId ||
        refreshed.cloud.cloudProfileId !== cloud.cloudProfileId
      ) {
        throw new Error('yiru_cloud_identity_changed_during_org_selection')
      }
      workingSession = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        organizations: refreshed.organizations,
        capabilities: refreshed.capabilities
      }
      selected = await selectYiruCloudOrg(input.config, workingSession, input.orgId)
    }
    if (
      selected.cloud.userId !== cloud.userId ||
      selected.cloud.cloudProfileId !== cloud.cloudProfileId ||
      selected.cloud.activeOrgId !== input.orgId
    ) {
      throw new Error('yiru_cloud_org_selection_identity_mismatch')
    }
    const nextSession: YiruCloudSession = {
      ...workingSession,
      organizations: selected.organizations ?? workingSession.organizations,
      capabilities: selected.capabilities
    }
    if (
      saveYiruCloudSessionIfCurrent(
        input.active.profile.id,
        input.userDataPath,
        nextSession,
        snapshot
      ) === null
    ) {
      throw new Error('stale_cloud_session_mutation')
    }
    const list = linkYiruProfileToCloud(input.active.profile.id, selected.cloud, input.userDataPath)
    return list
  } catch (error) {
    recordCloudSessionIdentityMutationIfCurrent(oldIdentity, input.userDataPath, snapshot)
    throw error
  }
}
