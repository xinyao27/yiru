import type { StateCreator } from 'zustand'
import { getExtensionBrowserCapabilities } from '~renderer/extension/browser-capabilities'
import { shellClient } from '~renderer/runtime/shell-client'
import type { AppState } from '~renderer/store/types'

import {
  buildBrowserPagePatch,
  buildBrowserWorkspaceStage,
  buildHostBrowserTabRemoval,
  buildHostBrowserTabUpsert,
  createNativeChromeTabRecord,
  findBrowserWorkspace
} from './records'
import type { BrowserSlice, CreateBrowserTabOptions, HostBrowserTabProjection } from './types'

export const createBrowserSlice: StateCreator<AppState, [], [], BrowserSlice> = (set, get) => ({
  browserTabsByWorktree: {},
  browserPagesByWorkspace: {},
  browserCertificateFailuresByPageId: {},
  remoteBrowserPageHandlesByPageId: {},
  activeBrowserTabId: null,
  activeBrowserTabIdByWorktree: {},
  upsertHostBrowserTab: (projection) => {
    let workspace = createNativeChromeTabRecord(projection.worktreeId, projection.url)
    set((state) => {
      const result = buildHostBrowserTabUpsert(state, projection)
      workspace = result.workspace
      return result.patch
    })
    synchronizeBrowserUnifiedTab(get, workspace, projection)
    return workspace
  },
  removeHostBrowserTab: (browserIdentifier) => {
    const owningWorkspace = findBrowserWorkspace(get(), browserIdentifier)?.workspace ?? null
    set((state) => buildHostBrowserTabRemoval(state, browserIdentifier))
    if (!owningWorkspace) {
      return
    }
    const unifiedTab = Object.values(get().unifiedTabsByWorktree)
      .flat()
      .find((tab) => tab.contentType === 'browser' && tab.entityId === owningWorkspace.id)
    if (unifiedTab) {
      get().closeUnifiedTab(unifiedTab.id, { recordInteraction: false })
    }
  },
  createBrowserTab: (worktreeId, url, options) => {
    const workspace = createNativeChromeTabRecord(worktreeId, url, options)
    if (options?.browserRuntimeEnvironmentId && options.pageId) {
      return get().upsertHostBrowserTab({
        browserPageId: options.pageId,
        browserRuntimeEnvironmentId: options.browserRuntimeEnvironmentId,
        workspaceId: workspace.id,
        worktreeId,
        url,
        title: options.title ?? url,
        activate: options.activate,
        targetGroupId: options.targetGroupId
      })
    }
    set((state) => buildBrowserWorkspaceStage(state, workspace, options?.activate ?? true))
    synchronizeBrowserUnifiedTab(get, workspace, {
      activate: options?.activate ?? true,
      targetGroupId: options?.targetGroupId
    })
    void createProjectedChromeTab(workspace, options, get).catch(async () => {
      get().removeHostBrowserTab(workspace.id)
      await shellClient.shell.openUrl(url)
    })
    return workspace
  },
  openNewBrowserTabInActiveWorkspace: async (groupId) => {
    const worktreeId = get().activeWorktreeId
    if (!worktreeId) {
      return
    }
    get().createBrowserTab(worktreeId, get().browserDefaultUrl ?? 'about:blank', {
      activate: true,
      targetGroupId: groupId
    })
  },
  closeBrowserTab: (tabId) => {
    const pageId = get().browserPagesByWorkspace[tabId]?.[0]?.id ?? tabId
    if (pageId.startsWith('chrome-tab:')) {
      void getExtensionBrowserCapabilities()
        .executeBrowserCommand('browser.tabClose', { page: pageId })
        .catch(() => undefined)
    }
    get().removeHostBrowserTab(tabId)
  },
  shutdownWorktreeBrowsers: async (worktreeId) => {
    const tabIds = (get().browserTabsByWorktree[worktreeId] ?? []).map((tab) => tab.id)
    await Promise.all(
      tabIds.flatMap((tabId) =>
        tabId.startsWith('chrome-tab:')
          ? [
              getExtensionBrowserCapabilities()
                .executeBrowserCommand('browser.tabClose', { page: tabId })
                .catch(() => undefined)
            ]
          : []
      )
    )
    for (const tabId of tabIds) {
      get().removeHostBrowserTab(tabId)
    }
  },
  setActiveBrowserTab: (tabId) => {
    const worktreeId = Object.entries(get().browserTabsByWorktree).find(([, workspaces]) =>
      workspaces.some((workspace) => workspace.id === tabId)
    )?.[0]
    if (!worktreeId) {
      return
    }
    set((state) => ({
      activeBrowserTabId: tabId,
      activeBrowserTabIdByWorktree: {
        ...state.activeBrowserTabIdByWorktree,
        [worktreeId]: tabId
      }
    }))
  },
  focusBrowserTabInWorktree: (worktreeId, browserPageId, options) => {
    const workspace = (get().browserTabsByWorktree[worktreeId] ?? []).find((tab) =>
      (get().browserPagesByWorkspace[tab.id] ?? []).some((page) => page.id === browserPageId)
    )
    if (!workspace) {
      return
    }
    get().setActiveBrowserTab(workspace.id)
    if (options?.surfacePane) {
      set((state) => ({
        activeTabType: state.activeWorktreeId === worktreeId ? 'browser' : state.activeTabType,
        activeTabTypeByWorktree: {
          ...state.activeTabTypeByWorktree,
          [worktreeId]: 'browser'
        }
      }))
    }
    if (browserPageId.startsWith('chrome-tab:')) {
      void getExtensionBrowserCapabilities()
        .executeBrowserCommand('browser.tabSwitch', { page: browserPageId })
        .catch(() => undefined)
    }
  },
  updateBrowserPageState: (pageId, updates) =>
    set((state) => buildBrowserPagePatch(state, pageId, updates)),
  setBrowserPageUrl: (pageId, url) => {
    set((state) => {
      let owningWorkspaceId: string | null = null
      const browserPagesByWorkspace = Object.fromEntries(
        Object.entries(state.browserPagesByWorkspace).map(([workspaceId, pages]) => [
          workspaceId,
          pages.map((page) => {
            if (page.id !== pageId) {
              return page
            }
            owningWorkspaceId = workspaceId
            return { ...page, url }
          })
        ])
      )
      if (!owningWorkspaceId) {
        return {}
      }
      return {
        browserPagesByWorkspace,
        browserTabsByWorktree: Object.fromEntries(
          Object.entries(state.browserTabsByWorktree).map(([worktreeId, workspaces]) => [
            worktreeId,
            workspaces.map((workspace) =>
              workspace.id === owningWorkspaceId ? { ...workspace, url } : workspace
            )
          ])
        )
      }
    })
  },
  setRemoteBrowserPageHandle: (pageId, handle) => {
    set((state) => ({
      remoteBrowserPageHandlesByPageId: {
        ...state.remoteBrowserPageHandlesByPageId,
        [pageId]: handle
      }
    }))
  },
  hydrateBrowserSession: () => {
    set({
      browserTabsByWorktree: {},
      browserPagesByWorkspace: {},
      activeBrowserTabId: null,
      activeBrowserTabIdByWorktree: {}
    })
  },
  browserUrlHistory: []
})

async function createProjectedChromeTab(
  workspace: ReturnType<typeof createNativeChromeTabRecord>,
  options: CreateBrowserTabOptions | undefined,
  get: () => AppState
): Promise<void> {
  const result = await getExtensionBrowserCapabilities().executeBrowserCommand(
    'browser.tabCreate',
    {
      activate: options?.activate ?? true,
      url: workspace.url,
      worktree: `id:${workspace.worktreeId}`
    }
  )
  const browserPageId = readBrowserPageId(result)
  if (!browserPageId) {
    return
  }
  get().upsertHostBrowserTab({
    browserPageId,
    workspaceId: workspace.id,
    worktreeId: workspace.worktreeId,
    url: workspace.url,
    title: options?.title ?? workspace.url,
    activate: options?.activate ?? true,
    targetGroupId: options?.targetGroupId
  })
}

function synchronizeBrowserUnifiedTab(
  get: () => AppState,
  workspace: ReturnType<typeof createNativeChromeTabRecord>,
  projection: Pick<HostBrowserTabProjection, 'activate' | 'targetGroupId'>
): void {
  const state = get()
  let unifiedTab = (state.unifiedTabsByWorktree[workspace.worktreeId] ?? []).find(
    (tab) => tab.contentType === 'browser' && tab.entityId === workspace.id
  )
  if (!unifiedTab) {
    unifiedTab = state.createUnifiedTab(workspace.worktreeId, 'browser', {
      entityId: workspace.id,
      label: workspace.title,
      activate: projection.activate ?? true,
      recordInteraction: false,
      ...(projection.targetGroupId ? { targetGroupId: projection.targetGroupId } : {})
    })
  } else if (unifiedTab.label !== workspace.title) {
    state.setTabLabel(unifiedTab.id, workspace.title)
  }
  if (projection.activate) {
    get().activateTab(unifiedTab.id)
    if (get().activeWorktreeId === workspace.worktreeId) {
      get().setActiveBrowserTab(workspace.id)
      get().setActiveTabType('browser')
    }
  }
}

function readBrowserPageId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const browserPageId = Reflect.get(value, 'browserPageId')
  return typeof browserPageId === 'string' && browserPageId.length > 0 ? browserPageId : null
}
