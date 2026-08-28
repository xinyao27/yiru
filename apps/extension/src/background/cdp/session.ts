export type CdpOwner =
  | 'browser-capture'
  | 'browser-environment'
  | 'browser-intercept'
  | 'browser-use'
  | 'console-sensor'
  | 'network-mock'
  | 'pdf-export'
  | 'performance-audit'
  | 'recorder'
  | 'visual-capture'

type CdpEventListener = (tabId: number, method: string, params: Record<string, unknown>) => void

const ownersByTab = new Map<number, Set<CdpOwner>>()
const listeners = new Set<CdpEventListener>()
let hasRegisteredChromeListeners = false

export function registerCdpSessionListeners(): void {
  if (!chrome.debugger || hasRegisteredChromeListeners) {
    return
  }
  hasRegisteredChromeListeners = true
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId === undefined) {
      return
    }
    const eventParams: Record<string, unknown> = params ?? {}
    for (const listener of listeners) {
      listener(source.tabId, method, eventParams)
    }
  })

  chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId !== undefined) {
      ownersByTab.delete(source.tabId)
    }
  })
}

export async function acquireCdp(tabId: number, owner: CdpOwner): Promise<void> {
  registerCdpSessionListeners()
  let owners = ownersByTab.get(tabId)
  if (!owners) {
    await chrome.debugger.attach({ tabId }, '1.3')
    owners = new Set()
    ownersByTab.set(tabId, owners)
  }
  owners.add(owner)
}

export async function releaseCdp(tabId: number, owner: CdpOwner): Promise<void> {
  const owners = ownersByTab.get(tabId)
  if (!owners) {
    return
  }
  owners.delete(owner)
  if (owners.size > 0) {
    return
  }
  ownersByTab.delete(tabId)
  await chrome.debugger.detach({ tabId }).catch(() => {})
}

export function subscribeCdp(listener: CdpEventListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function sendCdp(
  tabId: number,
  method: string,
  commandParams?: Record<string, unknown>
): Promise<unknown> {
  return chrome.debugger.sendCommand({ tabId }, method, commandParams)
}
