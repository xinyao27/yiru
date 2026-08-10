import type {
  FeatureInteractionIdInput,
  PRBotAuthorOverrideUpdateInput,
  RuntimeClientSettings,
  RuntimeGhosttyImportPreview,
  RuntimeSettingsResult,
  RuntimeTerminalQuickCommandsResult,
  RuntimeUIResult,
  RuntimeWarpThemeImportPreview,
  SettingsUpdateInput,
  TerminalQuickCommandsUpdateInput,
  UIUpdateInput,
  WarpThemeImportSourceInput
} from '@yiru/runtime-protocol/contract'
import { listSystemFontFamilies } from '~main/system-fonts'
import type { PersistedUIState } from '~shared/types'

import { callerClassOf } from '../access'
import type { RpcContext, RpcHandler } from '../core'
import {
  assertAgentLaunchControlsWritable,
  assertHookTrustWritable,
  redactAgentLaunchControls
} from './client-ui-privileged-fields'

type ClientSettings = ReturnType<RpcContext['runtime']['getClientSettings']>

function toRuntimeClientSettings(settings: ClientSettings): RuntimeClientSettings {
  return {
    ...settings,
    agentDefaultArgs: settings.agentDefaultArgs ?? {},
    agentDefaultEnv: settings.agentDefaultEnv ?? {}
  }
}

// Why: `settingsContract.get` declares no `.input()`, so oRPC infers `unknown`
// (not `void`) for the handler's first parameter — direct wiring in
// orpc/router-direct.ts type-checks against that real contract shape, unlike
// the erased legacy registry this used to go through.
export function handleSettingsGet(_params: unknown, { runtime, principal }: RpcContext) {
  const settings = redactAgentLaunchControls(runtime.getClientSettings(), callerClassOf(principal))
  return {
    settings: toRuntimeClientSettings(settings)
  } satisfies RuntimeSettingsResult
}

export const handleSettingsUpdate = ((params, { runtime, principal }) => {
  assertAgentLaunchControlsWritable(params, callerClassOf(principal))
  return { settings: toRuntimeClientSettings(runtime.updateClientSettings(params)) }
}) satisfies RpcHandler<SettingsUpdateInput, RuntimeSettingsResult>

export function handleSettingsGetTerminalQuickCommands(
  _params: unknown,
  { runtime }: RpcContext
): RuntimeTerminalQuickCommandsResult {
  return { terminalQuickCommands: runtime.getClientTerminalQuickCommands() }
}

export const handleSettingsUpdateTerminalQuickCommands = ((params, { runtime }) => ({
  terminalQuickCommands: runtime.updateClientTerminalQuickCommands(params.mutation)
})) satisfies RpcHandler<TerminalQuickCommandsUpdateInput, RuntimeTerminalQuickCommandsResult>

export const handleSettingsUpdatePRBotAuthorOverride = ((params, { runtime }) => ({
  settings: toRuntimeClientSettings(runtime.updateClientPRBotAuthorOverride(params))
})) satisfies RpcHandler<PRBotAuthorOverrideUpdateInput, RuntimeSettingsResult>

export function handleSettingsListFonts(): Promise<string[]> {
  return listSystemFontFamilies()
}

export function handleSettingsPreviewGhosttyImport(
  _params: unknown,
  { runtime }: RpcContext
): Promise<RuntimeGhosttyImportPreview> {
  return runtime.previewGhosttyImportForClient()
}

export const handleSettingsPreviewWarpThemeImport = ((params, { runtime }) =>
  runtime.previewWarpThemeImportForClient(params)) satisfies RpcHandler<
  WarpThemeImportSourceInput,
  RuntimeWarpThemeImportPreview
>

export function handleUIGet(_params: unknown, { runtime }: RpcContext): RuntimeUIResult {
  return { ui: runtime.getUIState() }
}

export const handleUISet = ((params, { runtime, principal }) => {
  assertHookTrustWritable(params, callerClassOf(principal))
  // Why: the wire schema retains legacy UI keys and permissive uploaded-pet metadata
  // that the persisted desktop type intentionally narrows after hydration.
  return { ui: runtime.updateUIState(params as Partial<PersistedUIState>) }
}) satisfies RpcHandler<UIUpdateInput, RuntimeUIResult>

export const handleUIRecordFeatureInteraction = ((params, { runtime }) => ({
  ui: runtime.recordFeatureInteraction(params)
})) satisfies RpcHandler<FeatureInteractionIdInput, RuntimeUIResult>
