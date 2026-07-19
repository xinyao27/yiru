import type { AuthenticatedRpcPrincipal } from '../../../shared/rpc-principal'
import type { E2EEChannel } from './e2ee-channel'
import { isValidMobileE2EEAuthVersion, type MobileE2EEAuth } from './mobile-e2ee-auth-validation'
import type { DesktopMobileE2EEV2Session } from './mobile-e2ee-v2-desktop-session'

export type E2EEAuthenticatedDevice = {
  deviceId: string
  deviceToken: string
  scope: 'mobile' | 'runtime'
}

export type E2EEAuthenticationResult = {
  principal: AuthenticatedRpcPrincipal
  legacyDeviceToken?: string
}

export type E2EEAuthenticationContext = {
  clientPublicKeyB64: string
}

export type E2EEChannelAuthenticationOptions = {
  resolveAuthenticatedDevice?: (token: string) => E2EEAuthenticatedDevice | null
  authenticate?: (
    authFrame: unknown,
    context: E2EEAuthenticationContext
  ) => E2EEAuthenticationResult | null
  onReady:
    | ((channel: E2EEChannel, device: E2EEAuthenticatedDevice) => void)
    | ((channel: E2EEChannel) => void)
}

export type AuthenticatedE2EEIdentity = {
  identity: E2EEAuthenticationResult
  device: E2EEAuthenticatedDevice | null
}

export class E2EEChannelAuthentication {
  private readonly resolveAuthenticatedDevice:
    | ((token: string) => E2EEAuthenticatedDevice | null)
    | undefined
  private readonly authenticatePrincipal:
    | ((authFrame: unknown, context: E2EEAuthenticationContext) => E2EEAuthenticationResult | null)
    | undefined
  private readonly onReadyWithDevice:
    | ((channel: E2EEChannel, device: E2EEAuthenticatedDevice) => void)
    | undefined
  private readonly onReadyWithPrincipal: ((channel: E2EEChannel) => void) | undefined

  constructor(options: E2EEChannelAuthenticationOptions) {
    if (options.authenticate) {
      this.resolveAuthenticatedDevice = undefined
      this.authenticatePrincipal = options.authenticate
      this.onReadyWithDevice = undefined
      this.onReadyWithPrincipal = options.onReady as (channel: E2EEChannel) => void
    } else {
      this.resolveAuthenticatedDevice = options.resolveAuthenticatedDevice
      this.authenticatePrincipal = undefined
      this.onReadyWithDevice = options.onReady as (
        channel: E2EEChannel,
        device: E2EEAuthenticatedDevice
      ) => void
      this.onReadyWithPrincipal = undefined
    }
    if (!this.resolveAuthenticatedDevice && !this.authenticatePrincipal) {
      throw new Error('E2EE channel requires an authenticator')
    }
  }

  authenticate(
    authFrame: unknown,
    context: E2EEAuthenticationContext,
    v2Session: DesktopMobileE2EEV2Session | null
  ): AuthenticatedE2EEIdentity | 'invalid' | null {
    if (this.authenticatePrincipal) {
      const identity = this.authenticatePrincipal(authFrame, context)
      return identity ? { identity, device: null } : null
    }
    const auth = authFrame as MobileE2EEAuth
    if (
      auth.type !== 'e2ee_auth' ||
      !auth.deviceToken ||
      !isValidMobileE2EEAuthVersion(auth, v2Session)
    ) {
      return 'invalid'
    }
    const device = this.resolveAuthenticatedDevice?.(auth.deviceToken)
    if (!device || device.deviceToken !== auth.deviceToken) {
      return null
    }
    return {
      identity: {
        principal: { kind: 'paired-device', deviceId: device.deviceId, scope: device.scope },
        legacyDeviceToken: auth.deviceToken
      },
      device
    }
  }

  notifyReady(channel: E2EEChannel, authentication: AuthenticatedE2EEIdentity): void {
    if (authentication.device) {
      this.onReadyWithDevice?.(channel, authentication.device)
    } else {
      this.onReadyWithPrincipal?.(channel)
    }
  }
}

export function freezeAuthenticatedRpcPrincipal(
  principal: AuthenticatedRpcPrincipal
): AuthenticatedRpcPrincipal {
  if (principal.kind === 'spool') {
    return Object.freeze({ ...principal, tailnet: Object.freeze({ ...principal.tailnet }) })
  }
  return Object.freeze({ ...principal })
}
