import { listAiVaultSessions } from '~main/ai-vault/ai-vault'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'

export const shellAiVaultRuntimeHandlers = {
  aiVault: {
    listSessions: runtimeImplementation.shell.aiVault.listSessions.handler(({ input }) =>
      listAiVaultSessions(input)
    )
  }
} as const
