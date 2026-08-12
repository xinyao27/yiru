import { createORPCClient, ORPCError, type ClientLink } from '@orpc/client'
import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '@yiru/runtime-protocol/capabilities'
import type { NativeChatMessage } from '@yiru/workbench-model/agent'

import { MOBILE_AI_VAULT_CAPABILITY } from '../agent-history/capability'
import type { RpcClient } from '../transport/rpc-client'
import type { RuntimeOrpcClient } from '../transport/runtime-orpc-client'
import { isRuntimeOrpcStreamPath } from '../transport/runtime-orpc-compatibility'
import {
  mobileUiLabScenarioFromHostId,
  UI_LAB_FILE_PATHS,
  UI_LAB_MARKDOWN,
  UI_LAB_TERMINAL_HANDLE
} from './fixtures'
import { createUiLabSubscription } from './rpc-client-subscriptions'
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
      queueMicrotask(() => listener({ type: 'appended', messages }))
    }
  }

  // Why: the UI Lab is a local fixture with no real host — it implements the
  // typed contract directly rather than negotiating oRPC over a transport, so
  // there is no bare-string fallback to translate through (see slice 124).
  const call = async (
    path: readonly string[],
    input: unknown,
    options: { signal?: AbortSignal }
  ): Promise<unknown> => {
    if (isRuntimeOrpcStreamPath(path)) {
      return createUiLabSubscription(path, { scenario, nativeChatListeners }, options.signal)
    }
    return dispatchUiLabCall(path.join('.'), input)
  }

  const dispatchUiLabCall = (method: string, params: unknown): unknown => {
    switch (method) {
      case 'status.get':
        return {
          capabilities: [MOBILE_AI_VAULT_CAPABILITY, 'browser.screencast.v1'],
          runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
          minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
        }
      case 'ui.get':
        return { ui: {} }
      case 'repo.list':
        return uiLabRepos()
      case 'repo.baseRefDefault':
        return { defaultBaseRef: 'main' }
      case 'worktree.ps':
        return { worktrees: uiLabWorktrees() }
      case 'worktree.show':
        return uiLabWorktreeMetadata()
      case 'git.status':
        return uiLabGitStatus()
      case 'git.branchCompare':
        return uiLabBranchCompare()
      case 'git.diff':
      case 'git.branchDiff':
        return uiLabDiff()
      case 'git.history':
        return uiLabGitHistory()
      case 'files.readDir': {
        const relativePath = requestParameter(params, 'relativePath')
        return uiLabDirectory(typeof relativePath === 'string' ? relativePath : '')
      }
      case 'files.read': {
        const relativePath = requestParameter(params, 'relativePath')
        return uiLabFile(typeof relativePath === 'string' ? relativePath : 'README.md')
      }
      case 'aiVault.listSessions':
        return uiLabAgentSessions(hostId)
      case 'session.tabs.list':
        return uiLabSessionTabs(scenario)
      case 'terminal.list':
        return {
          terminals: [{ handle: UI_LAB_TERMINAL_HANDLE, title: 'Codex fixture', isActive: true }]
        }
      case 'nativeChat.readSession':
        return { messages: uiLabInitialChatMessages(scenario), hasMore: false }
      case 'markdown.readTab':
        return {
          content: UI_LAB_MARKDOWN,
          version: 'ui-lab-v1',
          isDirty: false,
          editable: true
        }
      case 'files.searchPaths':
      case 'files.list':
        return { files: UI_LAB_FILE_PATHS.map((relativePath) => ({ relativePath })) }
      case 'files.resolveTerminalPath':
        return { exists: false, isDirectory: false }
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
        return {}
      case 'terminal.send': {
        const text = requestParameter(params, 'text')
        const enter = requestParameter(params, 'enter')
        if (typeof text === 'string' && text.trim() && enter !== false && text !== '') {
          appendLocalChatTurn(text.trim())
        }
        return { send: { accepted: true } }
      }
      case 'worktree.activate':
      case 'worktree.set':
      case 'session.tabs.activate':
      case 'terminal.focus':
      case 'terminal.clearBuffer':
        return {}
      case 'terminal.setDisplayMode': {
        const mode = requestParameter(params, 'mode')
        return { mode: mode === 'desktop' ? 'desktop' : 'auto' }
      }
      default:
        throw new ORPCError('NOT_FOUND', { message: `UI Lab does not mock ${method}` })
    }
  }

  const link: ClientLink<Record<never, never>> = {
    call: (path, input, callOptions) => call(path, input, callOptions)
  }
  const orpc = createORPCClient<RuntimeOrpcClient>(link)

  const client: RpcClient = {
    orpc,
    terminalMultiplexer: {
      async subscribeTerminal(args) {
        queueMicrotask(() =>
          args.callbacks.onSnapshot({
            id: 1,
            cols: 80,
            rows: 24,
            activeBuffer: 'normal',
            normalScrollback: '',
            normalScreen: '',
            alternateScreen: '',
            pendingEscapeTail: '',
            coverageEndSeq: '0',
            pendingDeliveryStartSeq: '0',
            wireByteLength: 0,
            retainedScrollbackRows: 0,
            truncated: false,
            source: 'headless',
            metadata: {
              cwd: null,
              lastTitle: null,
              oscLinks: [],
              kittyKeyboardFlags: 0,
              displayMode: 'auto',
              requestedScrollbackRows: 0
            }
          })
        )
        return {
          streamId: 1,
          sendInput: () => true,
          sendInputAccepted: async () => true,
          sendQueryReply: () => true,
          resize: () => true,
          claimViewport: () => true,
          setDeliveryState: () => true,
          outputParsed() {},
          snapshotParsed: () => args.callbacks.onSubscribed?.(),
          close() {}
        }
      },
      setAppState() {},
      controlConnectionChanged() {},
      close() {}
    },
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => Date.now(),
    onStateChange: () => () => {},
    notifyForeground() {},
    // Why: the UI Lab mock never talks to a real host, so there is nothing
    // for the protocol-compat fallback probe to learn — callers already
    // treat `null` as "no answer" and keep gates hidden.
    probeStatusForProtocolCompat: async () => null,
    close() {
      nativeChatListeners.clear()
    }
  }

  // Why: React Native's development prop profiler enumerates client objects.
  // The oRPC function Proxy cannot stringify its own `name`, so keep it internal.
  Object.defineProperty(client, 'orpc', {
    enumerable: false,
    get: () => orpc
  })

  return client
}
