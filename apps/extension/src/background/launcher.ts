const LAUNCHER_MARKER = 'launcher=1'
const NEW_TAB_MARKER = 'new-tab=1'
const NEW_TAB_PREFERENCE_KEY = 'useNewTabLauncher'

let provisionedTabId: number | null = null
let isProvisioning = false

export async function provisionFirstInstallLauncher(): Promise<void> {
  await chrome.storage.local.set({ keepLauncherPinned: true })
  await ensureLauncherTab({ firstInstall: true })
}

export async function restorePinnedLauncher(): Promise<void> {
  const stored: unknown = await chrome.storage.local.get('keepLauncherPinned')
  if (
    typeof stored === 'object' &&
    stored !== null &&
    Reflect.get(stored, 'keepLauncherPinned') === true
  ) {
    await ensureLauncherTab()
  }
}

export function registerLauncherListeners(): void {
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (isPinnedLauncherUrl(tab.url) && change.pinned === false && !isProvisioning) {
      provisionedTabId = tabId
      void chrome.storage.local.set({ keepLauncherPinned: false })
    }
    if (isChromeNewTab(change.url ?? tab.url ?? tab.pendingUrl)) {
      void replaceNewTab(tabId)
    }
  })

  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id !== undefined && isChromeNewTab(tab.pendingUrl ?? tab.url)) {
      void replaceNewTab(tab.id)
    }
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === provisionedTabId && !isProvisioning) {
      provisionedTabId = null
      void chrome.storage.local.set({ keepLauncherPinned: false })
    }
  })
}

async function ensureLauncherTab(options: { firstInstall?: boolean } = {}): Promise<void> {
  const url = launcherUrl(options.firstInstall === true)
  const tabs = await chrome.tabs.query({ url: `${chrome.runtime.getURL('workspace.html')}*` })
  const launchers = tabs.filter((tab) => isPinnedLauncherUrl(tab.url))
  const existing = launchers[0]
  for (const duplicate of launchers.slice(1)) {
    if (duplicate.id !== undefined) {
      await chrome.tabs.remove(duplicate.id)
    }
  }
  if (existing?.id !== undefined) {
    provisionedTabId = existing.id
    if (!existing.pinned) {
      isProvisioning = true
      await chrome.tabs.update(existing.id, { pinned: true })
      isProvisioning = false
    }
    return
  }
  isProvisioning = true
  const created = await chrome.tabs.create({
    active: options.firstInstall === true,
    pinned: true,
    url
  })
  provisionedTabId = created.id ?? null
  isProvisioning = false
}

function launcherUrl(firstInstall = false): string {
  const url = new URL(chrome.runtime.getURL('workspace.html'))
  url.searchParams.set('launcher', '1')
  if (firstInstall) {
    url.searchParams.set('install', '1')
  }
  url.searchParams.set('view', 'activity')
  return url.href
}

function isPinnedLauncherUrl(url: string | undefined): boolean {
  return Boolean(
    url?.startsWith(chrome.runtime.getURL('workspace.html')) && url.includes(LAUNCHER_MARKER)
  )
}

async function replaceNewTab(tabId: number): Promise<void> {
  const stored: unknown = await chrome.storage.sync.get(NEW_TAB_PREFERENCE_KEY)
  if (
    typeof stored !== 'object' ||
    stored === null ||
    Reflect.get(stored, NEW_TAB_PREFERENCE_KEY) !== true
  ) {
    return
  }
  const url = new URL(chrome.runtime.getURL('workspace.html'))
  url.searchParams.set('new-tab', '1')
  url.searchParams.set('view', 'activity')
  await chrome.tabs.update(tabId, { url: url.href })
}

function isChromeNewTab(url: string | undefined): boolean {
  return url === 'chrome://newtab/' && !url.includes(NEW_TAB_MARKER)
}
