export async function requestBrowserPermissions(
  request: chrome.permissions.Permissions
): Promise<boolean> {
  const permissions = await missingPermissions(request.permissions ?? [])
  const origins = await missingOrigins(request.origins ?? [])
  if (permissions.length === 0 && origins.length === 0) {
    return true
  }
  return chrome.permissions.request({
    ...(origins.length > 0 ? { origins } : {}),
    ...(permissions.length > 0 ? { permissions } : {})
  })
}

export async function hasPersistentPageCaptureAccess(): Promise<boolean> {
  const tab = await activeWebTab()
  if (!tab?.url) {
    return false
  }
  const origin = `${new URL(tab.url).origin}/*`
  return Promise.all([
    chrome.permissions.contains({ origins: [origin] }),
    chrome.permissions.contains({ permissions: ['scripting'] })
  ]).then((checks) => checks.every(Boolean))
}

export async function requestPageCapturePermission(): Promise<boolean> {
  if (await hasPersistentPageCaptureAccess()) {
    return true
  }
  return requestBrowserPermissions({ permissions: ['activeTab', 'scripting'] })
}

async function missingPermissions(permissions: string[]): Promise<string[]> {
  const checks = await Promise.all(
    permissions.map(async (permission) => ({
      isGranted: await chrome.permissions.contains({ permissions: [permission] }),
      permission
    }))
  )
  return checks.flatMap(({ isGranted, permission }) => (isGranted ? [] : [permission]))
}

async function missingOrigins(origins: string[]): Promise<string[]> {
  const checks = await Promise.all(
    origins.map(async (origin) => ({
      isGranted: await chrome.permissions.contains({ origins: [origin] }),
      origin
    }))
  )
  return checks.flatMap(({ isGranted, origin }) => (isGranted ? [] : [origin]))
}

async function activeWebTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const tab = tabs[0]
  return tab?.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://')) ? tab : null
}
