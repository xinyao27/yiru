import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const AGENT_HOOK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'hooks', 'status'],
    summary: 'Show whether Yiru-managed agent status hooks are enabled',
    usage: 'yiru agent hooks status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['yiru agent hooks status', 'yiru agent hooks status --json']
  },
  {
    path: ['agent', 'hooks', 'off'],
    summary: 'Disable Yiru-managed agent status hooks and remove local hook entries',
    usage: 'yiru agent hooks off [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['yiru agent hooks off']
  },
  {
    path: ['agent', 'hooks', 'on'],
    summary: 'Enable Yiru-managed agent status hooks',
    usage: 'yiru agent hooks on [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['yiru agent hooks on']
  }
]
