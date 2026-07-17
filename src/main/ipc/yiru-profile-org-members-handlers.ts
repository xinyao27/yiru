import { ipcMain } from 'electron'
import type {
  YiruOrgRole,
  YiruProfileOrgInviteRevokeArgs,
  YiruProfileOrgMemberChangeRoleArgs,
  YiruProfileOrgMemberInviteArgs,
  YiruProfileOrgMemberMutationResult,
  YiruProfileOrgMemberRemoveArgs,
  YiruProfileOrgMembersListArgs,
  YiruProfileOrgMembersListResult
} from '../../shared/yiru-profiles'
import { getProfileUserDataPath } from '../yiru-profiles/profile-storage-paths'
import {
  changeYiruProfileOrgMemberRole,
  inviteYiruProfileOrgMember,
  listYiruProfileOrgMembers,
  removeYiruProfileOrgMember,
  revokeYiruProfileOrgInvite
} from '../yiru-profiles/profile-cloud-org-members-service'

function orgMembersScopedArgs(args: unknown): { orgId: string; record: Record<string, unknown> } {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_yiru_profile_org_selection')
  }
  const record = args as Record<string, unknown>
  const orgId = typeof record.orgId === 'string' ? record.orgId.trim() : ''
  if (!orgId) {
    throw new Error('invalid_yiru_profile_org_selection')
  }
  return { orgId, record }
}

function orgRoleFromUnknown(value: unknown): YiruOrgRole {
  if (value === 'owner' || value === 'admin' || value === 'member') {
    return value
  }
  throw new Error('invalid_yiru_org_role')
}

function orgEmailFromUnknown(value: unknown): string {
  const email = typeof value === 'string' ? value.trim() : ''
  if (!email) {
    throw new Error('invalid_yiru_org_member_email')
  }
  return email
}

function orgUserIdFromUnknown(value: unknown): string {
  const userId = typeof value === 'string' ? value.trim() : ''
  if (!userId) {
    throw new Error('invalid_yiru_org_member_user')
  }
  return userId
}

function orgMemberInviteArgsFromUnknown(args: unknown): YiruProfileOrgMemberInviteArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return { orgId, email: orgEmailFromUnknown(record.email), role: orgRoleFromUnknown(record.role) }
}

function orgInviteRevokeArgsFromUnknown(args: unknown): YiruProfileOrgInviteRevokeArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return { orgId, email: orgEmailFromUnknown(record.email) }
}

function orgMemberChangeRoleArgsFromUnknown(args: unknown): YiruProfileOrgMemberChangeRoleArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return {
    orgId,
    userId: orgUserIdFromUnknown(record.userId),
    role: orgRoleFromUnknown(record.role)
  }
}

function orgMemberRemoveArgsFromUnknown(args: unknown): YiruProfileOrgMemberRemoveArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return { orgId, userId: orgUserIdFromUnknown(record.userId) }
}

export function registerYiruProfileOrgMemberHandlers(): void {
  ipcMain.handle(
    'yiruProfiles:orgMembersList',
    async (
      _event,
      rawArgs: YiruProfileOrgMembersListArgs
    ): Promise<YiruProfileOrgMembersListResult> =>
      listYiruProfileOrgMembers(getProfileUserDataPath(), orgMembersScopedArgs(rawArgs).orgId)
  )

  ipcMain.handle(
    'yiruProfiles:orgMemberInvite',
    async (
      _event,
      rawArgs: YiruProfileOrgMemberInviteArgs
    ): Promise<YiruProfileOrgMemberMutationResult> =>
      inviteYiruProfileOrgMember(getProfileUserDataPath(), orgMemberInviteArgsFromUnknown(rawArgs))
  )

  ipcMain.handle(
    'yiruProfiles:orgInviteRevoke',
    async (
      _event,
      rawArgs: YiruProfileOrgInviteRevokeArgs
    ): Promise<YiruProfileOrgMemberMutationResult> =>
      revokeYiruProfileOrgInvite(getProfileUserDataPath(), orgInviteRevokeArgsFromUnknown(rawArgs))
  )

  ipcMain.handle(
    'yiruProfiles:orgMemberChangeRole',
    async (
      _event,
      rawArgs: YiruProfileOrgMemberChangeRoleArgs
    ): Promise<YiruProfileOrgMemberMutationResult> =>
      changeYiruProfileOrgMemberRole(
        getProfileUserDataPath(),
        orgMemberChangeRoleArgsFromUnknown(rawArgs)
      )
  )

  ipcMain.handle(
    'yiruProfiles:orgMemberRemove',
    async (
      _event,
      rawArgs: YiruProfileOrgMemberRemoveArgs
    ): Promise<YiruProfileOrgMemberMutationResult> =>
      removeYiruProfileOrgMember(getProfileUserDataPath(), orgMemberRemoveArgsFromUnknown(rawArgs))
  )
}
