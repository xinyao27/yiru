import { ipcMain } from 'electron'

import type { MainIpcInvokeEvent, MainIpcRegistration } from '../ipc-registration'

function handle<TArgs extends unknown[], TResult>(
  channel: string,
  listener: (event: MainIpcInvokeEvent, ...args: TArgs) => TResult
): void {
  ipcMain.handle(channel, (event, ...args: TArgs) => listener(event, ...args))
}

export const electronIpcRegistration: MainIpcRegistration = {
  handle,
  removeHandler: (channel) => ipcMain.removeHandler(channel)
}
