import { normalizeExecutionHostId, type ExecutionHostId } from '@yiru/workbench-model/workspace'
import { z } from 'zod'
import {
  isKeybindingActionId,
  normalizeKeybindingArrayForAction,
  type KeybindingOverrides
} from '~shared/keybindings'
import { normalizeOpenInApplications } from '~shared/open-in-applications'
import { normalizeTerminalQuickCommands } from '~shared/terminal/quick-commands'
import { isTuiAgent } from '~shared/tui-agent/config'
import {
  normalizeTuiAgentArgsRecord,
  normalizeTuiAgentEnvRecord
} from '~shared/tui-agent/launch-defaults'
import { normalizeDisabledTuiAgents } from '~shared/tui-agent/selection'
import type { GlobalSettings, HostSettingOverrides } from '~shared/types'

const nullableString = z.string().nullable()
const optionalNullableString = nullableString.optional()
const finiteNumber = z.number().finite()

const terminalColorOverrides = z.object({
  foreground: z.string().optional(),
  background: z.string().optional(),
  cursor: z.string().optional(),
  cursorAccent: z.string().optional(),
  selectionBackground: z.string().optional(),
  selectionForeground: z.string().optional(),
  black: z.string().optional(),
  red: z.string().optional(),
  green: z.string().optional(),
  yellow: z.string().optional(),
  blue: z.string().optional(),
  magenta: z.string().optional(),
  cyan: z.string().optional(),
  white: z.string().optional(),
  brightBlack: z.string().optional(),
  brightRed: z.string().optional(),
  brightGreen: z.string().optional(),
  brightYellow: z.string().optional(),
  brightBlue: z.string().optional(),
  brightMagenta: z.string().optional(),
  brightCyan: z.string().optional(),
  brightWhite: z.string().optional(),
  bold: z.string().optional()
})

const terminalCustomTheme = z.object({
  id: z.string(),
  name: z.string(),
  source: z.enum(['warp', 'ghostty', 'manual']),
  mode: z.enum(['dark', 'light', 'unknown']),
  terminal: terminalColorOverrides,
  importedAt: z.string(),
  sourceLabel: z.string().optional(),
  unsupportedFeatures: z.array(z.string()).optional()
})

const tuiAgent = z.string().transform((value, context) => {
  if (isTuiAgent(value)) {
    return value
  }
  context.addIssue({ code: 'custom' })
  return z.NEVER
})

const terminalQuickCommandScope = z.union([
  z.object({ type: z.literal('global') }),
  z.object({ type: z.literal('repo'), repoId: z.string() })
])

const terminalQuickCommand = z.union([
  z.object({
    id: z.string(),
    label: z.string(),
    scope: terminalQuickCommandScope.optional(),
    action: z.literal('terminal-command').optional(),
    command: z.string(),
    appendEnter: z.boolean()
  }),
  z.object({
    id: z.string(),
    label: z.string(),
    scope: terminalQuickCommandScope.optional(),
    action: z.literal('agent-prompt'),
    agent: tuiAgent,
    prompt: z.string()
  })
])

const codexManagedAccount = z.object({
  id: z.string(),
  email: z.string(),
  managedHomePath: z.string(),
  managedHomeRuntime: z.enum(['host', 'wsl']).optional(),
  wslDistro: optionalNullableString,
  wslLinuxHomePath: optionalNullableString,
  providerAccountId: optionalNullableString,
  workspaceLabel: optionalNullableString,
  workspaceAccountId: optionalNullableString,
  createdAt: finiteNumber,
  updatedAt: finiteNumber,
  lastAuthenticatedAt: finiteNumber
})

const claudeManagedAccount = z.object({
  id: z.string(),
  email: z.string(),
  managedAuthPath: z.string(),
  managedAuthRuntime: z.enum(['host', 'wsl']).optional(),
  wslDistro: optionalNullableString,
  wslLinuxAuthPath: optionalNullableString,
  authMethod: z.enum(['subscription-oauth', 'unknown']),
  organizationUuid: optionalNullableString,
  organizationName: optionalNullableString,
  createdAt: finiteNumber,
  updatedAt: finiteNumber,
  lastAuthenticatedAt: finiteNumber
})

const managedAccountRuntimeSelection = z.object({
  host: nullableString,
  wsl: z.record(z.string(), nullableString)
})

const hostSettingOverrides = z
  .record(
    z.string(),
    z.object({
      displayLabel: z.string().optional(),
      defaultWorktreeLocation: z.string().optional()
    })
  )
  .superRefine((value, context) => {
    for (const key of Object.keys(value)) {
      if (!normalizeExecutionHostId(key)) {
        context.addIssue({ code: 'custom' })
      }
    }
  })
  .transform((value) => {
    const result: Partial<Record<ExecutionHostId, HostSettingOverrides>> = {}
    for (const [key, overrides] of Object.entries(value)) {
      const hostId = normalizeExecutionHostId(key)
      if (hostId) {
        result[hostId] = overrides
      }
    }
    return result
  })

const tuiAgentStringRecord = z
  .record(z.string(), z.string())
  .refine((value) => Object.keys(value).every(isTuiAgent))
  .transform(normalizeTuiAgentArgsRecord)

const tuiAgentEnvironmentRecord = z
  .record(z.string(), z.record(z.string(), z.string()))
  .refine((value) => Object.keys(value).every(isTuiAgent))
  .transform(normalizeTuiAgentEnvRecord)

const keybindingOverrides = z
  .record(z.string(), z.array(z.string()))
  .superRefine((value, context) => {
    for (const actionId of Object.keys(value)) {
      if (!isKeybindingActionId(actionId)) {
        context.addIssue({ code: 'custom' })
      }
    }
  })
  .transform((value, context) => {
    const result: KeybindingOverrides = {}
    for (const [actionId, bindings] of Object.entries(value)) {
      if (!isKeybindingActionId(actionId)) {
        continue
      }
      const normalized = normalizeKeybindingArrayForAction(actionId, bindings)
      if (!Array.isArray(normalized)) {
        context.addIssue({ code: 'custom' })
        return z.NEVER
      }
      result[actionId] = normalized
    }
    return result
  })

export function createCollectionSettingSchemas(defaults: GlobalSettings) {
  return {
    hostSettingOverrides: hostSettingOverrides.optional().catch(defaults.hostSettingOverrides),
    workspaceDirHistory: z
      .array(z.object({ path: z.string(), nestWorkspaces: z.boolean() }))
      .optional()
      .catch(defaults.workspaceDirHistory),
    terminalCustomThemes: z
      .array(terminalCustomTheme)
      .optional()
      .catch(defaults.terminalCustomThemes),
    terminalColorOverrides: terminalColorOverrides
      .optional()
      .catch(defaults.terminalColorOverrides),
    terminalQuickCommands: z
      .array(terminalQuickCommand)
      .transform(normalizeTerminalQuickCommands)
      .optional()
      .catch(defaults.terminalQuickCommands),
    localWindowsRuntimeDefault: z
      .union([
        z.object({ kind: z.literal('windows-host') }),
        z.object({ kind: z.literal('wsl'), distro: nullableString })
      ])
      .catch(defaults.localWindowsRuntimeDefault),
    openInApplications: z
      .array(z.object({ id: z.string(), label: z.string(), command: z.string() }))
      .transform((value) => normalizeOpenInApplications(value))
      .optional()
      .catch(defaults.openInApplications),
    keybindings: keybindingOverrides.optional().catch(defaults.keybindings),
    prBotAuthorOverrides: z.array(z.string()).catch(defaults.prBotAuthorOverrides),
    codexManagedAccounts: z.array(codexManagedAccount).catch(defaults.codexManagedAccounts),
    activeCodexManagedAccountIdsByRuntime: managedAccountRuntimeSelection
      .optional()
      .catch(defaults.activeCodexManagedAccountIdsByRuntime),
    claudeManagedAccounts: z.array(claudeManagedAccount).catch(defaults.claudeManagedAccounts),
    activeClaudeManagedAccountIdsByRuntime: managedAccountRuntimeSelection
      .optional()
      .catch(defaults.activeClaudeManagedAccountIdsByRuntime),
    disabledTuiAgents: z
      .array(tuiAgent)
      .transform(normalizeDisabledTuiAgents)
      .catch(defaults.disabledTuiAgents),
    agentCmdOverrides: tuiAgentStringRecord.catch(defaults.agentCmdOverrides),
    codexSessionSourceHome: z
      .object({
        host: z.string().optional(),
        wsl: z.record(z.string(), z.string()).optional()
      })
      .optional()
      .catch(defaults.codexSessionSourceHome),
    agentDefaultArgs: tuiAgentStringRecord.optional().catch(defaults.agentDefaultArgs),
    agentDefaultEnv: tuiAgentEnvironmentRecord.optional().catch(defaults.agentDefaultEnv),
    dismissedSkillFreshnessNudges: z
      .array(z.string())
      .optional()
      .catch(defaults.dismissedSkillFreshnessNudges)
  }
}
