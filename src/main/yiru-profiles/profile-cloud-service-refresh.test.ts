import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
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
  refreshYiruCloudCapabilitiesMock,
  refreshYiruCloudSessionMock,
  YiruCloudRequestErrorMock,
  safeStorageMock
} = vi.hoisted(() => ({
  beginYiruCloudPkceFlowMock: vi.fn(),
  createYiruCloudProfileMock: vi.fn(),
  exchangeYiruCloudAuthCodeMock: vi.fn(),
  refreshYiruCloudCapabilitiesMock: vi.fn(),
  refreshYiruCloudSessionMock: vi.fn(),
  YiruCloudRequestErrorMock: class YiruCloudRequestError extends Error {
    constructor(public readonly statusCode: number) {
      super(`yiru_cloud_request_failed_${statusCode}`)
      this.name = 'YiruCloudRequestError'
    }
  },
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
  YiruCloudRequestError: YiruCloudRequestErrorMock,
  createYiruCloudProfile: createYiruCloudProfileMock,
  exchangeYiruCloudAuthCode: exchangeYiruCloudAuthCodeMock,
  refreshYiruCloudCapabilities: refreshYiruCloudCapabilitiesMock,
  refreshYiruCloudSession: refreshYiruCloudSessionMock,
  revokeYiruCloudSession: vi.fn(),
  selectYiruCloudOrg: vi.fn()
}))

import {
  connectCurrentYiruProfile,
  createCloudLinkedYiruProfile,
  getCurrentYiruProfileAuthStatus,
  refreshCurrentYiruProfileAuth
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

function futureExpiresAt(): number {
  return Date.now() + 3_600_000
}

function configureCloudEnv(): void {
  vi.stubEnv('YIRU_CLOUD_API_URL', 'https://yiru-cloud.example')
  vi.stubEnv('YIRU_CLOUD_CLIENT_ID', 'desktop-client')
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

describe('Yiru cloud profile service session refresh', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'yiru-cloud-service-refresh-'))
    beginYiruCloudPkceFlowMock.mockReset()
    createYiruCloudProfileMock.mockReset()
    exchangeYiruCloudAuthCodeMock.mockReset()
    refreshYiruCloudCapabilitiesMock.mockReset()
    refreshYiruCloudSessionMock.mockReset()
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf-8'))
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf-8'))
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    vi.unstubAllEnvs()
    vi.stubEnv('YIRU_CLOUD_API_URL', '')
    vi.stubEnv('YIRU_CLOUD_CLIENT_ID', '')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('refreshes an expired access token before creating cloud profiles', async () => {
    configureCloudEnv()
    mockSuccessfulConnect(Date.now() - 1_000)
    await connectCurrentYiruProfile(userDataPath)
    refreshYiruCloudSessionMock.mockResolvedValue({
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      expiresAt: futureExpiresAt(),
      cloud: cloudSummary,
      organizations,
      capabilities
    } satisfies YiruCloudSessionExchangeResponse)
    createYiruCloudProfileMock.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: futureExpiresAt(),
      cloud: {
        ...cloudSummary,
        cloudProfileId: 'cloud-profile-2',
        activeOrgId: 'org-1',
        activeOrgName: 'Acme'
      },
      organizations,
      capabilities
    } satisfies YiruCloudSessionExchangeResponse)

    const result = await createCloudLinkedYiruProfile(userDataPath, {
      orgId: 'org-1',
      name: 'Acme'
    })

    expect(result.status).toBe('created')
    expect(refreshYiruCloudSessionMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ refreshToken: 'refresh-token' })
    )
    expect(createYiruCloudProfileMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ accessToken: 'rotated-access-token' }),
      { orgId: 'org-1', name: 'Acme' }
    )
  })

  it('refreshes capability flags for the connected profile', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    await connectCurrentYiruProfile(userDataPath)
    refreshYiruCloudCapabilitiesMock.mockResolvedValue({
      capabilities: {
        flags: { share: false, team: true },
        refreshedAt: 25
      }
    })

    const result = await refreshCurrentYiruProfileAuth(userDataPath)

    expect(result.status).toBe('refreshed')
    expect(refreshYiruCloudCapabilitiesMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ accessToken: 'access-token' })
    )
    expect(getCurrentYiruProfileAuthStatus(userDataPath).capabilities).toEqual({
      flags: { share: false, team: true },
      refreshedAt: 25
    })
  })

  it('clears stale active org metadata when capability refresh returns no active org', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    exchangeYiruCloudAuthCodeMock.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: futureExpiresAt(),
      cloud: { ...cloudSummary, activeOrgId: 'org-1', activeOrgName: 'Acme' },
      organizations,
      capabilities
    } satisfies YiruCloudSessionExchangeResponse)
    await connectCurrentYiruProfile(userDataPath)
    refreshYiruCloudCapabilitiesMock.mockResolvedValue({
      cloud: cloudSummary,
      organizations: [],
      capabilities: {
        flags: { share: false },
        refreshedAt: 31
      }
    })

    const result = await refreshCurrentYiruProfileAuth(userDataPath)
    const status = getCurrentYiruProfileAuthStatus(userDataPath)

    expect(result.status).toBe('refreshed')
    expect(status.cloud?.activeOrgId).toBeUndefined()
    expect(status.cloud?.activeOrgName).toBeUndefined()
    expect(status.organizations).toEqual([])
    expect(status.capabilities).toEqual({
      flags: { share: false },
      refreshedAt: 31
    })
  })

  it('requires reconnect when an expired refresh token is rejected', async () => {
    configureCloudEnv()
    mockSuccessfulConnect(Date.now() - 1_000)
    await connectCurrentYiruProfile(userDataPath)
    refreshYiruCloudSessionMock.mockRejectedValue(new YiruCloudRequestErrorMock(401))

    const result = await refreshCurrentYiruProfileAuth(userDataPath)

    expect(result.status).toBe('reconnect-required')
    expect(getCurrentYiruProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'reconnect-required',
      persistence: 'none',
      cloud: cloudSummary
    })
  })
})
