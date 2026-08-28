import {
  browserPageId,
  describeBrowserTab,
  listBrowserTabs,
  parseBrowserPageId,
  readBrowserTabWorktree,
  readBrowserCommandInput,
  rememberBrowserTab,
  rememberBrowserTabWorktree,
  resolveBrowserTab,
  waitForTabComplete
} from './target'

export async function executeBrowserNavigation(
  method: string,
  rawInput: unknown
): Promise<unknown> {
  const input = readBrowserCommandInput(rawInput)
  switch (method) {
    case 'browser.tabList':
      return { tabs: await describeAllTabs() }
    case 'browser.tabShow':
      return { tab: await describeRequestedTab(input) }
    case 'browser.tabCurrent':
      return { tab: await describeCurrentTab(input) }
    case 'browser.tabSwitch':
      return switchBrowserTab(input)
    case 'browser.tabCreate':
      return createBrowserTab(input)
    case 'browser.tabClose':
      return closeBrowserTab(input)
    case 'browser.tabSetProfile':
      return describeChromeProfile(input)
    case 'browser.tabProfileShow':
      return showChromeProfile(input)
    case 'browser.tabProfileClone':
      return cloneBrowserTab(input)
    case 'browser.profileList':
      return { profiles: [chromeProfile()] }
    case 'browser.profileCreate':
      return { profile: null }
    case 'browser.profileDelete':
      return { deleted: false, profileId: readString(input, 'profileId') }
    case 'browser.profileDetectBrowsers':
      return { browsers: [] }
    case 'browser.profileImportFromBrowser':
      return { ok: false, reason: 'Chrome extension tabs already use the current Chrome profile.' }
    case 'browser.profileClearDefaultCookies':
      return { cleared: false }
    case 'browser.goto':
      return navigateToUrl(input)
    case 'browser.back':
      return navigateHistory(input, 'back')
    case 'browser.forward':
      return navigateHistory(input, 'forward')
    case 'browser.reload':
      return reloadBrowserTab(input)
    case 'browser.certificate.proceed':
      return { ok: false, reason: 'ineligible' }
    default:
      throw new Error(`browser_navigation_command_unsupported:${method}`)
  }
}

async function describeAllTabs() {
  const tabs = await listBrowserTabs()
  return Promise.all(tabs.map((tab, index) => describeBrowserTab(tab, index)))
}

async function describeRequestedTab(input: Record<string, unknown>) {
  const page = readString(input, 'page')
  const tab = await chrome.tabs.get(parseBrowserPageId(page))
  const tabs = await listBrowserTabs()
  return describeBrowserTab(
    tab,
    Math.max(
      0,
      tabs.findIndex((candidate) => candidate.id === tab.id)
    )
  )
}

async function describeCurrentTab(input: Record<string, unknown>) {
  const tab = await resolveBrowserTab(input)
  const tabs = await listBrowserTabs()
  return describeBrowserTab(
    tab,
    Math.max(
      0,
      tabs.findIndex((candidate) => candidate.id === tab.id)
    )
  )
}

async function switchBrowserTab(input: Record<string, unknown>) {
  const tabs = await listBrowserTabs()
  const page = Reflect.get(input, 'page')
  const index = Reflect.get(input, 'index')
  const tab =
    typeof page === 'string'
      ? tabs.find((candidate) => candidate.id === parseBrowserPageId(page))
      : typeof index === 'number'
        ? tabs[index]
        : undefined
  if (tab?.id === undefined) {
    throw new Error('browser_tab_not_found')
  }
  await chrome.tabs.update(tab.id, { active: true })
  if (tab.windowId !== undefined && Reflect.get(input, 'focus') !== false) {
    await chrome.windows.update(tab.windowId, { focused: true })
  }
  await rememberBrowserTab(tab)
  const worktreeId = explicitWorktreeId(input)
  if (worktreeId) {
    await rememberBrowserTabWorktree(tab.id, worktreeId)
  }
  return { browserPageId: browserPageId(tab.id), switched: tabs.indexOf(tab) }
}

async function createBrowserTab(input: Record<string, unknown>) {
  const requestedUrl = Reflect.get(input, 'url')
  const url =
    typeof requestedUrl === 'string' && requestedUrl.length > 0 ? requestedUrl : 'about:blank'
  assertNavigableUrl(url)
  const tab = await chrome.tabs.create({ active: Reflect.get(input, 'activate') === true, url })
  if (tab.id === undefined) {
    throw new Error('browser_tab_create_failed')
  }
  await rememberBrowserTab(tab)
  const worktreeId = explicitWorktreeId(input)
  if (worktreeId) {
    await rememberBrowserTabWorktree(tab.id, worktreeId)
  }
  return { browserPageId: browserPageId(tab.id) }
}

async function closeBrowserTab(input: Record<string, unknown>) {
  const page = Reflect.get(input, 'page')
  const index = Reflect.get(input, 'index')
  const tabs = await listBrowserTabs()
  const tab =
    typeof page === 'string'
      ? tabs.find((candidate) => candidate.id === parseBrowserPageId(page))
      : typeof index === 'number'
        ? tabs[index]
        : await resolveBrowserTab(input)
  if (tab?.id === undefined) {
    return { closed: false }
  }
  await chrome.tabs.remove(tab.id)
  return { closed: true }
}

async function cloneBrowserTab(input: Record<string, unknown>) {
  const source = await resolveBrowserTab(input)
  const created = await chrome.tabs.create({ active: false, url: source.url })
  if (created.id === undefined || source.id === undefined) {
    throw new Error('browser_tab_clone_failed')
  }
  const worktreeId = await readBrowserTabWorktree(source.id)
  if (worktreeId) {
    await rememberBrowserTabWorktree(created.id, worktreeId)
  }
  return {
    browserPageId: browserPageId(created.id),
    profileId: 'chrome-profile',
    profileLabel: 'Chrome profile',
    sourceBrowserPageId: browserPageId(source.id)
  }
}

async function navigateToUrl(input: Record<string, unknown>) {
  const url = readString(input, 'url')
  assertNavigableUrl(url)
  const tab = await resolveBrowserTab(input)
  if (tab.id === undefined) {
    throw new Error('browser_tab_id_missing')
  }
  await chrome.tabs.update(tab.id, { url })
  return navigationResult(await waitForTabComplete(tab.id))
}

async function navigateHistory(input: Record<string, unknown>, direction: 'back' | 'forward') {
  const tab = await resolveBrowserTab(input)
  if (tab.id === undefined) {
    throw new Error('browser_tab_id_missing')
  }
  await (direction === 'back' ? chrome.tabs.goBack(tab.id) : chrome.tabs.goForward(tab.id))
  return navigationResult(await waitForTabComplete(tab.id))
}

async function reloadBrowserTab(input: Record<string, unknown>) {
  const tab = await resolveBrowserTab(input)
  if (tab.id === undefined) {
    throw new Error('browser_tab_id_missing')
  }
  await chrome.tabs.reload(tab.id)
  return navigationResult(await waitForTabComplete(tab.id))
}

function navigationResult(tab: chrome.tabs.Tab): { title: string; url: string } {
  return { title: tab.title ?? '', url: tab.url ?? '' }
}

function describeChromeProfile(input: Record<string, unknown>) {
  const page = Reflect.get(input, 'page')
  return {
    browserPageId: typeof page === 'string' ? page : '',
    profileId: 'chrome-profile',
    profileLabel: 'Chrome profile'
  }
}

async function showChromeProfile(input: Record<string, unknown>) {
  const tab = await resolveBrowserTab(input)
  return {
    browserPageId: tab.id === undefined ? '' : browserPageId(tab.id),
    profileId: 'chrome-profile',
    profileLabel: 'Chrome profile',
    worktreeId: null
  }
}

function chromeProfile() {
  return {
    id: 'chrome-profile',
    label: 'Chrome profile',
    partition: 'chrome-profile',
    scope: 'default' as const,
    source: null
  }
}

function readString(input: Record<string, unknown>, key: string): string {
  const value = Reflect.get(input, key)
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`browser_command_value_missing:${key}`)
  }
  return value
}

function explicitWorktreeId(input: Record<string, unknown>): string | null {
  const value = Reflect.get(input, 'worktree')
  return typeof value === 'string' && value.startsWith('id:') && value.length > 3
    ? value.slice(3)
    : null
}

function assertNavigableUrl(value: string): void {
  if (value === 'about:blank') {
    return
  }
  const url = new URL(value)
  if (!['file:', 'http:', 'https:'].includes(url.protocol)) {
    throw new Error(`browser_url_unsupported:${url.protocol}`)
  }
}
