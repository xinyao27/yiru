import type { RuntimeCapability } from './protocol-version'

export type RuntimeHostPlatformName =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd'

export type RuntimeGraphStatus = 'ready' | 'reloading' | 'unavailable'

export type RuntimeDeviceScope = 'mobile' | 'runtime'

export type RuntimeRemoteUpdateSupport = {
  installMode: 'interactive' | 'supervised-headless-serve' | 'unsupported-headless-serve'
  automatic: boolean
  reason:
    | 'available'
    | 'manual-service-update-required'
    | 'unpackaged-build'
    | 'updater-unavailable'
}

export type RuntimeRemoteControlDiagnostics = {
  state: 'closed' | 'awaiting_ready' | 'awaiting_authenticated' | 'ready' | 'reconnecting'
  pendingRequestCount: number
  subscriptionCount: number
  reconnectAttempt: number
  lastConnectedAt: number | null
  lastClose: { code: number; reason: string } | null
  lastError: string | null
}

export type RuntimeStatusResult = {
  runtimeId: string
  rendererGraphEpoch: number
  graphStatus: RuntimeGraphStatus
  authoritativeWindowId: number | null
  liveTabCount: number
  liveLeafCount: number
  runtimeProtocolVersion?: number
  minCompatibleRuntimeClientVersion?: number
  capabilities?: RuntimeCapability[]
  appVersion?: string
  remoteUpdateSupport?: RuntimeRemoteUpdateSupport
  remoteControl?: RuntimeRemoteControlDiagnostics | null
  hostPlatform?: RuntimeHostPlatformName
  terminalWindowsShell?: string | null
  deviceScope?: RuntimeDeviceScope
  protocolVersion?: number
  minCompatibleMobileVersion?: number
}

export type RuntimeStatusLegacyContract = Readonly<{
  name: 'status.get'
  params: null
  mobile: true
  resultType?: RuntimeStatusResult
}>

// Why: string-based clients remain live during the dual-stack migration, so their
// descriptor and the oRPC procedure share this client-safe protocol source.
export const STATUS_GET_CONTRACT: RuntimeStatusLegacyContract = {
  name: 'status.get',
  params: null,
  mobile: true
}
