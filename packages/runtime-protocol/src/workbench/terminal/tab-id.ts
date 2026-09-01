import { isRemoteTerminalSurfaceTabId } from './surface-id'

export function isValidTerminalTabId(value: string): boolean {
  return value.length > 0 && !value.includes(':')
}

export function isValidHostTerminalTabId(value: string): boolean {
  return isValidTerminalTabId(value) && !isRemoteTerminalSurfaceTabId(value)
}
