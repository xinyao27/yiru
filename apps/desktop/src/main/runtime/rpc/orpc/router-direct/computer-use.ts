import {
  handleComputerClick,
  handleComputerDrag,
  handleComputerGetAppState,
  handleComputerHotkey,
  handleComputerListApps,
  handleComputerListWindows,
  handleComputerPasteText,
  handleComputerPerformSecondaryAction,
  handleComputerPermissions,
  handleComputerPermissionsReset,
  handleComputerPermissionsStatus,
  handleComputerPressKey,
  handleComputerScroll,
  handleComputerSetValue,
  handleComputerTypeText,
  handleComputerCapabilities
} from '~main/runtime/rpc/methods/computer'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: `computer` operates the Computer Use sidecar on the target host (a
// screenshot/click/type surface for automating another app's UI) — distinct
// from `developerPermissions`, the preload-only surface covering the
// Electron app bundle's own macOS TCC grants (see the sidecar's own
// `permissions*` vs the bundle's `developerPermissions` in
// docs/runtime-orpc-migration.md Phase 6 D-stage history for `computer`).
export const computerUseRuntimeHandlers = {
  computer: {
    capabilities: runtimeImplementation.computer.capabilities.handler(
      wireRuntimeMethod('computer.capabilities', handleComputerCapabilities)
    ),
    listApps: runtimeImplementation.computer.listApps.handler(
      wireRuntimeMethod('computer.listApps', handleComputerListApps)
    ),
    permissions: runtimeImplementation.computer.permissions.handler(
      wireRuntimeMethod('computer.permissions', handleComputerPermissions)
    ),
    permissionsStatus: runtimeImplementation.computer.permissionsStatus.handler(
      wireRuntimeMethod('computer.permissionsStatus', handleComputerPermissionsStatus)
    ),
    permissionsReset: runtimeImplementation.computer.permissionsReset.handler(
      wireRuntimeMethod('computer.permissionsReset', handleComputerPermissionsReset)
    ),
    listWindows: runtimeImplementation.computer.listWindows.handler(
      wireRuntimeMethod('computer.listWindows', handleComputerListWindows)
    ),
    getAppState: runtimeImplementation.computer.getAppState.handler(
      wireRuntimeMethod('computer.getAppState', handleComputerGetAppState)
    ),
    click: runtimeImplementation.computer.click.handler(
      wireRuntimeMethod('computer.click', handleComputerClick)
    ),
    performSecondaryAction: runtimeImplementation.computer.performSecondaryAction.handler(
      wireRuntimeMethod('computer.performSecondaryAction', handleComputerPerformSecondaryAction)
    ),
    scroll: runtimeImplementation.computer.scroll.handler(
      wireRuntimeMethod('computer.scroll', handleComputerScroll)
    ),
    drag: runtimeImplementation.computer.drag.handler(
      wireRuntimeMethod('computer.drag', handleComputerDrag)
    ),
    typeText: runtimeImplementation.computer.typeText.handler(
      wireRuntimeMethod('computer.typeText', handleComputerTypeText)
    ),
    pressKey: runtimeImplementation.computer.pressKey.handler(
      wireRuntimeMethod('computer.pressKey', handleComputerPressKey)
    ),
    hotkey: runtimeImplementation.computer.hotkey.handler(
      wireRuntimeMethod('computer.hotkey', handleComputerHotkey)
    ),
    pasteText: runtimeImplementation.computer.pasteText.handler(
      wireRuntimeMethod('computer.pasteText', handleComputerPasteText)
    ),
    setValue: runtimeImplementation.computer.setValue.handler(
      wireRuntimeMethod('computer.setValue', handleComputerSetValue)
    )
  }
} as const
