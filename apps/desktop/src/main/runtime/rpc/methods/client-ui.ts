import type { PersistedUIState } from '../../../../shared/types'
import { defineMethod, type RpcMethod } from '../core'
import {
  FeatureInteractionIdParam,
  PRBotAuthorOverrideUpdate,
  SettingsUpdate,
  UiUpdate
} from './client-ui-schemas'
import { TerminalQuickCommandsUpdate } from './terminal-quick-command-rpc-schema'

export const CLIENT_UI_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'settings.get',
    mobile: true,
    params: null,
    handler: (_params, { runtime }) => ({ settings: runtime.getClientSettings() })
  }),
  defineMethod({
    name: 'settings.update',
    mobile: true,
    params: SettingsUpdate,
    handler: (params, { runtime }) => ({ settings: runtime.updateClientSettings(params) })
  }),
  defineMethod({
    name: 'settings.getTerminalQuickCommands',
    mobile: true,
    params: null,
    // Why: command bodies can total about 240 KB, so unrelated settings reads
    // should not carry them over every paired or relay connection.
    handler: (_params, { runtime }) => ({
      terminalQuickCommands: runtime.getClientTerminalQuickCommands()
    })
  }),
  defineMethod({
    name: 'settings.updateTerminalQuickCommands',
    mobile: true,
    params: TerminalQuickCommandsUpdate,
    handler: (params, { runtime }) => ({
      terminalQuickCommands: runtime.updateClientTerminalQuickCommands(params.mutation)
    })
  }),
  defineMethod({
    name: 'settings.updatePRBotAuthorOverride',
    params: PRBotAuthorOverrideUpdate,
    handler: (params, { runtime }) => ({
      settings: runtime.updateClientPRBotAuthorOverride(params)
    })
  }),
  defineMethod({
    name: 'ui.get',
    mobile: true,
    params: null,
    handler: (_params, { runtime }) => ({ ui: runtime.getUIState() })
  }),
  defineMethod({
    name: 'ui.set',
    mobile: true,
    params: UiUpdate,
    handler: (params, { runtime }) => ({
      ui: runtime.updateUIState(params as Partial<PersistedUIState>)
    })
  }),
  defineMethod({
    name: 'ui.recordFeatureInteraction',
    mobile: true,
    params: FeatureInteractionIdParam,
    handler: (params, { runtime }) => ({
      ui: runtime.recordFeatureInteraction(params)
    })
  })
]
