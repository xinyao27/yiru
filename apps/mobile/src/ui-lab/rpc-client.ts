import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '@yiru/runtime-protocol/capabilities'
import type { NativeChatMessage } from '@yiru/workbench-model/agent'

import { MOBILE_AI_VAULT_CAPABILITY } from '../agent-history/capability'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcFailure, RpcResponse, RpcSuccess } from '../transport/types'
import {
  mobileUiLabScenarioFromHostId,
  UI_LAB_FILE_PATHS,
  UI_LAB_MARKDOWN,
  UI_LAB_TERMINAL_HANDLE
} from './fixtures'
import {
  uiLabAgentSessions,
  uiLabBranchCompare,
  uiLabDiff,
  uiLabDirectory,
  uiLabFile,
  uiLabGitHistory,
  uiLabGitStatus,
  uiLabRepos,
  uiLabWorktreeMetadata,
  uiLabWorktrees
} from './runtime-fixtures'
import { uiLabInitialChatMessages, uiLabSessionTabs } from './session-fixtures'

const UI_LAB_RUNTIME_ID = 'ui-lab-runtime'

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
        return success({
          capabilities: [MOBILE_AI_VAULT_CAPABILITY, 'browser.screencast.v1'],
          runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
          minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
        })
      case 'ui.get':
        return success({ ui: {} })
      case 'repo.list':
        return success(uiLabRepos())
      case 'repo.baseRefDefault':
        return success({ defaultBaseRef: 'main' })
      case 'worktree.ps':
        return success({ worktrees: uiLabWorktrees() })
      case 'worktree.show':
        return success(uiLabWorktreeMetadata())
      case 'git.status':
        return success(uiLabGitStatus())
      case 'git.branchCompare':
        return success(uiLabBranchCompare())
      case 'git.diff':
      case 'git.branchDiff':
        return success(uiLabDiff())
      case 'git.history':
        return success(uiLabGitHistory())
      case 'files.readDir': {
        const relativePath = requestParameter(params, 'relativePath')
        return success(uiLabDirectory(typeof relativePath === 'string' ? relativePath : ''))
      }
      case 'files.read': {
        const relativePath = requestParameter(params, 'relativePath')
        return success(uiLabFile(typeof relativePath === 'string' ? relativePath : 'README.md'))
      }
      case 'aiVault.listSessions':
        return success(uiLabAgentSessions(hostId))
      case 'session.tabs.list':
        return success(uiLabSessionTabs(scenario))
      case 'terminal.list':
        return success({
          terminals: [{ handle: UI_LAB_TERMINAL_HANDLE, title: 'Codex fixture', isActive: true }]
        })
      case 'nativeChat.readSession':
        return success({ messages: uiLabInitialChatMessages(scenario), hasMore: false })
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
      case 'browser.goto':
      case 'browser.back':
      case 'browser.forward':
      case 'browser.reload':
      case 'browser.keypress':
      case 'browser.keyboardInsertText':
      case 'browser.mouseMove':
      case 'browser.mouseWheel':
      case 'browser.mouseClick':
      case 'browser.mouseDown':
      case 'browser.mouseUp':
      case 'git.stage':
      case 'git.unstage':
      case 'git.discard':
      case 'git.commit':
      case 'git.push':
      case 'git.pull':
      case 'git.fetch':
        return success({})
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
      case 'session.tabs.activate':
      case 'terminal.focus':
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
            : { type: 'snapshot', messages: uiLabInitialChatMessages(scenario), hasMore: false }
        )
      } else if (method === 'session.tabs.subscribe') {
        deliver(emit, { type: 'snapshot', ...uiLabSessionTabs(scenario) })
      } else if (method === 'terminal.subscribe') {
        deliver(emit, { type: 'subscribed' })
      } else if (method === 'browser.screencast') {
        deliver(emit, {
          type: 'ready',
          tab: {
            url: 'https://yiru.app/ui-lab',
            title: 'Yiru UI Lab',
            canGoBack: true,
            canGoForward: false
          }
        })
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
