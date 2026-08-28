export type ShellServicesConnectionId = string

export function webShellServicesConnectionId(connectionId: string): ShellServicesConnectionId {
  return `web:${connectionId}`
}

export function isWebShellServicesConnectionId(
  connectionId: ShellServicesConnectionId | null
): boolean {
  return connectionId?.startsWith('web:') === true
}
