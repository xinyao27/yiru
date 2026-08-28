import {
  configureExtensionBrowserCapabilities,
  type ExtensionBrowserCapabilities
} from './browser-capabilities'
import type { ExtensionPage, ExtensionWorkspaceTarget } from './navigation'
import { configureExtensionHostNavigation } from './navigation'
import { configureExtensionRuntime, type ExtensionRuntimeBootstrap } from './runtime/session'
import {
  mountExtensionConnecting,
  mountExtensionUnavailable,
  type ExtensionUnavailableActions,
  type ExtensionUnavailableReason
} from './unavailable'

type ExtensionSurface = 'side-panel' | 'workspace'

export type ExtensionClientOptions = {
  browserCapabilities: ExtensionBrowserCapabilities
  openExternalUrl: (target: { projectId?: string; url: string }) => Promise<void>
  openPage: (page: ExtensionPage) => void
  openWorkspace: (target: ExtensionWorkspaceTarget) => void
  publishAgentAttention: (count: number) => void
  readActivePageUrl: () => Promise<string | null>
  surface: ExtensionSurface
}

export async function mountExtensionClient(
  bootstrap: ExtensionRuntimeBootstrap,
  options: ExtensionClientOptions
): Promise<void> {
  Reflect.set(globalThis, '__YIRU_EXTENSION_CLIENT__', true)
  configureExtensionRuntime(bootstrap)
  configureExtensionBrowserCapabilities(options.browserCapabilities)
  configureExtensionHostNavigation({
    openExternalUrl: options.openExternalUrl,
    openPage: options.openPage,
    openWorkspace: options.openWorkspace,
    publishAgentAttention: options.publishAgentAttention,
    readActivePageUrl: options.readActivePageUrl
  })
  if (options.surface === 'workspace') {
    const { mountExtensionWorkbench } = await import('./workbench/bootstrap')
    mountExtensionWorkbench(bootstrap)
    return
  }
  const { mountExtensionSidePanel } = await import('./side-panel/bootstrap')
  mountExtensionSidePanel(bootstrap)
}

export type {
  BrowserAiStatus,
  BrowserContextPayload,
  BrowserPerformanceCapture,
  BrowserProjectBookmark,
  BrowserProjectBookmarkKind,
  BrowserReplayCapture,
  BrowserTabProjectionEvent,
  BrowserWorkspacePreferences,
  ExtensionBrowserCapabilities
} from './browser-capabilities'
export { mountExtensionConnecting, mountExtensionUnavailable }
export type { ExtensionUnavailableActions, ExtensionUnavailableReason }
