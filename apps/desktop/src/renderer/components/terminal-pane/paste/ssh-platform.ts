import { useAppStore } from '~renderer/store'

export function getTerminalPasteSshRemotePlatform(
  connectionId: string | null | undefined
): NodeJS.Platform | null {
  if (!connectionId) {
    return null
  }
  return useAppStore.getState().sshConnectionStates.get(connectionId)?.remotePlatform ?? null
}
