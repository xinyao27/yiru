import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { YiruOrgMembersRoster } from '../../shared/yiru-profiles'
import { YiruCloudRequestError } from './profile-cloud-client'

const {
  runWithFreshYiruCloudSessionMock,
  listYiruCloudOrgMembersMock,
  inviteYiruCloudOrgMemberMock,
  revokeYiruCloudOrgInviteMock,
  changeYiruCloudOrgMemberRoleMock,
  removeYiruCloudOrgMemberMock
} = vi.hoisted(() => ({
  runWithFreshYiruCloudSessionMock: vi.fn(),
  listYiruCloudOrgMembersMock: vi.fn(),
  inviteYiruCloudOrgMemberMock: vi.fn(),
  revokeYiruCloudOrgInviteMock: vi.fn(),
  changeYiruCloudOrgMemberRoleMock: vi.fn(),
  removeYiruCloudOrgMemberMock: vi.fn()
}))

let userDataPath = ''

vi.mock('electron', () => ({
  app: { getPath: () => userDataPath }
}))

vi.mock('./profile-cloud-session-refresh', () => ({
  runWithFreshYiruCloudSessionMock,
  runWithFreshYiruCloudSession: runWithFreshYiruCloudSessionMock
}))

vi.mock('./profile-cloud-org-members-client', () => ({
  listYiruCloudOrgMembers: listYiruCloudOrgMembersMock,
  inviteYiruCloudOrgMember: inviteYiruCloudOrgMemberMock,
  revokeYiruCloudOrgInvite: revokeYiruCloudOrgInviteMock,
  changeYiruCloudOrgMemberRole: changeYiruCloudOrgMemberRoleMock,
  removeYiruCloudOrgMember: removeYiruCloudOrgMemberMock
}))

import {
  changeYiruProfileOrgMemberRole,
  inviteYiruProfileOrgMember,
  listYiruProfileOrgMembers,
  removeYiruProfileOrgMember,
  revokeYiruProfileOrgInvite
} from './profile-cloud-org-members-service'

const fakeSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: Date.now() + 3_600_000,
  capabilities: { flags: {}, refreshedAt: 1 }
}

// Why: mirror the real contract — invoke the operation with a live session and
// surface its resolved value; business 4xx are returned by the operation as
// values, never thrown, so the session layer never sees them.
function runOperationDirectly(): void {
  runWithFreshYiruCloudSessionMock.mockImplementation(
    async (
      _config: unknown,
      _active: unknown,
      _path: unknown,
      op: (session: unknown) => unknown
    ) => ({
      status: 'ok',
      value: await op(fakeSession)
    })
  )
}

function configureCloudEnv(): void {
  vi.stubEnv('YIRU_CLOUD_API_URL', 'https://yiru-cloud.example')
  vi.stubEnv('YIRU_CLOUD_CLIENT_ID', 'desktop-client')
}

const roster: YiruOrgMembersRoster = {
  members: [{ userId: 'user-1', email: 'nina@example.com', role: 'owner' }],
  pendingInvites: [],
  viewerRole: 'owner',
  canManageMembers: true
}

describe('Yiru cloud org members service (configured)', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'yiru-org-members-'))
    runWithFreshYiruCloudSessionMock.mockReset()
    listYiruCloudOrgMembersMock.mockReset()
    inviteYiruCloudOrgMemberMock.mockReset()
    revokeYiruCloudOrgInviteMock.mockReset()
    changeYiruCloudOrgMemberRoleMock.mockReset()
    removeYiruCloudOrgMemberMock.mockReset()
    vi.unstubAllEnvs()
    vi.stubEnv('YIRU_CLOUD_DEV_AUTH', '')
    vi.stubEnv('YIRU_CLOUD_API_URL', '')
    vi.stubEnv('YIRU_CLOUD_CLIENT_ID', '')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('reports unconfigured when cloud sign-in is not set up', async () => {
    await expect(listYiruProfileOrgMembers(userDataPath, 'org-1')).resolves.toEqual({
      status: 'unconfigured'
    })
    expect(runWithFreshYiruCloudSessionMock).not.toHaveBeenCalled()
  })

  it('returns the roster from the client', async () => {
    configureCloudEnv()
    runOperationDirectly()
    listYiruCloudOrgMembersMock.mockResolvedValue(roster)

    await expect(listYiruProfileOrgMembers(userDataPath, 'org-1')).resolves.toEqual({
      status: 'ok',
      roster
    })
    expect(listYiruCloudOrgMembersMock).toHaveBeenCalledWith(
      expect.any(Object),
      fakeSession,
      'org-1'
    )
  })

  it('maps a 409 already_member invite conflict', async () => {
    configureCloudEnv()
    runOperationDirectly()
    inviteYiruCloudOrgMemberMock.mockRejectedValue(new YiruCloudRequestError(409, 'already_member'))

    await expect(
      inviteYiruProfileOrgMember(userDataPath, { orgId: 'org-1', email: 'a@b.com', role: 'member' })
    ).resolves.toEqual({ status: 'conflict', reason: 'already_member' })
  })

  it('maps a 403 role change to forbidden', async () => {
    configureCloudEnv()
    runOperationDirectly()
    changeYiruCloudOrgMemberRoleMock.mockRejectedValue(new YiruCloudRequestError(403))

    await expect(
      changeYiruProfileOrgMemberRole(userDataPath, {
        orgId: 'org-1',
        userId: 'user-2',
        role: 'admin'
      })
    ).resolves.toEqual({ status: 'forbidden' })
  })

  it('maps a 400 cannot_remove_self to an invalid result', async () => {
    configureCloudEnv()
    runOperationDirectly()
    removeYiruCloudOrgMemberMock.mockRejectedValue(
      new YiruCloudRequestError(400, 'cannot_remove_self')
    )

    await expect(
      removeYiruProfileOrgMember(userDataPath, { orgId: 'org-1', userId: 'user-1' })
    ).resolves.toEqual({ status: 'invalid', reason: 'cannot_remove_self' })
  })

  it('maps a 404 revoke to not-found', async () => {
    configureCloudEnv()
    runOperationDirectly()
    revokeYiruCloudOrgInviteMock.mockRejectedValue(new YiruCloudRequestError(404))

    await expect(
      revokeYiruProfileOrgInvite(userDataPath, { orgId: 'org-1', email: 'gone@b.com' })
    ).resolves.toEqual({ status: 'not-found' })
  })

  it('reports reconnect-required when the session layer cannot refresh', async () => {
    configureCloudEnv()
    runWithFreshYiruCloudSessionMock.mockResolvedValue({ status: 'reconnect-required' })

    await expect(listYiruProfileOrgMembers(userDataPath, 'org-1')).resolves.toEqual({
      status: 'reconnect-required'
    })
  })
})

describe('Yiru cloud org members service (dev auth)', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'yiru-org-members-dev-'))
    runWithFreshYiruCloudSessionMock.mockReset()
    vi.unstubAllEnvs()
    vi.stubEnv('YIRU_CLOUD_DEV_AUTH', '1')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('serves an in-memory roster the caller can manage', async () => {
    const result = await listYiruProfileOrgMembers(userDataPath, 'dev-list-org')
    if (result.status !== 'ok') {
      throw new Error(`Expected ok, got ${result.status}`)
    }
    expect(result.roster.canManageMembers).toBe(true)
    expect(result.roster.viewerRole).toBe('owner')
    expect(result.roster.members[0]).toMatchObject({ role: 'owner' })
    expect(result.roster.members.some((member) => member.userId === null)).toBe(true)
    expect(result.roster.pendingInvites.length).toBeGreaterThan(0)
    expect(runWithFreshYiruCloudSessionMock).not.toHaveBeenCalled()
  })

  it('mutates the dev roster across invite and revoke', async () => {
    const orgId = 'dev-mutate-org'
    await expect(
      inviteYiruProfileOrgMember(userDataPath, {
        orgId,
        email: 'fresh@yiru.local',
        role: 'member'
      })
    ).resolves.toEqual({ status: 'ok' })

    const afterInvite = await listYiruProfileOrgMembers(userDataPath, orgId)
    if (afterInvite.status !== 'ok') {
      throw new Error('expected ok')
    }
    expect(afterInvite.roster.pendingInvites.some((i) => i.email === 'fresh@yiru.local')).toBe(true)

    await expect(
      inviteYiruProfileOrgMember(userDataPath, {
        orgId,
        email: 'fresh@yiru.local',
        role: 'member'
      })
    ).resolves.toEqual({ status: 'conflict', reason: 'already_invited' })

    await expect(
      revokeYiruProfileOrgInvite(userDataPath, { orgId, email: 'fresh@yiru.local' })
    ).resolves.toEqual({ status: 'ok' })
    await expect(
      revokeYiruProfileOrgInvite(userDataPath, { orgId, email: 'fresh@yiru.local' })
    ).resolves.toEqual({ status: 'not-found' })
  })

  it('blocks changing the dev owner (self) role', async () => {
    const orgId = 'dev-self-org'
    const list = await listYiruProfileOrgMembers(userDataPath, orgId)
    if (list.status !== 'ok') {
      throw new Error('expected ok')
    }
    const self = list.roster.members.find((member) => member.role === 'owner')
    await expect(
      changeYiruProfileOrgMemberRole(userDataPath, {
        orgId,
        userId: self?.userId ?? 'dev-user',
        role: 'member'
      })
    ).resolves.toEqual({ status: 'invalid', reason: 'cannot_change_own_role' })
  })
})
