export type WebSessionTabsRefreshRequest = {
  environmentId: string
  worktreeId: string
}

type WebSessionTabsRefreshHandler = (request: WebSessionTabsRefreshRequest) => void | Promise<void>

let handler: WebSessionTabsRefreshHandler | null = null

export async function requestWebSessionTabsRefresh(
  request: WebSessionTabsRefreshRequest
): Promise<boolean> {
  if (!handler) {
    console.warn('[web-session-tabs-refresh] refresh owner is not installed')
    return false
  }
  await handler(request)
  return true
}

export function registerWebSessionTabsRefreshHandler(
  nextHandler: WebSessionTabsRefreshHandler
): void {
  handler = nextHandler
}
