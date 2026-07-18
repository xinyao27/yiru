import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const {
  beginYiruCloudPkceFlowMock,
  exchangeYiruCloudAuthCodeMock,
  revokeYiruCloudSessionMock,
  safeStorageMock
} = vi.hoisted(() => ({
  beginYiruCloudPkceFlowMock: vi.fn(),
  exchangeYiruCloudAuthCodeMock: vi.fn(),
  revokeYiruCloudSessionMock: vi.fn(),
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
  createYiruCloudProfile: vi.fn(),
  exchangeYiruCloudAuthCode: exchangeYiruCloudAuthCodeMock,
  refreshYiruCloudCapabilities: vi.fn(),
  refreshYiruCloudSession: vi.fn(),
  revokeYiruCloudSession: revokeYiruCloudSessionMock,
  selectYiruCloudOrg: vi.fn()
}))

import {
  connectCurrentYiruProfile,
  createCloudLinkedYiruProfile,
  getCurrentYiruProfileAuthStatus,
  selectCurrentYiruProfileOrg,
  signOutCurrentYiruProfile
} from './profile-cloud-service'

describe('Yiru cloud dev auth service', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'yiru-cloud-dev-auth-'))
    beginYiruCloudPkceFlowMock.mockReset()
    exchangeYiruCloudAuthCodeMock.mockReset()
    revokeYiruCloudSessionMock.mockReset()
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf-8'))
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf-8'))
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    vi.unstubAllEnvs()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('YIRU_CLOUD_DEV_AUTH', '1')
    vi.stubEnv('YIRU_CLOUD_API_URL', '')
    vi.stubEnv('YIRU_CLOUD_CLIENT_ID', '')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('connects the active profile without PKCE or cloud endpoints', async () => {
    expect(getCurrentYiruProfileAuthStatus(userDataPath)).toMatchObject({
      configured: true,
      state: 'local'
    })

    const result = await connectCurrentYiruProfile(userDataPath)

    expect(result.status).toBe('connected')
    expect(beginYiruCloudPkceFlowMock).not.toHaveBeenCalled()
    expect(exchangeYiruCloudAuthCodeMock).not.toHaveBeenCalled()
    expect(getCurrentYiruProfileAuthStatus(userDataPath)).toMatchObject({
      configured: true,
      state: 'connected',
      persistence: 'encrypted',
      cloud: {
        cloudProfileId: 'dev-cloud-local-default',
        email: 'dev@yiru.local'
      },
      capabilities: {
        flags: expect.objectContaining({ 'share.create': true })
      }
    })
    expect(getCurrentYiruProfileAuthStatus(userDataPath).organizations).toHaveLength(2)
  })

  it('selects dev organizations and creates org-scoped cloud profiles locally', async () => {
    await connectCurrentYiruProfile(userDataPath)

    const selected = await selectCurrentYiruProfileOrg(userDataPath, 'dev-acme')
    const created = await createCloudLinkedYiruProfile(userDataPath, {
      orgId: 'dev-acme',
      name: 'Acme Dev'
    })

    expect(selected.status).toBe('selected')
    expect(getCurrentYiruProfileAuthStatus(userDataPath).cloud).toMatchObject({
      activeOrgId: 'dev-acme',
      activeOrgName: 'Acme Dev'
    })
    expect(created.status).toBe('created')
    if (created.status === 'created') {
      expect(created.profile).toMatchObject({
        name: 'Acme Dev',
        kind: 'cloud-linked',
        cloud: expect.objectContaining({
          activeOrgId: 'dev-acme',
          activeOrgName: 'Acme Dev'
        })
      })
    }
  })

  it('signs out locally without calling the cloud logout endpoint', async () => {
    await connectCurrentYiruProfile(userDataPath)

    const result = await signOutCurrentYiruProfile(userDataPath)

    expect(result.status).toBe('signed-out')
    expect(revokeYiruCloudSessionMock).not.toHaveBeenCalled()
    expect(getCurrentYiruProfileAuthStatus(userDataPath)).toMatchObject({
      configured: true,
      state: 'local',
      persistence: 'none'
    })
  })
})
