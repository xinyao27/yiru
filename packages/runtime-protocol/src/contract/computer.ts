import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  ComputerClickInputSchema,
  ComputerDragInputSchema,
  ComputerEmptyInputSchema,
  ComputerHotkeyInputSchema,
  ComputerListAppsInputSchema,
  ComputerListWindowsInputSchema,
  ComputerObserveTargetInputSchema,
  ComputerPasteTextInputSchema,
  ComputerPermissionsInputSchema,
  ComputerPressKeyInputSchema,
  ComputerScrollInputSchema,
  ComputerSecondaryActionInputSchema,
  ComputerSetValueInputSchema,
  ComputerTypeTextInputSchema
} from './computer-input.js'
import type {
  RuntimeComputerActionResult,
  RuntimeComputerListAppsResult,
  RuntimeComputerListWindowsResult,
  RuntimeComputerPermissionSetupResult,
  RuntimeComputerPermissionResetResult,
  RuntimeComputerPermissionStatusResult,
  RuntimeComputerProviderCapabilities,
  RuntimeComputerSnapshotResult
} from './computer-types.js'

const COMPUTER_ACCESS = { scope: 'host', tier: 'host' } as const

export const computerContract = {
  capabilities: withAccess(COMPUTER_ACCESS)
    .input(ComputerEmptyInputSchema)
    .output(type<RuntimeComputerProviderCapabilities>()),
  listApps: withAccess(COMPUTER_ACCESS)
    .input(ComputerListAppsInputSchema)
    .output(type<RuntimeComputerListAppsResult>()),
  permissions: withAccess(COMPUTER_ACCESS)
    .input(ComputerPermissionsInputSchema)
    .output(type<RuntimeComputerPermissionSetupResult>()),
  permissionsStatus: withAccess(COMPUTER_ACCESS)
    .input(ComputerEmptyInputSchema)
    .output(type<RuntimeComputerPermissionStatusResult>()),
  permissionsReset: withAccess(COMPUTER_ACCESS)
    .input(ComputerEmptyInputSchema)
    .output(type<RuntimeComputerPermissionResetResult>()),
  listWindows: withAccess(COMPUTER_ACCESS)
    .input(ComputerListWindowsInputSchema)
    .output(type<RuntimeComputerListWindowsResult>()),
  getAppState: withAccess(COMPUTER_ACCESS)
    .input(ComputerObserveTargetInputSchema)
    .output(type<RuntimeComputerSnapshotResult>()),
  click: withAccess(COMPUTER_ACCESS)
    .input(ComputerClickInputSchema)
    .output(type<RuntimeComputerActionResult>()),
  performSecondaryAction: withAccess(COMPUTER_ACCESS)
    .input(ComputerSecondaryActionInputSchema)
    .output(type<RuntimeComputerActionResult>()),
  scroll: withAccess(COMPUTER_ACCESS)
    .input(ComputerScrollInputSchema)
    .output(type<RuntimeComputerActionResult>()),
  drag: withAccess(COMPUTER_ACCESS)
    .input(ComputerDragInputSchema)
    .output(type<RuntimeComputerActionResult>()),
  typeText: withAccess(COMPUTER_ACCESS)
    .input(ComputerTypeTextInputSchema)
    .output(type<RuntimeComputerActionResult>()),
  pressKey: withAccess(COMPUTER_ACCESS)
    .input(ComputerPressKeyInputSchema)
    .output(type<RuntimeComputerActionResult>()),
  hotkey: withAccess(COMPUTER_ACCESS)
    .input(ComputerHotkeyInputSchema)
    .output(type<RuntimeComputerActionResult>()),
  pasteText: withAccess(COMPUTER_ACCESS)
    .input(ComputerPasteTextInputSchema)
    .output(type<RuntimeComputerActionResult>()),
  setValue: withAccess(COMPUTER_ACCESS)
    .input(ComputerSetValueInputSchema)
    .output(type<RuntimeComputerActionResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export {
  ComputerClickInputSchema,
  ComputerDragInputSchema,
  ComputerEmptyInputSchema,
  ComputerHotkeyInputSchema,
  ComputerListAppsInputSchema,
  ComputerListWindowsInputSchema,
  ComputerObserveTargetInputSchema,
  ComputerPasteTextInputSchema,
  ComputerPermissionsInputSchema,
  ComputerPressKeyInputSchema,
  ComputerScrollInputSchema,
  ComputerSecondaryActionInputSchema,
  ComputerSetValueInputSchema,
  ComputerTypeTextInputSchema
} from './computer-input.js'
export type {
  ComputerClickInput,
  ComputerDragInput,
  ComputerEmptyInput,
  ComputerHotkeyInput,
  ComputerListAppsInput,
  ComputerListWindowsInput,
  ComputerObserveTargetInput,
  ComputerPasteTextInput,
  ComputerPermissionsInput,
  ComputerPressKeyInput,
  ComputerScrollInput,
  ComputerSecondaryActionInput,
  ComputerSetValueInput,
  ComputerTypeTextInput
} from './computer-input.js'
export type {
  RuntimeComputerActionMetadata,
  RuntimeComputerActionResult,
  RuntimeComputerActionVerification,
  RuntimeComputerAppInfo,
  RuntimeComputerErrorCode,
  RuntimeComputerListAppsResult,
  RuntimeComputerListWindowsResult,
  RuntimeComputerPermissionId,
  RuntimeComputerPermissionSetupResult,
  RuntimeComputerPermissionState,
  RuntimeComputerPermissionStatus,
  RuntimeComputerPermissionResetResult,
  RuntimeComputerPermissionStatusResult,
  RuntimeComputerProviderCapabilities,
  RuntimeComputerScreenshotData,
  RuntimeComputerScreenshotMetadata,
  RuntimeComputerScreenshotStatus,
  RuntimeComputerSnapshotData,
  RuntimeComputerSnapshotResult,
  RuntimeComputerWindowInfo,
  RuntimeComputerWindowListWindow
} from './computer-types.js'
