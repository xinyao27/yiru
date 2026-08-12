import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'
import type { ClaudeRateLimitAccountsState, CodexRateLimitAccountsState } from '../accounts.js'

const SHELL_ACCOUNT_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local']
} as const

export const ShellAccountAddTargetSchema = z
  .object({
    runtime: z.enum(['host', 'wsl']).optional(),
    wslDistro: z.string().nullable().optional()
  })
  .optional()

export const ShellAccountReauthenticateInputSchema = z.object({
  accountId: z.string().min(1, 'Missing accountId')
})

export type ShellAccountAddTarget = z.output<typeof ShellAccountAddTargetSchema>
export type ShellAccountReauthenticateInput = z.output<typeof ShellAccountReauthenticateInputSchema>

export const shellAccountsContract = {
  claude: {
    add: withAccess(SHELL_ACCOUNT_ACCESS)
      .input(ShellAccountAddTargetSchema)
      .output(type<ClaudeRateLimitAccountsState>()),
    cancelPendingLogin: withAccess(SHELL_ACCOUNT_ACCESS).output(type<boolean>()),
    reauthenticate: withAccess(SHELL_ACCOUNT_ACCESS)
      .input(ShellAccountReauthenticateInputSchema)
      .output(type<ClaudeRateLimitAccountsState>())
  },
  codex: {
    add: withAccess(SHELL_ACCOUNT_ACCESS)
      .input(ShellAccountAddTargetSchema)
      .output(type<CodexRateLimitAccountsState>()),
    reauthenticate: withAccess(SHELL_ACCOUNT_ACCESS)
      .input(ShellAccountReauthenticateInputSchema)
      .output(type<CodexRateLimitAccountsState>())
  }
} satisfies ContractRouter<RuntimeProcedureMeta>
