import type {
  RuntimeMobileSessionTerminalClientTab,
  RuntimeMobileSessionTabsResult
} from '@yiru/runtime-protocol/workbench/runtime-types'
import { toHostSessionTabId } from '~renderer/runtime/web-terminal-surface-id'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import type { RuntimePtyTransportOptions } from './pty/transport-types'
import type { RemoteRuntimePtyState } from './remote-runtime-pty-state'

const HOST_SESSION_ATTACH_POLL_MS = 150
const HOST_SESSION_ATTACH_TIMEOUT_MS = 15_000

export class RemoteRuntimePtyHostSession {
  private readonly state: RemoteRuntimePtyState
  private readonly worktreeId: string | undefined
  private readonly leafId: string | undefined

  constructor(state: RemoteRuntimePtyState, options: RuntimePtyTransportOptions) {
    this.state = state
    this.worktreeId = options.worktreeId
    this.leafId = options.leafId
  }

  async waitForHandle(tabId: string): Promise<string | null> {
    if (!this.worktreeId) {
      return null
    }
    const hostTabId = toHostSessionTabId(tabId)
    const worktree = toRuntimeWorktreeSelector(this.worktreeId)
    const activated = await this.state.callRuntime<RuntimeMobileSessionTabsResult>(
      'session.tabs.activate',
      {
        worktree,
        tabId: hostTabId,
        ...(this.leafId ? { leafId: this.leafId } : {})
      }
    )
    const immediate = this.findReadyHandle(activated, hostTabId)
    if (immediate) {
      return immediate
    }

    const startedAt = Date.now()
    while (!this.state.destroyed) {
      const remainingMs = HOST_SESSION_ATTACH_TIMEOUT_MS - (Date.now() - startedAt)
      if (remainingMs <= 0) {
        return null
      }
      // Why: host mirrors can be published before their PTY handle is ready,
      // but a stuck pending surface must not poll the runtime forever.
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(HOST_SESSION_ATTACH_POLL_MS, remainingMs))
      )
      const listed = await this.state.callRuntime<RuntimeMobileSessionTabsResult>(
        'session.tabs.list',
        { worktree }
      )
      const handle = this.findReadyHandle(listed, hostTabId)
      if (handle) {
        return handle
      }
      if (!this.hasSurface(listed, hostTabId)) {
        return null
      }
    }
    return null
  }

  async listHandle(tabId: string): Promise<string | null> {
    if (!this.worktreeId) {
      return null
    }
    const hostTabId = toHostSessionTabId(tabId)
    const listed = await this.state.callRuntime<RuntimeMobileSessionTabsResult>(
      'session.tabs.list',
      { worktree: toRuntimeWorktreeSelector(this.worktreeId) }
    )
    return this.findReadyHandle(listed, hostTabId)
  }

  private findReadyHandle(
    snapshot: RuntimeMobileSessionTabsResult,
    hostTabId: string
  ): string | null {
    const terminalTabs = this.getSurfaces(snapshot, hostTabId, false)
    if (this.leafId) {
      const requestedLeaf = terminalTabs.find(
        (tab) =>
          tab.status === 'ready' && tab.parentTabId === hostTabId && tab.leafId === this.leafId
      )
      return requestedLeaf?.terminal ?? null
    }
    const preferred =
      terminalTabs.find(
        (tab) => tab.status === 'ready' && tab.parentTabId === hostTabId && tab.isActive
      ) ?? terminalTabs.find((tab) => tab.status === 'ready' && tab.parentTabId === hostTabId)
    return preferred?.terminal ?? null
  }

  private hasSurface(snapshot: RuntimeMobileSessionTabsResult, hostTabId: string): boolean {
    return this.getSurfaces(snapshot, hostTabId, true).length > 0
  }

  private getSurfaces(
    snapshot: RuntimeMobileSessionTabsResult,
    hostTabId: string,
    matchRequestedLeaf: boolean
  ): RuntimeMobileSessionTerminalClientTab[] {
    return snapshot.tabs.filter(
      (tab): tab is RuntimeMobileSessionTerminalClientTab =>
        tab.type === 'terminal' &&
        (tab.parentTabId === hostTabId || tab.id === hostTabId) &&
        (!matchRequestedLeaf || !this.leafId || tab.leafId === this.leafId)
    )
  }
}
