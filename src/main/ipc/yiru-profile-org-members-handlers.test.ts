import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  handlers,
  listYiruProfileOrgMembersMock,
  inviteYiruProfileOrgMemberMock,
  revokeYiruProfileOrgInviteMock,
  changeYiruProfileOrgMemberRoleMock,
  removeYiruProfileOrgMemberMock
} = vi.hoisted(() => ({
  handlers: new Map<string, (_event: unknown, args?: unknown) => unknown>(),
  listYiruProfileOrgMembersMock: vi.fn(),
  inviteYiruProfileOrgMemberMock: vi.fn(),
  revokeYiruProfileOrgInviteMock: vi.fn(),
  changeYiruProfileOrgMemberRoleMock: vi.fn(),
  removeYiruProfileOrgMemberMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    })
  }
}))

vi.mock('../yiru-profiles/profile-storage-paths', () => ({
  getProfileUserDataPath: () => '/tmp/yiru-user-data'
}))

vi.mock('../yiru-profiles/profile-cloud-org-members-service', () => ({
  listYiruProfileOrgMembers: listYiruProfileOrgMembersMock,
  inviteYiruProfileOrgMember: inviteYiruProfileOrgMemberMock,
  revokeYiruProfileOrgInvite: revokeYiruProfileOrgInviteMock,
  changeYiruProfileOrgMemberRole: changeYiruProfileOrgMemberRoleMock,
  removeYiruProfileOrgMember: removeYiruProfileOrgMemberMock
}))

import { registerYiruProfileOrgMemberHandlers } from './yiru-profile-org-members-handlers'

function invoke(channel: string, args?: unknown): unknown {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`No handler for ${channel}`)
  }
  return handler({}, args)
}

describe('registerYiruProfileOrgMemberHandlers', () => {
  beforeEach(() => {
    handlers.clear()
    listYiruProfileOrgMembersMock.mockReset().mockResolvedValue({ status: 'ok', roster: {} })
    inviteYiruProfileOrgMemberMock.mockReset().mockResolvedValue({ status: 'ok' })
    revokeYiruProfileOrgInviteMock.mockReset().mockResolvedValue({ status: 'ok' })
    changeYiruProfileOrgMemberRoleMock.mockReset().mockResolvedValue({ status: 'ok' })
    removeYiruProfileOrgMemberMock.mockReset().mockResolvedValue({ status: 'ok' })
    registerYiruProfileOrgMemberHandlers()
  })

  it('registers all five org-member channels', () => {
    expect([...handlers.keys()].sort()).toEqual(
      [
        'yiruProfiles:orgInviteRevoke',
        'yiruProfiles:orgMemberChangeRole',
        'yiruProfiles:orgMemberInvite',
        'yiruProfiles:orgMemberRemove',
        'yiruProfiles:orgMembersList'
      ].sort()
    )
  })

  it('forwards a valid invite to the service with a trimmed email', async () => {
    await invoke('yiruProfiles:orgMemberInvite', {
      orgId: 'org-1',
      email: '  new@example.com  ',
      role: 'admin'
    })
    expect(inviteYiruProfileOrgMemberMock).toHaveBeenCalledWith('/tmp/yiru-user-data', {
      orgId: 'org-1',
      email: 'new@example.com',
      role: 'admin'
    })
  })

  it('rejects an invite with a missing org id', async () => {
    await expect(
      invoke('yiruProfiles:orgMemberInvite', { email: 'a@b.com', role: 'member' })
    ).rejects.toThrow('invalid_yiru_profile_org_selection')
    expect(inviteYiruProfileOrgMemberMock).not.toHaveBeenCalled()
  })

  it('rejects an invite with an unknown role', async () => {
    await expect(
      invoke('yiruProfiles:orgMemberInvite', { orgId: 'org-1', email: 'a@b.com', role: 'root' })
    ).rejects.toThrow('invalid_yiru_org_role')
  })

  it('rejects a role change with a blank user id', async () => {
    await expect(
      invoke('yiruProfiles:orgMemberChangeRole', { orgId: 'org-1', userId: '  ', role: 'admin' })
    ).rejects.toThrow('invalid_yiru_org_member_user')
  })

  it('forwards remove and revoke with validated args', async () => {
    await invoke('yiruProfiles:orgMemberRemove', { orgId: 'org-1', userId: 'user-2' })
    expect(removeYiruProfileOrgMemberMock).toHaveBeenCalledWith('/tmp/yiru-user-data', {
      orgId: 'org-1',
      userId: 'user-2'
    })
    await invoke('yiruProfiles:orgInviteRevoke', { orgId: 'org-1', email: 'gone@b.com' })
    expect(revokeYiruProfileOrgInviteMock).toHaveBeenCalledWith('/tmp/yiru-user-data', {
      orgId: 'org-1',
      email: 'gone@b.com'
    })
  })
})
