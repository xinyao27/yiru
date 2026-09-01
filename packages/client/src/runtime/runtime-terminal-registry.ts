import { resolveLeafIdForManager } from '~renderer/terminal-pane/pane-manager/pane-key-resolution'
import type { PaneManager } from '~renderer/terminal-pane/pane-manager/pane-manager'

export type RegisteredRuntimeTerminalTab = {
  tabId: string
  worktreeId: string
  getManager: () => PaneManager | null
  getContainer: () => HTMLDivElement | null
  getPtyIdForPane: (paneId: number) => string | null
}

type RegisteredRuntimeTerminal = {
  tab: RegisteredRuntimeTerminalTab
  registeredAt: number
}

const registeredTerminals = new Map<string, RegisteredRuntimeTerminal>()

export function hasRegisteredRuntimeTerminalTab(tabId: string): boolean {
  return registeredTerminals.has(tabId)
}

export function getRegisteredRuntimeTerminalTab(
  tabId: string
): RegisteredRuntimeTerminalTab | null {
  return registeredTerminals.get(tabId)?.tab ?? null
}

export function getRegisteredRuntimeTerminalTabs(): IterableIterator<
  [string, RegisteredRuntimeTerminal]
> {
  return registeredTerminals.entries()
}

export function registerRuntimeTerminalTab(
  tab: RegisteredRuntimeTerminalTab,
  onRegistryChange: () => void
): () => void {
  const registration = { tab, registeredAt: Date.now() }
  registeredTerminals.set(tab.tabId, registration)
  onRegistryChange()
  return () => {
    // Why: React can mount a replacement surface before the prior effect
    // cleans up. Stale cleanup must not erase the successor's live registry.
    if (registeredTerminals.get(tab.tabId) !== registration) {
      return
    }
    registeredTerminals.delete(tab.tabId)
    onRegistryChange()
  }
}

export function focusRuntimeTerminalSurface(
  tabId: string,
  leafId: string | null | undefined,
  onRegistryChange: () => void
): boolean {
  const manager = getRegisteredRuntimeTerminalTab(tabId)?.getManager()
  if (!manager) {
    return false
  }
  if (!leafId) {
    manager.getActivePane()?.terminal.focus()
    return true
  }
  const resolution = resolveLeafIdForManager(tabId, leafId, manager)
  if (resolution.status !== 'resolved') {
    return false
  }
  manager.setActivePane(resolution.numericPaneId, { focus: true })
  onRegistryChange()
  return true
}
