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
  refreshYiruCloudCapabilitiesMock,
  refreshYiruCloudSessionMock,
  selectYiruCloudOrgMock,
  YiruCloudRequestErrorMock,
  safeStorageMock
} = vi.hoisted(() => ({
  beginYiruCloudPkceFlowMock: vi.fn(),
  createYiruCloudProfileMock: vi.fn(),
  exchangeYiruCloudAuthCodeMock: vi.fn(),
  refreshYiruCloudCapabilitiesMock: vi.fn(),
  refreshYiruCloudSessionMock: vi.fn(),
  selectYiruCloudOrgMock: vi.fn(),
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
  selectYiruCloudOrg: selectYiruCloudOrgMock
}))

import {
  connectCurrentYiruProfile,
  createCloudLinkedYiruProfile,
  getCurrentYiruProfileAuthStatus,
  refreshCurrentYiruProfileAuth,
  selectCurrentYiruProfileOrg
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

function mockSuccessfulConnect(): void {
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
    expiresAt: futureExpiresAt(),
    cloud: cloudSummary,
    organizations,
    capabilities
  } satisfies YiruCloudSessionExchangeResponse)
}

function mockSuccessfulSessionRefresh(): void {
  refreshYiruCloudSessionMock.mockResolvedValue({
    accessToken: 'rotated-access-token',
    refreshToken: 'rotated-refresh-token',
    expiresAt: futureExpiresAt(),
    cloud: cloudSummary,
    organizations,
    capabilities
  } satisfies YiruCloudSessionExchangeResponse)
}

describe('Yiru cloud profile auth-failure retry', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'yiru-cloud-service-auth-retry-'))
    beginYiruCloudPkceFlowMock.mockReset()
    createYiruCloudProfileMock.mockReset()
    exchangeYiruCloudAuthCodeMock.mockReset()
    refreshYiruCloudCapabilitiesMock.mockReset()
    refreshYiruCloudSessionMock.mockReset()
    selectYiruCloudOrgMock.mockReset()
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

  it('refreshes and retries cloud profile creation after an auth failure', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    mockSuccessfulSessionRefresh()
    await connectCurrentYiruProfile(userDataPath)
    createYiruCloudProfileMock
      .mockRejectedValueOnce(new YiruCloudRequestErrorMock(401))
      .mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: futureExpiresAt(),
        cloud: { ...cloudSummary, cloudProfileId: 'cloud-profile-2' },
        organizations,
        capabilities
      } satisfies YiruCloudSessionExchangeResponse)

    const result = await createCloudLinkedYiruProfile(userDataPath, { name: 'Acme' })

    expect(result.status).toBe('created')
    expect(createYiruCloudProfileMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({ accessToken: 'rotated-access-token' }),
      { name: 'Acme' }
    )
  })

  it('refreshes and retries capability refresh after an auth failure', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    mockSuccessfulSessionRefresh()
    await connectCurrentYiruProfile(userDataPath)
    refreshYiruCloudCapabilitiesMock
      .mockRejectedValueOnce(new YiruCloudRequestErrorMock(403))
      .mockResolvedValue({
        capabilities: { flags: { share: false }, refreshedAt: 26 } satisfies YiruCloudCapabilities
      })

    const result = await refreshCurrentYiruProfileAuth(userDataPath)

    expect(result.status).toBe('refreshed')
    expect(refreshYiruCloudCapabilitiesMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({ accessToken: 'rotated-access-token' })
    )
    expect(getCurrentYiruProfileAuthStatus(userDataPath).capabilities).toEqual({
      flags: { share: false },
      refreshedAt: 26
    })
  })

  it('requires reconnect when a retried capability refresh is still unauthorized', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    mockSuccessfulSessionRefresh()
    await connectCurrentYiruProfile(userDataPath)
    refreshYiruCloudCapabilitiesMock
      .mockRejectedValueOnce(new YiruCloudRequestErrorMock(401))
      .mockRejectedValueOnce(new YiruCloudRequestErrorMock(401))

    const result = await refreshCurrentYiruProfileAuth(userDataPath)

    expect(result.status).toBe('reconnect-required')
    expect(getCurrentYiruProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'reconnect-required',
      persistence: 'none',
      cloud: cloudSummary
    })
  })

  it('refreshes and retries organization selection after an auth failure', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    mockSuccessfulSessionRefresh()
    await connectCurrentYiruProfile(userDataPath)
    selectYiruCloudOrgMock
      .mockRejectedValueOnce(new YiruCloudRequestErrorMock(401))
      .mockResolvedValue({
        cloud: { ...cloudSummary, activeOrgId: 'org-1', activeOrgName: 'Acme' },
        organizations,
        capabilities
      })

    const result = await selectCurrentYiruProfileOrg(userDataPath, 'org-1')

    expect(result.status).toBe('selected')
    expect(selectYiruCloudOrgMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({ accessToken: 'rotated-access-token' }),
      'org-1'
    )
  })
})
