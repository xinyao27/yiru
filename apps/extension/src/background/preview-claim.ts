import { forgetBrowserTabWorktree, rememberBrowserTabWorktree } from './browser-use/target'
import { drainConsoleSensor, isConsoleSensorActive, startConsoleSensor } from './cdp/console-sensor'
import { addTabToProjectGroup } from './project-groups'

type WorkspacePortClaim = {
  displayName: string
  port: number
  projectId: string
  worktreeId: string
}
type ClaimedTab = WorkspacePortClaim & { pageUrl: string }

const claims = new Map<number, WorkspacePortClaim>()
const claimedTabs = new Map<number, ClaimedTab>()
let hasRegisteredTabListener = false
let hasRegisteredWebNavigationListener = false

export function handleWorkspacePortClaimsMessage(
  message: object,
  respond: (response: unknown) => void
): boolean | null {
  if (Reflect.get(message, 'type') !== 'workspace-port-claims') {
    return null
  }
  const parsed = parseClaims(Reflect.get(message, 'claims'))
  if (!parsed) {
    respond({ error: 'workspace_port_claims_invalid', ok: false })
    return false
  }
  void saveWorkspacePortClaims(parsed).then(
    () => respond({ ok: true }),
    (error: unknown) =>
      respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}

export async function restoreWorkspacePortClaims(): Promise<void> {
  const stored: unknown = await chrome.storage.session.get('workspacePortClaims')
  const value =
    typeof stored === 'object' && stored !== null
      ? Reflect.get(stored, 'workspacePortClaims')
      : null
  const parsed = parseClaims(value)
  if (!parsed) {
    return
  }
  for (const claim of parsed) {
    claims.set(claim.port, claim)
  }
  await claimOpenPreviewTabs()
}

export function registerPreviewClaimListeners(): void {
  if (chrome.webNavigation && !hasRegisteredWebNavigationListener) {
    hasRegisteredWebNavigationListener = true
    chrome.webNavigation.onCommitted.addListener((details) => {
      if (details.frameId !== 0) {
        return
      }
      void claimPreviewTab(details.tabId, details.url)
    })
  }

  if (!hasRegisteredTabListener) {
    hasRegisteredTabListener = true
    chrome.tabs.onRemoved.addListener((tabId) => claimedTabs.delete(tabId))
  }
}

export function handleClaimedConsoleMessage(
  message: object,
  respond: (response: unknown) => void
): boolean | null {
  if (Reflect.get(message, 'type') !== 'claimed-console-drain') {
    return null
  }
  const captures = [...claimedTabs].flatMap(([tabId, target]) => {
    if (!isConsoleSensorActive(tabId)) {
      return []
    }
    const entries = drainConsoleSensor(tabId)
    return entries.length > 0
      ? [
          {
            entries,
            pageUrl: target.pageUrl,
            projectId: target.projectId,
            worktreeId: target.worktreeId
          }
        ]
      : []
  })
  respond({ captures, ok: true })
  return false
}

async function claimPreviewTab(tabId: number, url: string): Promise<void> {
  const port = localPreviewPort(url)
  const claim = port === null ? null : claims.get(port)
  if (!claim) {
    if (claimedTabs.delete(tabId)) {
      await forgetBrowserTabWorktree(tabId)
    }
    return
  }
  claimedTabs.set(tabId, { ...claim, pageUrl: url })
  await rememberBrowserTabWorktree(tabId, claim.worktreeId)
  await addTabToProjectGroup(tabId, claim.projectId, claim.displayName)
  if (await chrome.permissions.contains({ permissions: ['debugger'] })) {
    await startConsoleSensor(tabId).catch(() => {})
  }
}

async function saveWorkspacePortClaims(parsed: WorkspacePortClaim[]): Promise<void> {
  claims.clear()
  for (const claim of parsed) {
    claims.set(claim.port, claim)
  }
  await chrome.storage.session.set({ workspacePortClaims: parsed })
  await claimOpenPreviewTabs()
}

async function claimOpenPreviewTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({})
  await Promise.all(
    tabs.flatMap((tab) =>
      tab.id !== undefined && tab.url ? [claimPreviewTab(tab.id, tab.url)] : []
    )
  )
}

function parseClaims(value: unknown): WorkspacePortClaim[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const unique = new Map<number, WorkspacePortClaim | null>()
  for (const item of value) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof Reflect.get(item, 'port') !== 'number' ||
      !Number.isInteger(Reflect.get(item, 'port')) ||
      typeof Reflect.get(item, 'projectId') !== 'string' ||
      typeof Reflect.get(item, 'displayName') !== 'string' ||
      typeof Reflect.get(item, 'worktreeId') !== 'string'
    ) {
      return null
    }
    const port = Reflect.get(item, 'port')
    const displayName = Reflect.get(item, 'displayName')
    const projectId = Reflect.get(item, 'projectId')
    const worktreeId = Reflect.get(item, 'worktreeId')
    const existing = unique.get(port)
    const claim = { displayName, port, projectId, worktreeId }
    unique.set(
      port,
      existing === undefined ||
        (existing !== null &&
          existing.projectId === projectId &&
          existing.worktreeId === worktreeId)
        ? claim
        : null
    )
  }
  return [...unique.values()].flatMap((claim) => (claim === null ? [] : [claim]))
}

function localPreviewPort(rawUrl: string): number | null {
  try {
    const url = new URL(rawUrl)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
    ) {
      return null
    }
    return Number(url.port || (url.protocol === 'https:' ? 443 : 80))
  } catch {
    return null
  }
}

export function isClaimedPreviewUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false
  }
  const port = localPreviewPort(rawUrl)
  return port !== null && claims.has(port)
}
