import type {
  BrowserPageRegisterInput,
  BrowserPageUnregisterInput
} from '@yiru/runtime-protocol/contract'

import type { AgentBrowserBridge } from '../agent-browser-bridge'
import { browserManager } from '../manager'

let agentBrowserBridgeRef: AgentBrowserBridge | null = null

const pendingTabRegistrations = new Map<string, Set<() => void>>()
const pendingWorktreeTabRegistrations = new Map<string, Set<() => void>>()
const pendingAnyTabRegistrations = new Set<() => void>()

function waitForRegistrationSet(
  registrationResolvers: Set<() => void>,
  timeoutMs: number,
  onEmpty: () => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const resolveRegistration = (): void => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      registrationResolvers.delete(resolveRegistration)
      if (registrationResolvers.size === 0) {
        onEmpty()
      }
      reject(new Error('Tab registration timed out'))
    }, timeoutMs)
    registrationResolvers.add(resolveRegistration)
  })
}

function resolvePendingRegistrations(registrationResolvers: Set<() => void> | undefined): void {
  if (!registrationResolvers) {
    return
  }
  for (const pendingResolve of registrationResolvers) {
    pendingResolve()
  }
}

function hasRegisteredTabForWorktree(worktreeId: string): boolean {
  return browserManager
    .getPages()
    .some(
      (page) =>
        browserManager.getWorktreeIdForTab(page.identity.browserPageId) === worktreeId &&
        !page.isClosed()
    )
}

export function waitForTabRegistration(browserPageId: string, timeoutMs = 8_000): Promise<void> {
  if (browserManager.getPage(browserPageId)) {
    return Promise.resolve()
  }
  let registrationResolvers = pendingTabRegistrations.get(browserPageId)
  if (!registrationResolvers) {
    registrationResolvers = new Set()
    pendingTabRegistrations.set(browserPageId, registrationResolvers)
  }
  return waitForRegistrationSet(registrationResolvers, timeoutMs, () => {
    pendingTabRegistrations.delete(browserPageId)
  })
}

export function waitForWorktreeTabRegistration(
  worktreeId: string | undefined,
  timeoutMs = 8_000
): Promise<void> {
  if (!worktreeId) {
    return waitForAnyTabRegistration(timeoutMs)
  }
  if (hasRegisteredTabForWorktree(worktreeId)) {
    return Promise.resolve()
  }
  let registrationResolvers = pendingWorktreeTabRegistrations.get(worktreeId)
  if (!registrationResolvers) {
    registrationResolvers = new Set()
    pendingWorktreeTabRegistrations.set(worktreeId, registrationResolvers)
  }
  return waitForRegistrationSet(registrationResolvers, timeoutMs, () => {
    pendingWorktreeTabRegistrations.delete(worktreeId)
  })
}

export function waitForAnyTabRegistration(timeoutMs = 8_000): Promise<void> {
  if (browserManager.getPages().some((page) => !page.isClosed())) {
    return Promise.resolve()
  }
  return waitForRegistrationSet(pendingAnyTabRegistrations, timeoutMs, () => {})
}

export function setAgentBrowserBridgeRef(bridge: AgentBrowserBridge | null): void {
  agentBrowserBridgeRef = bridge
}

export async function registerBrowserPage(
  input: BrowserPageRegisterInput,
  shellConnectionId: string
): Promise<boolean> {
  const previousBackendPageId = browserManager.getPage(input.browserPageId)?.identity.backendPageId
  const registered = await browserManager.registerGuest({
    ...input,
    rendererOwnerId: shellConnectionId,
    shellConnectionId
  })
  if (!registered) {
    return false
  }
  if (
    agentBrowserBridgeRef &&
    previousBackendPageId !== undefined &&
    previousBackendPageId !== input.backendPageId
  ) {
    agentBrowserBridgeRef.onProcessSwap(input.browserPageId)
  }
  const pendingPageResolves = pendingTabRegistrations.get(input.browserPageId)
  pendingTabRegistrations.delete(input.browserPageId)
  resolvePendingRegistrations(pendingPageResolves)
  const pendingWorktreeResolves = pendingWorktreeTabRegistrations.get(input.worktreeId)
  pendingWorktreeTabRegistrations.delete(input.worktreeId)
  resolvePendingRegistrations(pendingWorktreeResolves)
  const pendingAnyResolves = new Set(pendingAnyTabRegistrations)
  pendingAnyTabRegistrations.clear()
  resolvePendingRegistrations(pendingAnyResolves)
  return true
}

export function unregisterBrowserPage(
  input: BrowserPageUnregisterInput,
  shellConnectionId: string
): boolean {
  const page = browserManager.getPage(input.browserPageId)
  if (page && page.identity.shellConnectionId !== shellConnectionId) {
    return false
  }
  if (page?.identity.backendPageId !== input.expectedBackendPageId) {
    return browserManager.cancelPendingRendererGuestRegistration(
      input.browserPageId,
      input.expectedBackendPageId,
      shellConnectionId
    )
  }
  agentBrowserBridgeRef?.onTabClosed(input.browserPageId)
  return browserManager.unregisterRendererGuest(input.browserPageId, input.expectedBackendPageId)
}

export function setActiveBrowserPage(browserPageId: string, shellConnectionId: string): boolean {
  if (
    !agentBrowserBridgeRef ||
    !browserManager.getAuthorizedPage(browserPageId, shellConnectionId)
  ) {
    return false
  }
  agentBrowserBridgeRef.onTabChanged(
    browserPageId,
    browserManager.getWorktreeIdForTab(browserPageId)
  )
  return true
}
