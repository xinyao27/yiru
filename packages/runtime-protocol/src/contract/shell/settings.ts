import { type, type ContractRouter } from '@orpc/contract'

import type { GlobalSettings } from '../../workbench/types.js'
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
// The pure settings model lives in runtime-protocol, so the transport keeps the
// document fully typed without importing either runtime host implementation.
export const shellSettingsContract = {
  get: withAccess(SHELL_SETTINGS_READ_ACCESS).output(type<GlobalSettings>()),
  set: withAccess(SHELL_SETTINGS_WRITE_ACCESS)
    .input(type<Partial<GlobalSettings>>())
    .output(type<GlobalSettings>()),
  updatePRBotAuthorOverride: withAccess(SHELL_SETTINGS_WRITE_ACCESS)
    .input(type<{ author: string; isBot: boolean }>())
    .output(type<GlobalSettings>())
} satisfies ContractRouter<RuntimeProcedureMeta>
