import type { AppState } from '~renderer/store/types'

import {
  getBrowserPagesByWorkspace,
  getBrowserTabsByWorktree
} from './runtime-mobile-browser-state'
import { stableHashString } from './runtime-mobile-editor-tab'

type TabsProjectionCacheEntry = {
  tabs: NonNullable<AppState['tabsByWorktree'][string]>
  worktreeIdJson: string
  projection: string
}
type TabsProjectionCache = {
  source: AppState['tabsByWorktree']
  entries: Map<string, TabsProjectionCacheEntry>
  projection: string
}
type AgentStatusProjectionCacheEntry = {
  entry: AppState['agentStatusByPaneKey'][string]
  projection: string
}
type AgentStatusProjectionCache = {
  source: AppState['agentStatusByPaneKey']
  entries: Map<string, AgentStatusProjectionCacheEntry>
  projection: string
}

let cachedTabsProjection: TabsProjectionCache | null = null
let cachedAgentStatusProjection: AgentStatusProjectionCache | null = null
const AGENT_STATUS_SYNC_UPDATED_AT_BUCKET_MS = 30_000

export function buildRuntimeMobileTabsProjection(
  tabsByWorktree: AppState['tabsByWorktree']
): string {
  if (cachedTabsProjection?.source === tabsByWorktree) {
    return cachedTabsProjection.projection
  }

  const previousEntries = cachedTabsProjection?.entries
  const entries = new Map<string, TabsProjectionCacheEntry>()
  const parts: string[] = []

  for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
    const previous = previousEntries?.get(worktreeId)
    const entry =
      previous?.tabs === tabs
        ? previous
        : {
            tabs,
            worktreeIdJson: previous?.worktreeIdJson ?? JSON.stringify(worktreeId),
            projection: JSON.stringify(
              tabs.map((tab) => ({
                id: tab.id,
                title: tab.title,
                quickCommandLabel: tab.quickCommandLabel,
                generatedTitle: tab.generatedTitle,
                customTitle: tab.customTitle,
                launchAgent: tab.launchAgent
              }))
            )
          }
    entries.set(worktreeId, entry)
    parts.push(`${entry.worktreeIdJson}:${entry.projection}`)
  }

  cachedTabsProjection = {
    source: tabsByWorktree,
    entries,
    projection: `{${parts.join(',')}}`
  }
  return cachedTabsProjection.projection
}

export function buildRuntimeMobileOpenFilesProjection(openFiles: AppState['openFiles']): string {
  return JSON.stringify(
    openFiles.map((file) => ({
      id: file.id,
      filePath: file.filePath,
      relativePath: file.relativePath,
      worktreeId: file.worktreeId,
      language: file.language,
      mode: file.mode,
      diffSource: file.diffSource,
      isDirty: file.isDirty,
      isUntitled: file.isUntitled,
      deleteUntouchedOnClose: file.deleteUntouchedOnClose,
      markdownPreviewSourceFileId: file.markdownPreviewSourceFileId
    }))
  )
}

export function buildRuntimeMobileBrowserProjection(state: AppState): string {
  const browserTabsByWorktree = getBrowserTabsByWorktree(state)
  const browserPagesByWorkspace = getBrowserPagesByWorkspace(state)
  return JSON.stringify({
    workspacesByWorktree: Object.fromEntries(
      Object.entries(browserTabsByWorktree).map(([worktreeId, workspaces]) => [
        worktreeId,
        workspaces.map((workspace) => ({
          id: workspace.id,
          activePageId: workspace.activePageId,
          title: workspace.title,
          url: workspace.url,
          loading: workspace.loading,
          canGoBack: workspace.canGoBack,
          canGoForward: workspace.canGoForward
        }))
      ])
    ),
    pagesByWorkspace: Object.fromEntries(
      Object.entries(browserPagesByWorkspace).map(([workspaceId, pages]) => [
        workspaceId,
        pages.map((page) => ({
          id: page.id,
          title: page.title,
          url: page.url,
          loading: page.loading,
          canGoBack: page.canGoBack,
          canGoForward: page.canGoForward
        }))
      ])
    )
  })
}

export function buildRuntimeMobileEditorDraftsProjection(
  editorDrafts: AppState['editorDrafts']
): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(editorDrafts).map(([fileId, content]) => [fileId, stableHashString(content)])
    )
  )
}

function serializeRuntimeMobileAgentStatusEntry(
  paneKey: string,
  entry: AppState['agentStatusByPaneKey'][string]
): string {
  return JSON.stringify({
    paneKey,
    entryPaneKey: entry.paneKey,
    state: entry.state,
    prompt: entry.prompt,
    updatedAtBucket: Math.floor(entry.updatedAt / AGENT_STATUS_SYNC_UPDATED_AT_BUCKET_MS),
    stateStartedAt: entry.stateStartedAt,
    agentType: entry.agentType ?? null,
    terminalTitle: entry.terminalTitle ?? null,
    stateHistory: entry.stateHistory.map((history) => ({
      state: history.state,
      prompt: history.prompt,
      startedAt: history.startedAt,
      interrupted: history.interrupted ?? null
    })),
    toolName: entry.toolName ?? null,
    toolInput: entry.toolInput ?? null,
    interactivePrompt: entry.interactivePrompt ?? null,
    lastAssistantMessage: entry.lastAssistantMessage ?? null,
    interrupted: entry.interrupted ?? null
  })
}

export function buildRuntimeMobileAgentStatusProjection(
  agentStatusByPaneKey: AppState['agentStatusByPaneKey']
): string {
  if (cachedAgentStatusProjection?.source === agentStatusByPaneKey) {
    return cachedAgentStatusProjection.projection
  }

  // Why: one status update re-spreads the map but preserves every unrelated
  // entry, so cache those serialized rows instead of rebuilding all histories.
  const previousEntries = cachedAgentStatusProjection?.entries
  const entries = new Map<string, AgentStatusProjectionCacheEntry>()
  const parts: string[] = []
  for (const [paneKey, entry] of Object.entries(agentStatusByPaneKey).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const previous = previousEntries?.get(paneKey)
    const cached =
      previous?.entry === entry
        ? previous
        : { entry, projection: serializeRuntimeMobileAgentStatusEntry(paneKey, entry) }
    entries.set(paneKey, cached)
    parts.push(cached.projection)
  }
  const projection = `[${parts.join(',')}]`
  cachedAgentStatusProjection = { source: agentStatusByPaneKey, entries, projection }
  return projection
}
