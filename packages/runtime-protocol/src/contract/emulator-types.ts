import type { RuntimeHostPlatformName } from '../status.js'
import type { RuntimeJsonValue } from './json-value.js'

export type RuntimeEmulatorBackendKind = 'ios' | 'android'

export type RuntimeEmulatorStreamCodec = 'mjpeg' | 'h264'

export type RuntimeEmulatorSessionInfo = {
  deviceUdid: string
  wsUrl: string
  streamUrl: string
  axUrl?: string
  helperPid?: number
  streamCodec?: RuntimeEmulatorStreamCodec
  backend?: RuntimeEmulatorBackendKind
}

export type RuntimeEmulatorAttachResult = {
  attached: boolean
  info?: RuntimeEmulatorSessionInfo
}

export type RuntimeEmulatorSimulatorDevice = {
  name: string
  udid: string
  state: string
  runtime: string
  isAvailable?: boolean
}

export type RuntimeEmulatorDevice = {
  backend: RuntimeEmulatorBackendKind
  id: string
  name: string
  state: 'shutdown' | 'booting' | 'booted'
  detail?: string
  isAvailable: boolean
}

export type RuntimeEmulatorAvailability = {
  platform: RuntimeHostPlatformName
  available: boolean
  devices: RuntimeEmulatorSimulatorDevice[]
  simctl: { ok: boolean; message?: string }
  serveSim: { ok: boolean; message?: string }
  android: { sdkFound: boolean; sdkPath?: string; message: string }
  message: string
}

export type RuntimeEmulatorOkResult = { ok: true }

export type RuntimeEmulatorKillResult = RuntimeEmulatorOkResult & { deviceUdid: string }

export type RuntimeEmulatorShutdownResult = RuntimeEmulatorOkResult & { deviceUdid?: string }

export type RuntimeEmulatorLogcatEntry = {
  timestamp?: string
  level?: string
  tag?: string
  message: string
}

export type RuntimeEmulatorAxBounds = {
  left: number
  top: number
  right: number
  bottom: number
}

export type RuntimeEmulatorAxNode = {
  className?: string
  text?: string
  resourceId?: string
  contentDesc?: string
  packageName?: string
  clickable?: boolean
  enabled?: boolean
  focused?: boolean
  bounds?: RuntimeEmulatorAxBounds
  children: RuntimeEmulatorAxNode[]
}

export type RuntimeEmulatorListResult = RuntimeJsonValue
export type RuntimeEmulatorExecResult = RuntimeJsonValue
