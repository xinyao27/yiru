import { describe, expect, it, vi } from 'vite-plus/test'
import {
  allowsPlaintextYiruCloudSession,
  getYiruCloudAuthConfig,
  isYiruCloudDevAuthEnabled
} from './profile-cloud-auth-config'

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}))

describe('Yiru cloud auth config', () => {
  it('reports unconfigured without both API URL and client ID', () => {
    expect(getYiruCloudAuthConfig({})).toEqual({
      configured: false,
      setupMessage: 'Yiru Cloud sign-in is not configured for this build.'
    })
  })

  it('builds default desktop auth endpoints from the API URL', () => {
    const state = getYiruCloudAuthConfig({
      YIRU_CLOUD_API_URL: 'https://yiru-cloud.example/',
      YIRU_CLOUD_CLIENT_ID: 'desktop-client'
    })

    expect(state).toEqual({
      configured: true,
      config: {
        apiBaseUrl: 'https://yiru-cloud.example',
        authorizeEndpoint: 'https://yiru-cloud.example/v1/desktop/auth/authorize',
        sessionEndpoint: 'https://yiru-cloud.example/v1/desktop/auth/session',
        refreshEndpoint: 'https://yiru-cloud.example/v1/desktop/auth/refresh',
        capabilitiesEndpoint: 'https://yiru-cloud.example/v1/desktop/auth/capabilities',
        profileEndpoint: 'https://yiru-cloud.example/v1/desktop/auth/profile',
        orgEndpoint: 'https://yiru-cloud.example/v1/desktop/auth/org',
        logoutEndpoint: 'https://yiru-cloud.example/v1/desktop/auth/logout',
        relayTokenEndpoint: 'https://yiru-cloud.example/v1/desktop/auth/relay-token',
        relayDirectorUrl: 'https://relay.yiru.ai',
        clientId: 'desktop-client',
        scope: 'openid profile email offline_access'
      }
    })
  })

  it('uses first-party production endpoints without runtime env in packaged builds', () => {
    expect(getYiruCloudAuthConfig({}, true)).toEqual({
      configured: true,
      config: {
        apiBaseUrl: 'https://login.yiru.ai',
        authorizeEndpoint: 'https://login.yiru.ai/v1/desktop/auth/authorize',
        sessionEndpoint: 'https://login.yiru.ai/v1/desktop/auth/session',
        refreshEndpoint: 'https://login.yiru.ai/v1/desktop/auth/refresh',
        capabilitiesEndpoint: 'https://login.yiru.ai/v1/desktop/auth/capabilities',
        profileEndpoint: 'https://login.yiru.ai/v1/desktop/auth/profile',
        orgEndpoint: 'https://login.yiru.ai/v1/desktop/auth/org',
        logoutEndpoint: 'https://login.yiru.ai/v1/desktop/auth/logout',
        relayTokenEndpoint: 'https://login.yiru.ai/v1/desktop/auth/relay-token',
        relayDirectorUrl: 'https://relay.yiru.ai',
        clientId: 'yiru-desktop',
        scope: 'openid profile email offline_access'
      }
    })
  })

  it('allows loopback HTTP endpoints for local desktop auth development', () => {
    const state = getYiruCloudAuthConfig({
      YIRU_CLOUD_API_URL: 'http://localhost:4100',
      YIRU_CLOUD_CLIENT_ID: 'desktop-client'
    })

    expect(state.configured).toBe(true)
  })

  it('rejects loopback HTTP endpoints in packaged builds', () => {
    expect(
      getYiruCloudAuthConfig(
        {
          YIRU_CLOUD_API_URL: 'http://localhost:4100',
          YIRU_CLOUD_CLIENT_ID: 'desktop-client'
        },
        true
      )
    ).toMatchObject({ configured: false })

    const httpsState = getYiruCloudAuthConfig(
      {
        YIRU_CLOUD_API_URL: 'https://yiru-cloud.example',
        YIRU_CLOUD_CLIENT_ID: 'desktop-client'
      },
      true
    )
    expect(httpsState.configured).toBe(true)
  })

  it('rejects non-HTTPS non-loopback API URLs', () => {
    expect(
      getYiruCloudAuthConfig({
        YIRU_CLOUD_API_URL: 'http://yiru-cloud.example',
        YIRU_CLOUD_CLIENT_ID: 'desktop-client'
      })
    ).toMatchObject({ configured: false })
  })

  it('allows dev plaintext sessions only outside production', () => {
    expect(
      allowsPlaintextYiruCloudSession({
        YIRU_CLOUD_ALLOW_PLAINTEXT_SESSION: '1',
        NODE_ENV: 'development'
      })
    ).toBe(true)
    expect(
      allowsPlaintextYiruCloudSession({
        YIRU_CLOUD_ALLOW_PLAINTEXT_SESSION: '1',
        NODE_ENV: 'production'
      })
    ).toBe(false)
  })

  it('ignores dev flags in packaged builds even without NODE_ENV', () => {
    // Why: packaged main bundles never define NODE_ENV, so packaged-ness must
    // gate the escape hatches on its own.
    expect(allowsPlaintextYiruCloudSession({ YIRU_CLOUD_ALLOW_PLAINTEXT_SESSION: '1' }, true)).toBe(
      false
    )
    expect(isYiruCloudDevAuthEnabled({ YIRU_CLOUD_DEV_AUTH: '1' }, true)).toBe(false)
  })

  it('allows local dev auth only outside production', () => {
    expect(
      isYiruCloudDevAuthEnabled({
        YIRU_CLOUD_DEV_AUTH: '1',
        NODE_ENV: 'development'
      })
    ).toBe(true)
    expect(
      isYiruCloudDevAuthEnabled({
        YIRU_CLOUD_DEV_AUTH: '1',
        NODE_ENV: 'production'
      })
    ).toBe(false)
  })
})
