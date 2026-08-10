import {
  handleEmulatorAttach,
  handleEmulatorAvailability,
  handleEmulatorAx,
  handleEmulatorButton,
  handleEmulatorExec,
  handleEmulatorGesture,
  handleEmulatorInstall,
  handleEmulatorKill,
  handleEmulatorLaunch,
  handleEmulatorList,
  handleEmulatorListDevices,
  handleEmulatorListSimulators,
  handleEmulatorLogcat,
  handleEmulatorPermissions,
  handleEmulatorRotate,
  handleEmulatorShutdown,
  handleEmulatorTap,
  handleEmulatorType,
  handleEmulatorUnregisterActive
} from '~main/runtime/rpc/methods/emulator'
import { handleEmulatorEventsSubscribe } from '~main/runtime/rpc/methods/emulator-events'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: `emulator` controls the mobile simulator/AVD sessions a worktree can
// spin up (attach/tap/type/install/…) plus the auto-attach event feed. MJPEG
// frame bytes deliberately stay off this contract — they use their own
// binary side-channel (`window.api.emulator.startFrameStream`) untouched by
// this migration, per the contract's own `events` comment.
export const emulatorRuntimeHandlers = {
  emulator: {
    list: runtimeImplementation.emulator.list.handler(
      wireRuntimeMethod('emulator.list', handleEmulatorList)
    ),
    attach: runtimeImplementation.emulator.attach.handler(
      wireRuntimeMethod('emulator.attach', handleEmulatorAttach)
    ),
    tap: runtimeImplementation.emulator.tap.handler(
      wireRuntimeMethod('emulator.tap', handleEmulatorTap)
    ),
    gesture: runtimeImplementation.emulator.gesture.handler(
      wireRuntimeMethod('emulator.gesture', handleEmulatorGesture)
    ),
    type: runtimeImplementation.emulator.type.handler(
      wireRuntimeMethod('emulator.type', handleEmulatorType)
    ),
    button: runtimeImplementation.emulator.button.handler(
      wireRuntimeMethod('emulator.button', handleEmulatorButton)
    ),
    rotate: runtimeImplementation.emulator.rotate.handler(
      wireRuntimeMethod('emulator.rotate', handleEmulatorRotate)
    ),
    exec: runtimeImplementation.emulator.exec.handler(
      wireRuntimeMethod('emulator.exec', handleEmulatorExec)
    ),
    kill: runtimeImplementation.emulator.kill.handler(
      wireRuntimeMethod('emulator.kill', handleEmulatorKill)
    ),
    shutdown: runtimeImplementation.emulator.shutdown.handler(
      wireRuntimeMethod('emulator.shutdown', handleEmulatorShutdown)
    ),
    listSimulators: runtimeImplementation.emulator.listSimulators.handler(
      wireRuntimeMethod('emulator.listSimulators', handleEmulatorListSimulators)
    ),
    availability: runtimeImplementation.emulator.availability.handler(
      wireRuntimeMethod('emulator.availability', handleEmulatorAvailability)
    ),
    listDevices: runtimeImplementation.emulator.listDevices.handler(
      wireRuntimeMethod('emulator.listDevices', handleEmulatorListDevices)
    ),
    install: runtimeImplementation.emulator.install.handler(
      wireRuntimeMethod('emulator.install', handleEmulatorInstall)
    ),
    launch: runtimeImplementation.emulator.launch.handler(
      wireRuntimeMethod('emulator.launch', handleEmulatorLaunch)
    ),
    permissions: runtimeImplementation.emulator.permissions.handler(
      wireRuntimeMethod('emulator.permissions', handleEmulatorPermissions)
    ),
    ax: runtimeImplementation.emulator.ax.handler(
      wireRuntimeMethod('emulator.ax', handleEmulatorAx)
    ),
    logcat: runtimeImplementation.emulator.logcat.handler(
      wireRuntimeMethod('emulator.logcat', handleEmulatorLogcat)
    ),
    unregisterActive: runtimeImplementation.emulator.unregisterActive.handler(
      wireRuntimeMethod('emulator.unregisterActive', handleEmulatorUnregisterActive)
    ),
    events: {
      subscribe: runtimeImplementation.emulator.events.subscribe.handler(
        wireRuntimeStream('emulator.events.subscribe', handleEmulatorEventsSubscribe)
      )
    }
  }
} as const
