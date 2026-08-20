import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  EmulatorAttachInputSchema,
  EmulatorButtonInputSchema,
  EmulatorExecInputSchema,
  EmulatorGestureInputSchema,
  EmulatorInstallInputSchema,
  EmulatorKillInputSchema,
  EmulatorLaunchInputSchema,
  EmulatorLogcatInputSchema,
  EmulatorPermissionsInputSchema,
  EmulatorRotateInputSchema,
  EmulatorShutdownInputSchema,
  EmulatorTapInputSchema,
  EmulatorTargetInputSchema,
  EmulatorTypeInputSchema,
  EmulatorWorktreeInputSchema
} from './emulator-input.js'
import type {
  RuntimeEmulatorAttachResult,
  RuntimeEmulatorAvailability,
  RuntimeEmulatorAxNode,
  RuntimeEmulatorDevice,
  RuntimeEmulatorExecResult,
  RuntimeEmulatorKillResult,
  RuntimeEmulatorListResult,
  RuntimeEmulatorLogcatEntry,
  RuntimeEmulatorOkResult,
  RuntimeEmulatorShutdownResult,
  RuntimeEmulatorSimulatorDevice
} from './emulator-types.js'

const EMULATOR_ACCESS = { scope: 'host', tier: 'host' } as const

export const emulatorContract = {
  list: withAccess(EMULATOR_ACCESS)
    .input(EmulatorWorktreeInputSchema)
    .output(type<RuntimeEmulatorListResult>()),
  attach: withAccess(EMULATOR_ACCESS)
    .input(EmulatorAttachInputSchema)
    .output(type<RuntimeEmulatorAttachResult>()),
  tap: withAccess(EMULATOR_ACCESS)
    .input(EmulatorTapInputSchema)
    .output(type<RuntimeEmulatorOkResult>()),
  gesture: withAccess(EMULATOR_ACCESS)
    .input(EmulatorGestureInputSchema)
    .output(type<RuntimeEmulatorOkResult>()),
  type: withAccess(EMULATOR_ACCESS)
    .input(EmulatorTypeInputSchema)
    .output(type<RuntimeEmulatorOkResult>()),
  button: withAccess(EMULATOR_ACCESS)
    .input(EmulatorButtonInputSchema)
    .output(type<RuntimeEmulatorOkResult>()),
  rotate: withAccess(EMULATOR_ACCESS)
    .input(EmulatorRotateInputSchema)
    .output(type<RuntimeEmulatorOkResult>()),
  exec: withAccess(EMULATOR_ACCESS)
    .input(EmulatorExecInputSchema)
    .output(type<RuntimeEmulatorExecResult>()),
  kill: withAccess(EMULATOR_ACCESS)
    .input(EmulatorKillInputSchema)
    .output(type<RuntimeEmulatorKillResult>()),
  shutdown: withAccess(EMULATOR_ACCESS)
    .input(EmulatorShutdownInputSchema)
    .output(type<RuntimeEmulatorShutdownResult>()),
  listSimulators: withAccess(EMULATOR_ACCESS)
    .input(EmulatorWorktreeInputSchema)
    .output(type<RuntimeEmulatorSimulatorDevice[]>()),
  availability: withAccess(EMULATOR_ACCESS)
    .input(EmulatorWorktreeInputSchema)
    .output(type<RuntimeEmulatorAvailability>()),
  listDevices: withAccess(EMULATOR_ACCESS)
    .input(EmulatorWorktreeInputSchema)
    .output(type<RuntimeEmulatorDevice[]>()),
  install: withAccess(EMULATOR_ACCESS)
    .input(EmulatorInstallInputSchema)
    .output(type<RuntimeEmulatorOkResult>()),
  launch: withAccess(EMULATOR_ACCESS)
    .input(EmulatorLaunchInputSchema)
    .output(type<RuntimeEmulatorOkResult>()),
  permissions: withAccess(EMULATOR_ACCESS)
    .input(EmulatorPermissionsInputSchema)
    .output(type<RuntimeEmulatorOkResult>()),
  ax: withAccess(EMULATOR_ACCESS)
    .input(EmulatorTargetInputSchema)
    .output(type<RuntimeEmulatorAxNode>()),
  logcat: withAccess(EMULATOR_ACCESS)
    .input(EmulatorLogcatInputSchema)
    .output(type<RuntimeEmulatorLogcatEntry[]>()),
  unregisterActive: withAccess(EMULATOR_ACCESS)
    .input(EmulatorWorktreeInputSchema)
    .output(type<RuntimeEmulatorOkResult>()),
  // Why: auto-attach tells a client an emulator session came up for a
  // worktree. MJPEG frames deliberately stay out — they are a binary
  // performance path (§1.5) and need a side-channel, not an event iterator.
  events: {
    subscribe: withAccess(EMULATOR_ACCESS)
      .input(type<void>())
      .output(eventIterator(type<RuntimeEmulatorSubscriptionEvent>()))
  },
  frameStream: {
    subscribe: withAccess(EMULATOR_ACCESS)
      .input(type<RuntimeEmulatorFrameStreamInput>())
      .output(eventIterator(type<RuntimeEmulatorFrameStreamEvent>()))
  },
  videoStream: {
    subscribe: withAccess(EMULATOR_ACCESS)
      .input(type<RuntimeEmulatorVideoStreamInput>())
      .output(eventIterator(type<RuntimeEmulatorVideoStreamEvent>()))
  }
} satisfies ContractRouter<RuntimeProcedureMeta>

export {
  EmulatorAttachInputSchema,
  EmulatorButtonInputSchema,
  EmulatorExecInputSchema,
  EmulatorGestureInputSchema,
  EmulatorGesturePointSchema,
  EmulatorInstallInputSchema,
  EmulatorKillInputSchema,
  EmulatorLaunchInputSchema,
  EmulatorLogcatInputSchema,
  EmulatorPermissionsInputSchema,
  EmulatorRotateInputSchema,
  EmulatorRotateOrientationSchema,
  EmulatorShutdownInputSchema,
  EmulatorTapInputSchema,
  EmulatorTargetInputSchema,
  EmulatorTypeInputSchema,
  EmulatorWorktreeInputSchema
} from './emulator-input.js'
export type {
  EmulatorAttachInput,
  EmulatorButtonInput,
  EmulatorExecInput,
  EmulatorGestureInput,
  EmulatorGesturePoint,
  EmulatorInstallInput,
  EmulatorKillInput,
  EmulatorLaunchInput,
  EmulatorLogcatInput,
  EmulatorPermissionsInput,
  EmulatorRotateInput,
  EmulatorRotateOrientation,
  EmulatorShutdownInput,
  EmulatorTapInput,
  EmulatorTargetInput,
  EmulatorTypeInput,
  EmulatorWorktreeInput
} from './emulator-input.js'
export type {
  RuntimeEmulatorAttachResult,
  RuntimeEmulatorAvailability,
  RuntimeEmulatorAxBounds,
  RuntimeEmulatorAxNode,
  RuntimeEmulatorBackendKind,
  RuntimeEmulatorDevice,
  RuntimeEmulatorExecResult,
  RuntimeEmulatorKillResult,
  RuntimeEmulatorListResult,
  RuntimeEmulatorLogcatEntry,
  RuntimeEmulatorOkResult,
  RuntimeEmulatorSessionInfo,
  RuntimeEmulatorShutdownResult,
  RuntimeEmulatorSimulatorDevice,
  RuntimeEmulatorStreamCodec
} from './emulator-types.js'

export type RuntimeEmulatorAutoAttachEvent = {
  worktreeId: string
  info: { deviceUdid: string; streamUrl: string; wsUrl: string; axUrl?: string }
}

export type RuntimeEmulatorEvent =
  | ({ type: 'autoAttach' } & RuntimeEmulatorAutoAttachEvent)
  | { type: 'paneFocus'; worktreeId: string }

export type RuntimeEmulatorSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeEmulatorEvent
  | { type: 'end' }

export type RuntimeEmulatorFrameStreamInput = { streamUrl: string; streamKey?: string }
export type RuntimeEmulatorFrameStreamEvent =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'end' }

export type RuntimeEmulatorVideoStreamInput = { deviceId: string }
export type RuntimeEmulatorVideoStreamEvent =
  | { type: 'ready' }
  | { type: 'meta'; codecId: string; width: number; height: number }
  | { type: 'end' }
