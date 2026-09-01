import { platform } from 'node:os'

import { captureSubprocess } from '../subprocess-capture'

export async function hideNativeSimulatorApp(): Promise<void> {
  if (platform() !== 'darwin') {
    return
  }

  // Why: Simulator.app does not expose a direct hide command, but System Events
  // can hide the process after CoreSimulator/serve-sim surfaces a native window.
  await captureSubprocess(
    'osascript',
    [
      '-e',
      'tell application "System Events"',
      '-e',
      'if exists application process "Simulator" then set visible of application process "Simulator" to false',
      '-e',
      'end tell'
    ],
    { timeoutMs: 2_000 }
  ).catch(() => undefined)
}
