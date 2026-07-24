import {
  MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH,
  MAX_QUICK_COMMAND_ID_LENGTH,
  MAX_QUICK_COMMAND_LABEL_LENGTH,
  MAX_QUICK_COMMAND_REPO_ID_LENGTH,
  MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH,
  normalizeTerminalQuickCommands,
  supportsTerminalAgentQuickCommand,
  type TerminalQuickCommand
} from '@yiru/workbench-model/ui'
import { z } from 'zod'

const TerminalQuickCommandScopeUpdate = z.discriminatedUnion('type', [
  z.object({ type: z.literal('global') }).strict(),
  z
    .object({
      type: z.literal('repo'),
      repoId: z.string().max(MAX_QUICK_COMMAND_REPO_ID_LENGTH)
    })
    .strict()
])

const TerminalQuickCommandUpdateItem = z.union([
  z
    .object({
      id: z.string().max(MAX_QUICK_COMMAND_ID_LENGTH),
      label: z.string().max(MAX_QUICK_COMMAND_LABEL_LENGTH),
      action: z.literal('terminal-command').optional(),
      command: z.string().max(MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH),
      appendEnter: z.boolean(),
      scope: TerminalQuickCommandScopeUpdate.optional()
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
      scope: TerminalQuickCommandScopeUpdate.optional()
    })
    .strict()
])

export const TerminalQuickCommandsUpdate = z
  .object({
    // Why: targeted host-side mutations preserve unrelated desktop/mobile edits
    // without retransmitting the full command-body budget for every small change.
    mutation: z.union([
      z
        .object({
          type: z.literal('upsert'),
          command: TerminalQuickCommandUpdateItem.transform(
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
