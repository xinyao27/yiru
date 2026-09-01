export type RemoteSessionTabsRefreshRequest = {
  environmentId: string
  worktreeId: string
}

type RemoteSessionTabsRefreshHandler = (
  request: RemoteSessionTabsRefreshRequest
) => void | Promise<void>

let handler: RemoteSessionTabsRefreshHandler | null = null

export async function requestRemoteSessionTabsRefresh(
  request: RemoteSessionTabsRefreshRequest
): Promise<boolean> {
  if (!handler) {
    console.warn('[remote-session-tabs-refresh] refresh owner is not installed')
    return false
  }
  await handler(request)
  return true
}

export function registerRemoteSessionTabsRefreshHandler(
  nextHandler: RemoteSessionTabsRefreshHandler
): void {
  handler = nextHandler
}
