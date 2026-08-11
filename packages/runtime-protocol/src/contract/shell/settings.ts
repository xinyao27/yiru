import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'

const SHELL_SETTINGS_READ_ACCESS = {
  scope: 'host',
  tier: 'read',
  principals: ['local']
} as const
const SHELL_SETTINGS_WRITE_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local']
} as const

// Why: the full settings document selects the runtime target itself, so it
// belongs to the fixed local rendering shell rather than runtime.settings.
// Its desktop-only schema remains opaque to this client-safe package.
export const shellSettingsContract = {
  get: withAccess(SHELL_SETTINGS_READ_ACCESS).output(type<unknown>()),
  set: withAccess(SHELL_SETTINGS_WRITE_ACCESS).input(type<unknown>()).output(type<unknown>()),
  updatePRBotAuthorOverride: withAccess(SHELL_SETTINGS_WRITE_ACCESS)
    .input(type<{ author: string; isBot: boolean }>())
    .output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>
