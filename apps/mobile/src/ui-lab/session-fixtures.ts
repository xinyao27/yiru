import type { AgentStatusEntry, NativeChatMessage } from '@yiru/workbench-model/agent'

import {
  UI_LAB_CHAT_MESSAGES,
  UI_LAB_SESSION_ID,
  UI_LAB_TERMINAL_HANDLE,
  UI_LAB_TERMINAL_TAB_ID,
  UI_LAB_WORKTREE_ID,
  type MobileUiLabScenarioId
} from './fixtures'

const UI_LAB_MARKDOWN_TAB_ID = 'ui-lab-markdown-tab'
const UI_LAB_BROWSER_TAB_ID = 'ui-lab-browser-tab'

function agentStatus(scenario: MobileUiLabScenarioId): AgentStatusEntry {
  const state = scenario === 'working' ? 'working' : scenario === 'permission' ? 'blocked' : 'done'
  return {
    state,
    prompt: 'Review the mobile Markdown renderer.',
    updatedAt: 3,
    stateStartedAt: 2,
    agentType: 'codex',
    paneKey: 'ui-lab-tab:ui-lab-leaf',
    terminalHandle: UI_LAB_TERMINAL_HANDLE,
    worktreeId: UI_LAB_WORKTREE_ID,
    tabId: UI_LAB_TERMINAL_TAB_ID,
    stateHistory: [],
    providerSession: { key: 'session_id', id: UI_LAB_SESSION_ID },
    ...(scenario === 'working'
      ? {
          lastAssistantMessage:
            'I’m checking the final layout and streaming this response into the transcript…'
        }
      : {}),
    ...(scenario === 'permission'
      ? {
          toolName: 'Edit',
          toolInput: 'apps/mobile/src/components/markdown.tsx',
          interactivePrompt: JSON.stringify({
            approval: {
              tool: 'Edit',
              summary: 'Update apps/mobile/src/components/markdown.tsx'
            }
          })
        }
      : {})
  }
}

export function uiLabSessionTabs(scenario: MobileUiLabScenarioId) {
  const markdownActive = scenario === 'markdown'
  const browserActive = scenario === 'browser'
  return {
    worktree: UI_LAB_WORKTREE_ID,
    publicationEpoch: 'ui-lab',
    snapshotVersion: 1,
    tabs: [
      {
        type: 'terminal' as const,
        id: UI_LAB_TERMINAL_TAB_ID,
        title: 'Codex fixture',
        terminal: UI_LAB_TERMINAL_HANDLE,
        launchAgent: 'codex' as const,
        agentStatus: agentStatus(scenario),
        isActive: !markdownActive && !browserActive
      },
      {
        type: 'markdown' as const,
        id: UI_LAB_MARKDOWN_TAB_ID,
        title: 'markdown-fixture.md',
        filePath: 'markdown-fixture.md',
        relativePath: 'markdown-fixture.md',
        isDirty: false,
        isActive: markdownActive,
        documentVersion: 'ui-lab-v1'
      },
      {
        type: 'browser' as const,
        id: UI_LAB_BROWSER_TAB_ID,
        title: 'Yiru UI Lab',
        browserWorkspaceId: UI_LAB_WORKTREE_ID,
        browserPageId: 'ui-lab-browser-page',
        url: 'https://yiru.app/ui-lab',
        loading: false,
        canGoBack: true,
        canGoForward: false,
        isActive: browserActive
      }
    ],
    activeTabId: markdownActive
      ? UI_LAB_MARKDOWN_TAB_ID
      : browserActive
        ? UI_LAB_BROWSER_TAB_ID
        : UI_LAB_TERMINAL_TAB_ID,
    activeTabType: markdownActive
      ? ('markdown' as const)
      : browserActive
        ? ('browser' as const)
        : ('terminal' as const)
  }
}

export function uiLabInitialChatMessages(scenario: MobileUiLabScenarioId): NativeChatMessage[] {
  return scenario === 'empty' || scenario === 'error' ? [] : UI_LAB_CHAT_MESSAGES
}
