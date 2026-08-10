import type {
  ShellServicesBrowserTabCloseInput,
  ShellServicesBrowserTabCloseOutput,
  ShellServicesBrowserTabCreateInput,
  ShellServicesBrowserTabCreateOutput,
  ShellServicesBrowserTabSetProfileInput,
  ShellServicesBrowserTabSetProfileOutput
} from '@yiru/runtime-protocol/contract'
import {
  acquireBrowserAutomationBootstrapLease,
  isRuntimeEnvironmentActive
} from '~renderer/application-shell/use-ipc-events'
import { translate } from '~renderer/i18n/i18n'
import { destroyPersistentWebview } from '~renderer/runtime/browser-webview-registry'
import { useAppStore } from '~renderer/store'
import {
  guardPinnedTabClose,
  isUnifiedTabPinned,
  resolvePinnedTabLabel
} from '~renderer/store/pinned-tab-close-guard'

// Why: Phase 5 slice S6 (切片 47) — implements the `shellServices.browser.*`
// reverse-contract handlers (see shell-services-handler.ts). This is the exact
// logic the removed `onRequestTabCreate` IPC listener in use-ipc-events.ts
// used to run; moved here so that heavily-contested file only keeps its
// subscription wiring, not this feature's business logic.
export function createBrowserTabViaShell(
  input: ShellServicesBrowserTabCreateInput
): ShellServicesBrowserTabCreateOutput {
  if (isRuntimeEnvironmentActive()) {
    // Why: browser automation targets client-local Electron webviews. Runtime
    // agents cannot see or control those surfaces.
    throw new Error(
      translate(
        'auto.hooks.useIpcEvents.291c8ed902',
        'Browser tabs are unavailable while a remote runtime is active'
      )
    )
  }
  const store = useAppStore.getState()
  const worktreeId = input.worktreeId ?? store.activeWorktreeId
  if (!worktreeId) {
    throw new Error(translate('auto.hooks.useIpcEvents.f000b2ff76', 'No active worktree'))
  }
  // Why: CLI-created tabs should land in the same group as the active browser
  // tab, not the terminal's group (which is typically the UI-active group
  // when an agent is running commands).
  const activeBrowserTabId = store.activeBrowserTabIdByWorktree[worktreeId]
  const activeBrowserUnifiedTab = activeBrowserTabId
    ? (store.unifiedTabsByWorktree[worktreeId] ?? []).find(
        (t) => t.contentType === 'browser' && t.entityId === activeBrowserTabId
      )
    : undefined

  // Why: a user-initiated open (input.activate, e.g. mobile tapping an HTML
  // path) foregrounds the tab so it lands in the active group's order and
  // publishes to mobile in the right place. Agent/automation opens stay in
  // the background (activate:false) in the active browser group.
  const workspace = store.createBrowserTab(worktreeId, input.url, {
    title: input.url,
    targetGroupId: input.activate ? undefined : activeBrowserUnifiedTab?.groupId,
    sessionProfileId: input.sessionProfileId,
    sessionPartition: input.sessionPartition,
    activate: input.activate === true
  })
  // Why: registerGuest fires with the page ID (not workspace ID) as
  // browserPageId. Return the page ID so waitForTabRegistration can
  // correlate correctly.
  const pages = useAppStore.getState().browserPagesByWorkspace[workspace.id] ?? []
  const browserPageId = pages[0]?.id ?? workspace.id
  acquireBrowserAutomationBootstrapLease(worktreeId, browserPageId)
  return { browserPageId }
}

export function setBrowserTabProfileViaShell(
  input: ShellServicesBrowserTabSetProfileInput
): ShellServicesBrowserTabSetProfileOutput {
  if (isRuntimeEnvironmentActive()) {
    throw new Error(
      translate(
        'auto.hooks.useIpcEvents.f45fa2b03c',
        'Browser profiles are unavailable while a remote runtime is active'
      )
    )
  }
  const store = useAppStore.getState()
  const owningWorkspace = Object.values(store.browserTabsByWorktree)
    .flat()
    .find((workspace) => {
      if (workspace.id === input.browserPageId) {
        return true
      }
      const pages = store.browserPagesByWorkspace[workspace.id] ?? []
      return pages.some((page) => page.id === input.browserPageId)
    })
  if (!owningWorkspace) {
    throw new Error(
      translate('auto.hooks.useIpcEvents.0e3cf53060', 'Browser tab {{value0}} not found', {
        value0: input.browserPageId
      })
    )
  }
  // Why: a workspace can host multiple browser pages; profile switch must
  // tear down every sibling webview, not just the one referenced by the call.
  const workspacePages = store.browserPagesByWorkspace[owningWorkspace.id] ?? []
  if (workspacePages.length > 0) {
    for (const page of workspacePages) {
      destroyPersistentWebview(page.id)
    }
  } else {
    destroyPersistentWebview(input.browserPageId)
  }
  store.switchBrowserTabProfile(owningWorkspace.id, input.profileId, input.sessionPartition)
  return { updated: true }
}

// Why: guardPinnedTabClose's confirmation can resolve asynchronously (the
// user answering a dialog), so this wraps the same branching the removed
// `onRequestTabClose` listener ran in a Promise instead of a callback-style
// reply. See the design note above `ShellServicesBrowserTabCloseInputSchema`
// in contract/shell-services.ts for why the reverse call keeps a fixed 10s
// budget rather than waiting out that confirmation indefinitely.
export function closeBrowserTabViaShell(
  input: ShellServicesBrowserTabCloseInput
): Promise<ShellServicesBrowserTabCloseOutput> {
  return new Promise((resolve, reject) => {
    try {
      if (isRuntimeEnvironmentActive()) {
        reject(
          new Error(
            translate(
              'auto.hooks.useIpcEvents.291c8ed902',
              'Browser tabs are unavailable while a remote runtime is active'
            )
          )
        )
        return
      }
      const store = useAppStore.getState()
      const explicitTargetId = input.tabId ?? null
      const rejectPinned = (tabId: string): void => {
        reject(
          new Error(
            translate('auto.hooks.useIpcEvents.2f6637fe6c', 'Browser tab {{value0}} is pinned', {
              value0: tabId
            })
          )
        )
      }
      const closeBrowserWorkspace = (worktreeId: string, workspaceId: string): void => {
        const currentStore = useAppStore.getState()
        guardPinnedTabClose({
          isPinned: isUnifiedTabPinned(currentStore, worktreeId, workspaceId),
          tabLabel: resolvePinnedTabLabel(currentStore, worktreeId, workspaceId),
          onClose: () => {
            useAppStore.getState().closeBrowserTab(workspaceId)
            resolve({ closed: true })
          },
          onCancel: () => rejectPinned(workspaceId)
        })
      }
      const tabToClose =
        explicitTargetId ??
        (input.worktreeId
          ? (store.activeBrowserTabIdByWorktree?.[input.worktreeId] ?? null)
          : store.activeBrowserTabId)
      if (!tabToClose) {
        reject(
          new Error(
            translate('auto.hooks.useIpcEvents.a8d2bf8e9e', 'No active browser tab to close')
          )
        )
        return
      }
      // Why: the bridge stores tabs keyed by browserPageId (which is the page
      // ID from registerGuest), but closeBrowserTab expects a workspace ID. If
      // tabToClose is a page ID, close only that page unless it is the last
      // page in its workspace. The CLI's `tab close --page` contract targets
      // one browser page, not the entire workspace tab.
      const isWorkspaceId = Object.values(store.browserTabsByWorktree)
        .flat()
        .some((ws) => ws.id === tabToClose)
      if (!isWorkspaceId) {
        const owningWorkspace = Object.entries(store.browserPagesByWorkspace).find(([, pages]) =>
          pages.some((p) => p.id === tabToClose)
        )
        if (owningWorkspace) {
          const [workspaceId, pages] = owningWorkspace
          if (pages.length <= 1) {
            const owningWorktreeId =
              Object.entries(store.browserTabsByWorktree).find(([, tabs]) =>
                tabs.some((tab) => tab.id === workspaceId)
              )?.[0] ?? null
            if (owningWorktreeId) {
              closeBrowserWorkspace(owningWorktreeId, workspaceId)
              return
            }
            store.closeBrowserTab(workspaceId)
          } else {
            store.closeBrowserPage(tabToClose)
          }
          resolve({ closed: true })
          return
        }
      }
      const owningWorktreeId =
        Object.entries(store.browserTabsByWorktree).find(([, tabs]) =>
          tabs.some((tab) => tab.id === tabToClose)
        )?.[0] ?? null
      if (owningWorktreeId) {
        closeBrowserWorkspace(owningWorktreeId, tabToClose)
        return
      }
      if (explicitTargetId) {
        reject(
          new Error(
            translate('auto.hooks.useIpcEvents.0e3cf53060', 'Browser tab {{value0}} not found', {
              value0: explicitTargetId
            })
          )
        )
        return
      }
      store.closeBrowserTab(tabToClose)
      resolve({ closed: true })
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Tab close failed'))
    }
  })
}
