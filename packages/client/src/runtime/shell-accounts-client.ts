import type {
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState
} from '@yiru/runtime-protocol/workbench/types'

import { callRuntimeOrpc, callShellOrpc } from './orpc-client'

type AccountAddTarget = {
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null
}

export type ShellAccountsApi = {
  claude: {
    list: () => Promise<ClaudeRateLimitAccountsState>
    add: (target?: AccountAddTarget) => Promise<ClaudeRateLimitAccountsState>
    cancelPendingLogin: () => Promise<boolean>
    reauthenticate: (args: { accountId: string }) => Promise<ClaudeRateLimitAccountsState>
  }
  codex: {
    list: () => Promise<CodexRateLimitAccountsState>
    add: (target?: AccountAddTarget) => Promise<CodexRateLimitAccountsState>
    reauthenticate: (args: { accountId: string }) => Promise<CodexRateLimitAccountsState>
  }
}

export const shellAccountsApi: ShellAccountsApi = {
  claude: {
    list: () =>
      callRuntimeOrpc({ kind: 'local' }, (client) => client.accounts.listCachedClaude, undefined),
    add: (input) => callShellOrpc((client) => client.shell.accounts.claude.add, input),
    cancelPendingLogin: () =>
      callShellOrpc((client) => client.shell.accounts.claude.cancelPendingLogin, undefined),
    reauthenticate: (input) =>
      callShellOrpc((client) => client.shell.accounts.claude.reauthenticate, input)
  },
  codex: {
    list: () =>
      callRuntimeOrpc({ kind: 'local' }, (client) => client.accounts.listCachedCodex, undefined),
    add: (input) => callShellOrpc((client) => client.shell.accounts.codex.add, input),
    reauthenticate: (input) =>
      callShellOrpc((client) => client.shell.accounts.codex.reauthenticate, input)
  }
}
