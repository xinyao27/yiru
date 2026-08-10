import type {
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
  ComputerTypeTextInput,
  RuntimeComputerActionResult,
  RuntimeComputerListAppsResult,
  RuntimeComputerListWindowsResult,
  RuntimeComputerPermissionResetResult,
  RuntimeComputerPermissionSetupResult,
  RuntimeComputerPermissionStatusResult,
  RuntimeComputerProviderCapabilities,
  RuntimeComputerSnapshotResult
} from '@yiru/runtime-protocol/contract'
import {
  callComputerSidecarAction,
  callComputerSidecarCapabilities,
  callComputerSidecarListApps,
  callComputerSidecarListWindows,
  callComputerSidecarSnapshot
} from '~main/computer/sidecar-client'

export async function handleComputerCapabilities(
  _params: ComputerEmptyInput
): Promise<RuntimeComputerProviderCapabilities> {
  return await callComputerSidecarCapabilities()
}

export async function handleComputerListApps(
  _params: ComputerListAppsInput
): Promise<RuntimeComputerListAppsResult> {
  return await callComputerSidecarListApps()
}

export async function handleComputerPermissions(
  params: ComputerPermissionsInput
): Promise<RuntimeComputerPermissionSetupResult> {
  const { openComputerUsePermissions } =
    await import('~main/computer/macos-computer-use-permissions')
  return openComputerUsePermissions(params.id)
}

export async function handleComputerPermissionsStatus(
  _params: ComputerEmptyInput
): Promise<RuntimeComputerPermissionStatusResult> {
  const { getComputerUsePermissionStatus } =
    await import('~main/computer/macos-computer-use-permissions')
  return getComputerUsePermissionStatus()
}

export async function handleComputerPermissionsReset(
  _params: ComputerEmptyInput
): Promise<RuntimeComputerPermissionResetResult> {
  const { resetComputerUsePermissions } =
    await import('~main/computer/macos-computer-use-permissions')
  return resetComputerUsePermissions()
}

// Why: `~shared/runtime-types`'s `ComputerWindowInfo.platform` predates the
// contract's `RuntimeComputerWindowInfo` sibling and is typed
// `Record<string, unknown>` rather than the contract's JSON-safe value type
// — the value itself is already JSON-safe (parsed straight from a
// provider's JSON output), so the handlers below narrow to the contract's
// real result type at the boundary rather than widening the contract to
// match the looser internal type.
export async function handleComputerListWindows(
  params: ComputerListWindowsInput
): Promise<RuntimeComputerListWindowsResult> {
  return (await callComputerSidecarListWindows(params)) as RuntimeComputerListWindowsResult
}

export async function handleComputerGetAppState(
  params: ComputerObserveTargetInput
): Promise<RuntimeComputerSnapshotResult> {
  return (await callComputerSidecarSnapshot(params)) as RuntimeComputerSnapshotResult
}

export async function handleComputerClick(
  params: ComputerClickInput
): Promise<RuntimeComputerActionResult> {
  return (await callComputerSidecarAction('click', params)) as RuntimeComputerActionResult
}

export async function handleComputerPerformSecondaryAction(
  params: ComputerSecondaryActionInput
): Promise<RuntimeComputerActionResult> {
  return (await callComputerSidecarAction(
    'performSecondaryAction',
    params
  )) as RuntimeComputerActionResult
}

export async function handleComputerScroll(
  params: ComputerScrollInput
): Promise<RuntimeComputerActionResult> {
  return (await callComputerSidecarAction('scroll', params)) as RuntimeComputerActionResult
}

export async function handleComputerDrag(
  params: ComputerDragInput
): Promise<RuntimeComputerActionResult> {
  return (await callComputerSidecarAction('drag', params)) as RuntimeComputerActionResult
}

export async function handleComputerTypeText(
  params: ComputerTypeTextInput
): Promise<RuntimeComputerActionResult> {
  return (await callComputerSidecarAction('typeText', params)) as RuntimeComputerActionResult
}

export async function handleComputerPressKey(
  params: ComputerPressKeyInput
): Promise<RuntimeComputerActionResult> {
  return (await callComputerSidecarAction('pressKey', params)) as RuntimeComputerActionResult
}

export async function handleComputerHotkey(
  params: ComputerHotkeyInput
): Promise<RuntimeComputerActionResult> {
  return (await callComputerSidecarAction('hotkey', params)) as RuntimeComputerActionResult
}

export async function handleComputerPasteText(
  params: ComputerPasteTextInput
): Promise<RuntimeComputerActionResult> {
  return (await callComputerSidecarAction('pasteText', params)) as RuntimeComputerActionResult
}

export async function handleComputerSetValue(
  params: ComputerSetValueInput
): Promise<RuntimeComputerActionResult> {
  return (await callComputerSidecarAction('setValue', params)) as RuntimeComputerActionResult
}
