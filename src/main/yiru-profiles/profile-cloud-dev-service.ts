import type {
  CreateCloudLinkedYiruProfileArgs,
  YiruProfileListState
} from '../../shared/yiru-profiles'
import type { ActiveYiruProfileState } from './profile-index-store'
import { createCloudLinkedYiruProfileRecord, linkYiruProfileToCloud } from './profile-cloud-index'
import { readYiruCloudSession, saveYiruCloudSessionExchange } from './profile-cloud-session-store'
import { createDevYiruCloudSession } from './profile-cloud-dev-auth'

type DevProfileListResult = YiruProfileListState

type DevCreateProfileResult =
  | {
      status: 'created'
      list: ReturnType<typeof createCloudLinkedYiruProfileRecord>
    }
  | { status: 'reconnect-required' }

type DevMutationResult =
  | {
      status: 'updated'
      list: DevProfileListResult
    }
  | { status: 'reconnect-required' }

export function connectDevYiruCloudProfile(
  active: ActiveYiruProfileState,
  userDataPath: string
): DevProfileListResult {
  const session = createDevYiruCloudSession({ localProfileId: active.profile.id })
  saveYiruCloudSessionExchange(active.profile.id, userDataPath, session)
  return linkYiruProfileToCloud(active.profile.id, session.cloud, userDataPath)
}

export function createDevCloudLinkedYiruProfile(
  active: ActiveYiruProfileState,
  userDataPath: string,
  args: CreateCloudLinkedYiruProfileArgs
): DevCreateProfileResult {
  if (readYiruCloudSession(active.profile.id, userDataPath).status !== 'found') {
    return { status: 'reconnect-required' }
  }
  const session = createDevYiruCloudSession({ orgId: args.orgId })
  const list = createCloudLinkedYiruProfileRecord(session.cloud, { name: args.name }, userDataPath)
  saveYiruCloudSessionExchange(list.profile.id, userDataPath, session)
  return { status: 'created', list }
}

export function refreshDevYiruCloudProfile(
  active: ActiveYiruProfileState,
  userDataPath: string
): DevMutationResult {
  if (
    !active.profile.cloud ||
    readYiruCloudSession(active.profile.id, userDataPath).status !== 'found'
  ) {
    return { status: 'reconnect-required' }
  }
  const session = createDevYiruCloudSession({
    localProfileId: active.profile.id,
    cloudProfileId: active.profile.cloud.cloudProfileId,
    orgId: active.profile.cloud.activeOrgId
  })
  saveYiruCloudSessionExchange(active.profile.id, userDataPath, session)
  return {
    status: 'updated',
    list: linkYiruProfileToCloud(active.profile.id, session.cloud, userDataPath)
  }
}

export function selectDevYiruCloudOrg(
  active: ActiveYiruProfileState,
  userDataPath: string,
  orgId: string
): DevMutationResult {
  if (
    !active.profile.cloud ||
    readYiruCloudSession(active.profile.id, userDataPath).status !== 'found'
  ) {
    return { status: 'reconnect-required' }
  }
  const session = createDevYiruCloudSession({
    localProfileId: active.profile.id,
    cloudProfileId: active.profile.cloud.cloudProfileId,
    orgId
  })
  saveYiruCloudSessionExchange(active.profile.id, userDataPath, session)
  return {
    status: 'updated',
    list: linkYiruProfileToCloud(active.profile.id, session.cloud, userDataPath)
  }
}
