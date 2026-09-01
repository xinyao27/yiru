import { z } from 'zod'

import type { RuntimeTerminalQuickCommandsResult } from '../contract/settings-types.js' with {
  'resolution-mode': 'import'
}
import type { TerminalQuickCommandMutation } from '../model/terminal-quick-commands.js'
import {
  MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH,
  MAX_QUICK_COMMAND_ID_LENGTH,
  MAX_QUICK_COMMAND_LABEL_LENGTH,
  MAX_QUICK_COMMAND_REPO_ID_LENGTH,
  MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH
} from '../model/ui.js'

export const MOBILE_TERMINAL_QUICK_COMMANDS_GET_ORPC_PATH = '/settings/getTerminalQuickCommands'
export const MOBILE_TERMINAL_QUICK_COMMANDS_UPDATE_ORPC_PATH =
  '/settings/updateTerminalQuickCommands'
export const MOBILE_TERMINAL_QUICK_COMMANDS_CAPABILITY = 'terminal.quick-commands.v1'

const MobileTerminalQuickCommandScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('global') }).strict(),
  z
    .object({
      type: z.literal('repo'),
      repoId: z.string().max(MAX_QUICK_COMMAND_REPO_ID_LENGTH)
    })
    .strict()
])

const MobileTerminalQuickCommandSchema = z.union([
  z
    .object({
      id: z.string().max(MAX_QUICK_COMMAND_ID_LENGTH),
      label: z.string().max(MAX_QUICK_COMMAND_LABEL_LENGTH),
      action: z.literal('terminal-command').optional(),
      command: z.string().max(MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH),
      appendEnter: z.boolean(),
      scope: MobileTerminalQuickCommandScopeSchema.optional()
    })
    .strict(),
  z
    .object({
      id: z.string().max(MAX_QUICK_COMMAND_ID_LENGTH),
      label: z.string().max(MAX_QUICK_COMMAND_LABEL_LENGTH),
      action: z.literal('agent-prompt'),
      agent: z.string().min(1),
      prompt: z.string().max(MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH),
      scope: MobileTerminalQuickCommandScopeSchema.optional()
    })
    .strict()
])

export const MobileTerminalQuickCommandsResultSchema = z.object({
  terminalQuickCommands: z.array(MobileTerminalQuickCommandSchema).max(40)
})

export const MobileTerminalQuickCommandsUpdateInputSchema = z.object({
  mutation: z.union([
    z.object({ type: z.literal('upsert'), command: MobileTerminalQuickCommandSchema }).strict(),
    z
      .object({ type: z.literal('delete'), id: z.string().min(1).max(MAX_QUICK_COMMAND_ID_LENGTH) })
      .strict()
  ])
})

export const MOBILE_TERMINAL_QUICK_COMMANDS_RESULT_WIRE_IS_COMPATIBLE: RuntimeTerminalQuickCommandsResult extends z.output<
  typeof MobileTerminalQuickCommandsResultSchema
>
  ? true
  : never = true
export const MOBILE_TERMINAL_QUICK_COMMANDS_UPDATE_WIRE_IS_COMPATIBLE: TerminalQuickCommandMutation extends z.output<
  typeof MobileTerminalQuickCommandsUpdateInputSchema
>['mutation']
  ? true
  : never = true
