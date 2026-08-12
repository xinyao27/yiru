import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'
import { requireShellRenderer } from '~main/shell/files'

export const shellAccountsRuntimeHandlers = {
  accounts: {
    claude: {
      add: runtimeImplementation.shell.accounts.claude.add.handler(({ input, context }) => {
        requireShellRenderer(context.renderingWebContentsId)
        return context.runtime.addClaudeAccount(input)
      }),
      cancelPendingLogin: runtimeImplementation.shell.accounts.claude.cancelPendingLogin.handler(
        ({ context }) => {
          requireShellRenderer(context.renderingWebContentsId)
          return context.runtime.cancelPendingClaudeAccountLogin()
        }
      ),
      reauthenticate: runtimeImplementation.shell.accounts.claude.reauthenticate.handler(
        ({ input, context }) => {
          requireShellRenderer(context.renderingWebContentsId)
          return context.runtime.reauthenticateClaudeAccount(input.accountId)
        }
      )
    },
    codex: {
      add: runtimeImplementation.shell.accounts.codex.add.handler(({ input, context }) => {
        requireShellRenderer(context.renderingWebContentsId)
        return context.runtime.addCodexAccount(input)
      }),
      reauthenticate: runtimeImplementation.shell.accounts.codex.reauthenticate.handler(
        ({ input, context }) => {
          requireShellRenderer(context.renderingWebContentsId)
          return context.runtime.reauthenticateCodexAccount(input.accountId)
        }
      )
    }
  }
} as const
