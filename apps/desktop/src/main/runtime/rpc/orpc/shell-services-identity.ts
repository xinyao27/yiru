export type ShellServicesConnectionId = string

export function electronShellServicesConnectionId(
  webContentsId: number
): ShellServicesConnectionId {
  return `electron:${webContentsId}`
}

export function webShellServicesConnectionId(connectionId: string): ShellServicesConnectionId {
  return `web:${connectionId}`
}

export function isWebShellServicesConnectionId(
  connectionId: ShellServicesConnectionId | null
): boolean {
  return connectionId?.startsWith('web:') === true
}
