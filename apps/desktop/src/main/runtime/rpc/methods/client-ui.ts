import type { PersistedUIState } from '~shared/types'

import { callerClassOf } from '../access'
import { defineMethod, type RpcMethod } from '../core'
import {
  assertAgentLaunchControlsWritable,
  assertHookTrustWritable,
  redactAgentLaunchControls
} from './client-ui-privileged-fields'
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
    // Why: read-only, but the payload includes agentDefaultEnv — the env vars
    // handed to every agent launch, which routinely hold provider API keys.
    access: { scope: 'host', tier: 'read' },
    handler: (_params, { runtime, principal }) => ({
      settings: redactAgentLaunchControls(runtime.getClientSettings(), callerClassOf(principal))
    })
  }),
  defineMethod({
    name: 'settings.update',
    mobile: true,
    params: SettingsUpdate,
    // Why: writes agentDefaultArgs / agentDefaultEnv, so it decides the argv and
    // environment of every future agent process on the owner's machine.
    access: { scope: 'host', tier: 'host' },
    handler: (params, { runtime, principal }) => {
      assertAgentLaunchControlsWritable(params, callerClassOf(principal))
      return { settings: runtime.updateClientSettings(params) }
    }
  }),
  defineMethod({
    name: 'settings.getTerminalQuickCommands',
    mobile: true,
    params: null,
    access: { scope: 'host', tier: 'read' },
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
    // Why: quick commands are shell bodies the owner later runs with one click,
    // so writing them plants executable content on the owner's machine.
    access: { scope: 'host', tier: 'host' },
    handler: (params, { runtime }) => ({
      terminalQuickCommands: runtime.updateClientTerminalQuickCommands(params.mutation)
    })
  }),
  defineMethod({
    name: 'settings.updatePRBotAuthorOverride',
    params: PRBotAuthorOverrideUpdate,
    access: { scope: 'host', tier: 'host' },
    handler: (params, { runtime }) => ({
      settings: runtime.updateClientPRBotAuthorOverride(params)
    })
  }),
  defineMethod({
    name: 'ui.get',
    mobile: true,
    params: null,
    access: { scope: 'host', tier: 'read' },
    handler: (_params, { runtime }) => ({ ui: runtime.getUIState() })
  }),
  defineMethod({
    name: 'ui.set',
    mobile: true,
    params: UiUpdate,
    // Why: repaints the owner's screen (window bounds, active worktree, panels)
    // and also carries trustedYiruHooks, the hook trust store.
    access: { scope: 'host', tier: 'host' },
    handler: (params, { runtime, principal }) => {
      assertHookTrustWritable(params, callerClassOf(principal))
      return { ui: runtime.updateUIState(params as Partial<PersistedUIState>) }
    }
  }),
  defineMethod({
    name: 'ui.recordFeatureInteraction',
    mobile: true,
    params: FeatureInteractionIdParam,
    // Why: persists into the same UI state as ui.set and suppresses tips and
    // badges on the owner's screen.
    access: { scope: 'host', tier: 'host' },
    handler: (params, { runtime }) => ({
      ui: runtime.recordFeatureInteraction(params)
    })
  })
]
