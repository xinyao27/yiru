import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'

export function createBunShellAccountHandlers() {
  return {
    accounts: {
      claude: {
        add: runtimeImplementation.shell.accounts.claude.add.handler(({ input, context }) =>
          context.runtime.accounts.addClaude(input)
        ),
        cancelPendingLogin: runtimeImplementation.shell.accounts.claude.cancelPendingLogin.handler(
          ({ context }) => context.runtime.accounts.cancelPendingClaudeLogin()
        ),
        reauthenticate: runtimeImplementation.shell.accounts.claude.reauthenticate.handler(
          ({ input, context }) => context.runtime.accounts.reauthenticateClaude(input.accountId)
        )
      },
      codex: {
        add: runtimeImplementation.shell.accounts.codex.add.handler(({ input, context }) =>
          context.runtime.accounts.addCodex(input)
        ),
        reauthenticate: runtimeImplementation.shell.accounts.codex.reauthenticate.handler(
          ({ input, context }) => context.runtime.accounts.reauthenticateCodex(input.accountId)
        )
      }
    }
  }
}
