import type { AgentStatusEntry, NativeChatMessage } from '@yiru/workbench-model/agent'

import { FLOATING_WORKSPACE_WORKTREE_ID } from '../session/floating-workspace'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcFailure, RpcResponse, RpcSuccess } from '../transport/types'
import {
  mobileUiLabScenarioFromHostId,
  UI_LAB_CHAT_MESSAGES,
  UI_LAB_FILE_PATHS,
  UI_LAB_MARKDOWN,
  UI_LAB_SESSION_ID,
  UI_LAB_TERMINAL_HANDLE,
  UI_LAB_TERMINAL_TAB_ID,
  type MobileUiLabScenarioId
} from './fixtures'

const UI_LAB_RUNTIME_ID = 'ui-lab-runtime'
const UI_LAB_MARKDOWN_TAB_ID = 'ui-lab-markdown-tab'

function success(result: unknown): RpcSuccess {
  return { id: 'ui-lab', ok: true, result, _meta: { runtimeId: UI_LAB_RUNTIME_ID } }
}

function failure(method: string): RpcFailure {
  return {
    id: 'ui-lab',
    ok: false,
    error: { code: 'method_not_found', message: `UI Lab does not mock ${method}` },
    _meta: { runtimeId: UI_LAB_RUNTIME_ID }
  }
}

function requestParameter(params: unknown, key: string): unknown {
  return typeof params === 'object' && params !== null ? Reflect.get(params, key) : undefined
}

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
    worktreeId: FLOATING_WORKSPACE_WORKTREE_ID,
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

function sessionTabs(scenario: MobileUiLabScenarioId) {
  const markdownActive = scenario === 'markdown'
  return {
    worktree: FLOATING_WORKSPACE_WORKTREE_ID,
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
        isActive: !markdownActive
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
      }
    ],
    activeTabId: markdownActive ? UI_LAB_MARKDOWN_TAB_ID : UI_LAB_TERMINAL_TAB_ID,
    activeTabType: markdownActive ? ('markdown' as const) : ('terminal' as const)
  }
}

function initialChatMessages(scenario: MobileUiLabScenarioId): NativeChatMessage[] {
  return scenario === 'empty' || scenario === 'error' ? [] : UI_LAB_CHAT_MESSAGES
}

export function createMobileUiLabRpcClient(hostId: string): RpcClient | null {
  const scenario = mobileUiLabScenarioFromHostId(hostId)
  if (!scenario) {
    return null
  }

  const nativeChatListeners = new Set<(result: unknown) => void>()
  let localMessageCounter = 0
  const deliver = (listener: (result: unknown) => void, payload: unknown): void => {
    queueMicrotask(() => listener(payload))
  }
  const appendLocalChatTurn = (text: string): void => {
    const turn = ++localMessageCounter
    const messages: NativeChatMessage[] = [
      {
        id: `ui-lab-local-user-${turn}`,
        role: 'user',
        blocks: [{ type: 'text', text }],
        timestamp: Date.now(),
        source: 'hook'
      },
      {
        id: `ui-lab-local-assistant-${turn}`,
        role: 'assistant',
        blocks: [
          {
            type: 'text',
            text: `Local mock response for **${text}**. No paired runtime was contacted.`
          }
        ],
        timestamp: Date.now() + 1,
        source: 'hook'
      }
    ]
    for (const listener of nativeChatListeners) {
      deliver(listener, { type: 'appended', messages })
    }
  }

  const sendRequest = async (method: string, params?: unknown): Promise<RpcResponse> => {
    switch (method) {
      case 'status.get':
        return success({ capabilities: [] })
      case 'session.tabs.list':
        return success(sessionTabs(scenario))
      case 'terminal.list':
        return success({
          terminals: [{ handle: UI_LAB_TERMINAL_HANDLE, title: 'Codex fixture', isActive: true }]
        })
      case 'nativeChat.readSession':
        return success({ messages: initialChatMessages(scenario), hasMore: false })
      case 'markdown.readTab':
        return success({
          content: UI_LAB_MARKDOWN,
          version: 'ui-lab-v1',
          isDirty: false,
          editable: true
        })
      case 'files.searchPaths':
      case 'files.list':
        return success({ files: UI_LAB_FILE_PATHS.map((relativePath) => ({ relativePath })) })
      case 'files.resolveTerminalPath':
        return success({ exists: false, isDirectory: false })
      case 'terminal.send': {
        const text = requestParameter(params, 'text')
        const enter = requestParameter(params, 'enter')
        if (typeof text === 'string' && text.trim() && enter !== false && text !== '\u001b') {
          appendLocalChatTurn(text.trim())
        }
        return success({ send: { accepted: true } })
      }
      case 'worktree.activate':
      case 'worktree.set':
      case 'terminal.setDisplayMode':
      case 'terminal.clearBuffer':
        return success({})
      default:
        return failure(method)
    }
  }

  return {
    sendRequest,
    subscribe(method, _params, onData) {
      let active = true
      const emit = (payload: unknown): void => {
        if (active) {
          onData(payload)
        }
      }
      if (method === 'nativeChat.subscribe') {
        nativeChatListeners.add(emit)
        deliver(
          emit,
          scenario === 'error'
            ? { type: 'error', message: 'Fixture transcript is unavailable.' }
            : { type: 'snapshot', messages: initialChatMessages(scenario), hasMore: false }
        )
      } else if (method === 'session.tabs.subscribe') {
        deliver(emit, { type: 'snapshot', ...sessionTabs(scenario) })
      } else if (method === 'terminal.subscribe') {
        deliver(emit, { type: 'subscribed' })
      } else if (method === 'runtime.clientEvents.subscribe') {
        deliver(emit, { type: 'ready' })
      }
      return () => {
        active = false
        nativeChatListeners.delete(emit)
      }
    },
    updateTerminalSubscriptionViewport() {},
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => Date.now(),
    onStateChange: () => () => {},
    notifyForeground() {},
    close() {
      nativeChatListeners.clear()
    }
  }
}
