import path from 'node:path'

import type {
  EmulatorAttachInput,
  EmulatorButtonInput,
  EmulatorExecInput,
  EmulatorGestureInput,
  EmulatorInstallInput,
  EmulatorKillInput,
  EmulatorLaunchInput,
  EmulatorLogcatInput,
  EmulatorPermissionsInput,
  EmulatorRotateInput,
  EmulatorShutdownInput,
  EmulatorTapInput,
  EmulatorTargetInput,
  EmulatorTypeInput,
  EmulatorWorktreeInput,
  RuntimeEmulatorAxNode,
  RuntimeEmulatorExecResult,
  RuntimeEmulatorListResult,
  RuntimeEmulatorLogcatEntry
} from '@yiru/runtime-protocol/contract'

import { InvalidArgumentError, type RpcContext } from '../core'

export async function handleEmulatorList(
  params: EmulatorWorktreeInput,
  { emulatorCommands }: RpcContext
): Promise<RuntimeEmulatorListResult> {
  // Why: `emulatorList` is typed `Promise<unknown>` in the runtime service —
  // it fans out to per-backend (iOS/Android) helper listings that predate a
  // shared result type. Narrowing to the contract's real output here, not
  // casting the contract itself away.
  return (await emulatorCommands.emulatorList(params)) as RuntimeEmulatorListResult
}

export async function handleEmulatorAttach(
  params: EmulatorAttachInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorAttach(params)
}

export async function handleEmulatorTap(
  params: EmulatorTapInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorTap(params)
}

export async function handleEmulatorGesture(
  params: EmulatorGestureInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorGesture(params)
}

export async function handleEmulatorType(
  params: EmulatorTypeInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorType(params)
}

export async function handleEmulatorButton(
  params: EmulatorButtonInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorButton(params)
}

export async function handleEmulatorRotate(
  params: EmulatorRotateInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorRotate(params)
}

export async function handleEmulatorExec(
  params: EmulatorExecInput,
  { emulatorCommands }: RpcContext
): Promise<RuntimeEmulatorExecResult> {
  // Why: same `unknown`-typed backend fan-out as `emulatorList` above.
  return (await emulatorCommands.emulatorExec(params)) as RuntimeEmulatorExecResult
}

export async function handleEmulatorKill(
  params: EmulatorKillInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorKill(params)
}

export async function handleEmulatorShutdown(
  params: EmulatorShutdownInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorShutdown(params)
}

export async function handleEmulatorListSimulators(
  params: EmulatorWorktreeInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorListSimulators(params)
}

export async function handleEmulatorAvailability(
  params: EmulatorWorktreeInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorAvailability(params)
}

export async function handleEmulatorListDevices(
  params: EmulatorWorktreeInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorListDevices(params)
}

export async function handleEmulatorInstall(
  params: EmulatorInstallInput,
  { emulatorCommands }: RpcContext
) {
  // Why: the shared schema accepts either host convention for remote clients;
  // the executing host remains authoritative for whether this path is absolute.
  if (!path.isAbsolute(params.path)) {
    throw new InvalidArgumentError('path must be absolute')
  }
  return emulatorCommands.emulatorInstall(params)
}

export async function handleEmulatorLaunch(
  params: EmulatorLaunchInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorLaunch(params)
}

export async function handleEmulatorPermissions(
  params: EmulatorPermissionsInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorPermissions(params)
}

export async function handleEmulatorAx(
  params: EmulatorTargetInput,
  { emulatorCommands }: RpcContext
): Promise<RuntimeEmulatorAxNode> {
  // Why: `EmulatorBackend.accessibilityTree` is `Promise<unknown>` — only the
  // Android backend implements it (iOS advertises the capability as false).
  return (await emulatorCommands.emulatorAx(params)) as RuntimeEmulatorAxNode
}

export async function handleEmulatorLogcat(
  params: EmulatorLogcatInput,
  { emulatorCommands }: RpcContext
): Promise<RuntimeEmulatorLogcatEntry[]> {
  // Why: `EmulatorBackend.logcat` is `Promise<unknown>` for the same reason.
  return (await emulatorCommands.emulatorLogcat(params)) as RuntimeEmulatorLogcatEntry[]
}

export async function handleEmulatorUnregisterActive(
  params: EmulatorWorktreeInput,
  { emulatorCommands }: RpcContext
) {
  return emulatorCommands.emulatorUnregisterActive(params)
}
