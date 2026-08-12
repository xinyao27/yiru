import { translate } from '~renderer/i18n/i18n'
import type { ClaudeRateLimitAccountsState, CodexRateLimitAccountsState } from '~shared/types'

import { callRuntimeOrpc, callShellOrpc, isWebRuntimeClient } from './orpc-client'

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

const electronShellAccountsApi: ShellAccountsApi = {
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

function unavailableOnWeb<TResult>(): Promise<TResult> {
  return Promise.reject(
    new Error(translate('auto.web.runtime.shellBoundary.unavailable', 'Unavailable on web.'))
  )
}

const webShellAccountsApi: ShellAccountsApi = {
  claude: {
    list: () =>
      callRuntimeOrpc({ kind: 'local' }, (client) => client.accounts.listCachedClaude, undefined),
    add: unavailableOnWeb,
    cancelPendingLogin: unavailableOnWeb,
    reauthenticate: unavailableOnWeb
  },
  codex: {
    list: () =>
      callRuntimeOrpc({ kind: 'local' }, (client) => client.accounts.listCachedCodex, undefined),
    add: unavailableOnWeb,
    reauthenticate: unavailableOnWeb
  }
}

export const shellAccountsApi = isWebRuntimeClient()
  ? webShellAccountsApi
  : electronShellAccountsApi
