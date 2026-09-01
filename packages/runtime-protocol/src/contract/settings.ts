import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  PRBotAuthorOverrideUpdateInputSchema,
  SettingsUpdateInputSchema,
  TerminalQuickCommandsUpdateInputSchema,
  WarpThemeImportSourceInputSchema
} from './settings-input.js'
import type {
  RuntimeClientSettings,
  RuntimeGhosttyImportPreview,
  RuntimeSettingsResult,
  RuntimeTerminalQuickCommandsResult,
  RuntimeWarpThemeImportPreview
} from './settings-types.js'

const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const HOST_ACCESS = { scope: 'host', tier: 'host' } as const
const MOBILE = { mobile: true } as const

export const settingsContract = {
  get: withAccess(HOST_READ_ACCESS, MOBILE).output(type<RuntimeSettingsResult>()),
  update: withAccess(HOST_ACCESS, MOBILE)
    .input(SettingsUpdateInputSchema)
    .output(type<RuntimeSettingsResult>()),
  getTerminalQuickCommands: withAccess(HOST_READ_ACCESS, MOBILE).output(
    type<RuntimeTerminalQuickCommandsResult>()
  ),
  updateTerminalQuickCommands: withAccess(HOST_ACCESS, MOBILE)
    .input(TerminalQuickCommandsUpdateInputSchema)
    .output(type<RuntimeTerminalQuickCommandsResult>()),
  updatePRBotAuthorOverride: withAccess(HOST_ACCESS)
    .input(PRBotAuthorOverrideUpdateInputSchema)
    .output(type<RuntimeSettingsResult>()),
  // Why: unlike `get`/`update`, these three read the *host's* filesystem
  // (installed fonts, Ghostty/Warp config files) rather than the routing
  // document itself, so the circular-routing problem that keeps `get`/`set`
  // shell-only does not apply — they migrate cleanly.
  listFonts: withAccess(HOST_READ_ACCESS).output(type<string[]>()),
  previewGhosttyImport: withAccess(HOST_READ_ACCESS).output(type<RuntimeGhosttyImportPreview>()),
  previewWarpThemeImport: withAccess(HOST_READ_ACCESS)
    .input(WarpThemeImportSourceInputSchema)
    .output(type<RuntimeWarpThemeImportPreview>()),
  // Why: settings live on the host and a change made from any other client or
  // window must reach the rest. The IPC emitter already excludes the origin
  // browser page; this stream is the paired-client equivalent.
  events: {
    subscribe: withAccess(HOST_READ_ACCESS, MOBILE)
      .input(type<void>())
      .output(eventIterator(type<RuntimeSettingsSubscriptionEvent>()))
  }
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './settings-input.js'
export type * from './settings-types.js'

export type RuntimeSettingsChangedEvent = {
  type: 'changed'
  updates: Partial<RuntimeClientSettings>
}

export type RuntimeSettingsSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeSettingsChangedEvent
  | { type: 'end' }
