import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  YiruCloudCapabilities,
  YiruCloudOrgSummary,
  YiruProfileCloudSummary
} from '../../shared/yiru-profiles'
import type { YiruCloudSessionExchangeResponse } from './profile-cloud-session-exchange'

const {
  beginYiruCloudPkceFlowMock,
  createYiruCloudProfileMock,
  exchangeYiruCloudAuthCodeMock,
  revokeYiruCloudSessionMock,
  selectYiruCloudOrgMock,
  safeStorageMock
} = vi.hoisted(() => ({
  beginYiruCloudPkceFlowMock: vi.fn(),
  createYiruCloudProfileMock: vi.fn(),
  exchangeYiruCloudAuthCodeMock: vi.fn(),
  revokeYiruCloudSessionMock: vi.fn(),
  selectYiruCloudOrgMock: vi.fn(),
  safeStorageMock: {
    decryptString: vi.fn((value: Buffer) => value.toString('utf-8')),
    encryptString: vi.fn((value: string) => Buffer.from(value, 'utf-8')),
    isEncryptionAvailable: vi.fn(() => true)
  }
}))

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataPath
  },
  safeStorage: safeStorageMock
}))

vi.mock('./profile-cloud-pkce', () => ({
  beginYiruCloudPkceFlow: beginYiruCloudPkceFlowMock
}))

vi.mock('./profile-cloud-client', () => ({
  createYiruCloudProfile: createYiruCloudProfileMock,
  exchangeYiruCloudAuthCode: exchangeYiruCloudAuthCodeMock,
  revokeYiruCloudSession: revokeYiruCloudSessionMock,
  selectYiruCloudOrg: selectYiruCloudOrgMock
}))

import {
  connectCurrentYiruProfile,
  createCloudLinkedYiruProfile,
  getCurrentYiruProfileAuthStatus,
  selectCurrentYiruProfileOrg,
  signOutCurrentYiruProfile
} from './profile-cloud-service'

const cloudSummary: YiruProfileCloudSummary = {
  cloudProfileId: 'cloud-profile-1',
  userId: 'user-1',
  email: 'nina@example.com',
  displayName: 'Nina',
  linkedAt: 10
}

const capabilities: YiruCloudCapabilities = {
  flags: { share: true },
  refreshedAt: 11
}

const organizations: YiruCloudOrgSummary[] = [
  { orgId: 'org-1', name: 'Acme', role: 'Admin' },
  { orgId: 'org-2', name: 'Personal' }
]

function configureCloudEnv(): void {
  vi.stubEnv('YIRU_CLOUD_API_URL', 'https://yiru-cloud.example')
  vi.stubEnv('YIRU_CLOUD_CLIENT_ID', 'desktop-client')
}

function futureExpiresAt(): number {
  return Date.now() + 3_600_000
}

function mockSuccessfulConnect(expiresAt = futureExpiresAt()): void {
  beginYiruCloudPkceFlowMock.mockResolvedValue({
    code: 'auth-code',
    codeVerifier: 'code-verifier',
    nonce: 'nonce',
    redirectUri: 'http://127.0.0.1:4100/auth/callback',
    state: 'state'
  })
  exchangeYiruCloudAuthCodeMock.mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt,
    cloud: cloudSummary,
    organizations,
    capabilities
  } satisfies YiruCloudSessionExchangeResponse)
}

describe('Yiru cloud profile service', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'yiru-cloud-service-'))
    beginYiruCloudPkceFlowMock.mockReset()
    createYiruCloudProfileMock.mockReset()
    exchangeYiruCloudAuthCodeMock.mockReset()
    revokeYiruCloudSessionMock.mockReset()
    selectYiruCloudOrgMock.mockReset()
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf-8'))
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf-8'))
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    revokeYiruCloudSessionMock.mockResolvedValue(undefined)
    vi.unstubAllEnvs()
    vi.stubEnv('YIRU_CLOUD_API_URL', '')
    vi.stubEnv('YIRU_CLOUD_CLIENT_ID', '')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('reports local unconfigured auth without cloud setup', () => {
    expect(getCurrentYiruProfileAuthStatus(userDataPath)).toMatchObject({
      activeProfileId: 'local-default',
      configured: false,
      state: 'unconfigured',
      persistence: 'none'
    })
  })

  it('connects the active local profile without replacing its local profile ID', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()

    const result = await connectCurrentYiruProfile(userDataPath)

    if (result.status !== 'connected') {
      throw new Error(`Expected connected result, got ${result.status}`)
    }
    expect(result.activeProfileId).toBe('local-default')
    expect(result.profiles[0]).toMatchObject({
      id: 'local-default',
      kind: 'cloud-linked',
      cloud: cloudSummary
    })
    expect(exchangeYiruCloudAuthCodeMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ localProfileId: 'local-default', nonce: 'nonce' })
    )
    expect(getCurrentYiruProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'connected',
      persistence: 'encrypted',
      cloud: cloudSummary,
      organizations,
      capabilities
    })
  })

  it('treats provider-denied sign-in as a cancelled connect attempt', async () => {
    configureCloudEnv()
    beginYiruCloudPkceFlowMock.mockRejectedValue(new Error('yiru_cloud_auth_denied'))

    const result = await connectCurrentYiruProfile(userDataPath)

    expect(result.status).toBe('cancelled')
    expect(exchangeYiruCloudAuthCodeMock).not.toHaveBeenCalled()
    expect(getCurrentYiruProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'local',
      persistence: 'none'
    })
  })

  it('does not report a saved cloud session as connected when cloud config is unavailable', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    await connectCurrentYiruProfile(userDataPath)
    vi.stubEnv('YIRU_CLOUD_API_URL', '')
    vi.stubEnv('YIRU_CLOUD_CLIENT_ID', '')

    expect(getCurrentYiruProfileAuthStatus(userDataPath)).toMatchObject({
      configured: false,
      state: 'unconfigured',
      persistence: 'encrypted',
      cloud: cloudSummary,
      setupMessage: 'Yiru Cloud sign-in is not configured for this build.'
    })
    expect(getCurrentYiruProfileAuthStatus(userDataPath).organizations).toBeUndefined()
    expect(getCurrentYiruProfileAuthStatus(userDataPath).capabilities).toBeUndefined()
  })

  it('signs out by removing cloud metadata while keeping the local profile', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    await connectCurrentYiruProfile(userDataPath)

    const result = await signOutCurrentYiruProfile(userDataPath)

    expect(result.status).toBe('signed-out')
    expect(result.activeProfileId).toBe('local-default')
    expect(result.profiles[0]).toMatchObject({ id: 'local-default', kind: 'local' })
    expect(result.profiles[0]?.cloud).toBeUndefined()
    expect(getCurrentYiruProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'local',
      persistence: 'none'
    })
    expect(revokeYiruCloudSessionMock).toHaveBeenCalledOnce()
  })

  it('creates a new empty cloud-linked profile with its own cloud session', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    await connectCurrentYiruProfile(userDataPath)
    createYiruCloudProfileMock.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: 1000,
      cloud: {
        ...cloudSummary,
        cloudProfileId: 'cloud-profile-2',
        activeOrgId: 'org-1',
        activeOrgName: 'Acme'
      },
      organizations,
      capabilities: { flags: { share: true, team: true }, refreshedAt: 13 }
    } satisfies YiruCloudSessionExchangeResponse)

    const result = await createCloudLinkedYiruProfile(userDataPath, {
      orgId: 'org-1',
      name: 'Acme'
    })

    if (result.status !== 'created') {
      throw new Error(`Expected created result, got ${result.status}`)
    }
    expect(result.profile).toMatchObject({
      id: expect.stringMatching(/^cloud-/),
      name: 'Acme',
      kind: 'cloud-linked',
      cloud: expect.objectContaining({ cloudProfileId: 'cloud-profile-2' })
    })
    expect(createYiruCloudProfileMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ accessToken: 'access-token' }),
      { orgId: 'org-1', name: 'Acme' }
    )
  })

  it('selects an organization for a connected profile', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    await connectCurrentYiruProfile(userDataPath)
    const orgCloudSummary = {
      ...cloudSummary,
      activeOrgId: 'org-1',
      activeOrgName: 'Acme'
    }
    selectYiruCloudOrgMock.mockResolvedValue({
      cloud: orgCloudSummary,
      organizations,
      capabilities: { flags: { share: true, sso: true }, refreshedAt: 12 }
    })

    const result = await selectCurrentYiruProfileOrg(userDataPath, 'org-1')

    expect(result.status).toBe('selected')
    expect(selectYiruCloudOrgMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ accessToken: 'access-token' }),
      'org-1'
    )
    expect(getCurrentYiruProfileAuthStatus(userDataPath).cloud).toMatchObject({
      activeOrgId: 'org-1',
      activeOrgName: 'Acme'
    })
    expect(getCurrentYiruProfileAuthStatus(userDataPath).organizations).toEqual(organizations)
  })
})
