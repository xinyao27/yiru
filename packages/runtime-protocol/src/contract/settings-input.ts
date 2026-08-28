import { z } from 'zod'

import { normalizePRBotAuthorOverrides } from '../model/review.js'
import {
  MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH,
  MAX_QUICK_COMMAND_ID_LENGTH,
  MAX_QUICK_COMMAND_LABEL_LENGTH,
  MAX_QUICK_COMMAND_REPO_ID_LENGTH,
  MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH,
  normalizeTerminalQuickCommands,
  supportsTerminalAgentQuickCommand,
  type TerminalQuickCommand
} from '../model/ui.js'
import {
  normalizeRuntimeDisabledTuiAgents,
  normalizeRuntimeTuiAgentArgsRecord,
  normalizeRuntimeTuiAgentEnvRecord
} from './client-state-normalization.js'
import { isRuntimeTuiAgent } from './input-schema.js'

export const TerminalQuickCommandScopeUpdateSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('global') }).strict(),
  z
    .object({
      type: z.literal('repo'),
      repoId: z.string().max(MAX_QUICK_COMMAND_REPO_ID_LENGTH)
    })
    .strict()
])

export const TerminalQuickCommandUpdateItemSchema = z.union([
  z
    .object({
      id: z.string().max(MAX_QUICK_COMMAND_ID_LENGTH),
      label: z.string().max(MAX_QUICK_COMMAND_LABEL_LENGTH),
      action: z.literal('terminal-command').optional(),
      command: z.string().max(MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH),
      appendEnter: z.boolean(),
      scope: TerminalQuickCommandScopeUpdateSchema.optional()
    })
    .strict(),
  z
    .object({
      id: z.string().max(MAX_QUICK_COMMAND_ID_LENGTH),
      label: z.string().max(MAX_QUICK_COMMAND_LABEL_LENGTH),
      action: z.literal('agent-prompt'),
      agent: z.custom(supportsTerminalAgentQuickCommand, {
        message: 'Agent does not support prompt commands'
      }),
      prompt: z.string().max(MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH),
      scope: TerminalQuickCommandScopeUpdateSchema.optional()
    })
    .strict()
])

export const SettingsUpdateInputSchema = z
  .object({
    defaultTuiAgent: z
      .unknown()
      .transform((value) =>
        value === null || value === 'blank' || isRuntimeTuiAgent(value) ? value : undefined
      )
      .optional(),
    disabledTuiAgents: z
      .unknown()
      .transform((value) => normalizeRuntimeDisabledTuiAgents(value))
      .optional(),
    agentDefaultArgs: z
      .unknown()
      .transform((value) => normalizeRuntimeTuiAgentArgsRecord(value))
      .optional(),
    agentDefaultEnv: z
      .unknown()
      .transform((value) => normalizeRuntimeTuiAgentEnvRecord(value))
      .optional(),
    agentStatusHooksEnabled: z.boolean().optional(),
    minimaxGroupId: z.string().optional(),
    minimaxUsageModels: z.string().optional(),
    prBotAuthorOverrides: z
      .unknown()
      .transform((value) => normalizePRBotAuthorOverrides(value))
      .optional()
  })
  .strict()
  .default({})

export const PRBotAuthorOverrideUpdateInputSchema = z
  .object({ author: z.string(), isBot: z.boolean() })
  .strict()

export const TerminalQuickCommandsUpdateInputSchema = z
  .object({
    // Why: targeted host-side mutations preserve unrelated desktop/mobile edits
    // without retransmitting the full command-body budget for every small change.
    mutation: z.union([
      z
        .object({
          type: z.literal('upsert'),
          command: TerminalQuickCommandUpdateItemSchema.transform(
            (value) => normalizeTerminalQuickCommands([value])[0]
          ).pipe(
            z.custom<TerminalQuickCommand>((value) => value !== undefined, {
              message: 'Quick command cannot be normalized'
            })
          )
        })
        .strict(),
      z
        .object({
          type: z.literal('delete'),
          id: z.string().min(1).max(MAX_QUICK_COMMAND_ID_LENGTH)
        })
        .strict()
    ])
  })
  .strict()

// Why: mirrors the desktop `WarpThemeImportSource` shared type — `auto` scans
// host-configured directories (no picker); `chooseFile`/`chooseFolder` open a
// native dialog, which still works unparented (no owner window) the same way
// it already does for the `main/warp-themes` picker helpers.
export const WarpThemeImportSourceInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('auto') }).strict(),
  z.object({ kind: z.literal('chooseFile') }).strict(),
  z.object({ kind: z.literal('chooseFolder') }).strict()
])

export type SettingsUpdateInput = z.output<typeof SettingsUpdateInputSchema>
export type PRBotAuthorOverrideUpdateInput = z.output<typeof PRBotAuthorOverrideUpdateInputSchema>
export type TerminalQuickCommandsUpdateInput = z.output<
  typeof TerminalQuickCommandsUpdateInputSchema
>
export type WarpThemeImportSourceInput = z.output<typeof WarpThemeImportSourceInputSchema>
