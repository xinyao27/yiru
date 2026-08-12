import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'
import { requireShellRenderer } from '~main/shell/files'

export const shellAccountsRuntimeHandlers = {
  accounts: {
    claude: {
      add: runtimeImplementation.shell.accounts.claude.add.handler(({ input, context }) => {
        requireShellRenderer(context.renderingWebContentsId)
        return context.runtime.accounts.addClaude(input)
      }),
      cancelPendingLogin: runtimeImplementation.shell.accounts.claude.cancelPendingLogin.handler(
        ({ context }) => {
          requireShellRenderer(context.renderingWebContentsId)
          return context.runtime.accounts.cancelPendingClaudeLogin()
        }
      ),
      reauthenticate: runtimeImplementation.shell.accounts.claude.reauthenticate.handler(
        ({ input, context }) => {
          requireShellRenderer(context.renderingWebContentsId)
          return context.runtime.accounts.reauthenticateClaude(input.accountId)
        }
      )
    },
    codex: {
      add: runtimeImplementation.shell.accounts.codex.add.handler(({ input, context }) => {
        requireShellRenderer(context.renderingWebContentsId)
        return context.runtime.accounts.addCodex(input)
      }),
      reauthenticate: runtimeImplementation.shell.accounts.codex.reauthenticate.handler(
        ({ input, context }) => {
          requireShellRenderer(context.renderingWebContentsId)
          return context.runtime.accounts.reauthenticateCodex(input.accountId)
        }
      )
    }
  }
} as const
