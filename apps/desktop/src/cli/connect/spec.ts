import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const CONNECT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['connect'],
    summary: 'Connect this computer to the Yiru Web app',
    usage: 'yiru connect [--pair <single-use-grant>] [--yes] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'pair', 'yes'],
    notes: [
      'Runs in the foreground. Stop it with Ctrl+C to take this computer offline.',
      'Use --pair only with the single-use command shown by https://app.yiru.ai.',
      'The pairing grant expires after 10 minutes and can be used once.',
      '--yes skips the terminal Enter prompt; check the verification code in the Web app first.'
    ],
    examples: ['yiru connect', 'yiru connect --pair <grant>']
  },
  {
    path: ['connect', 'access', 'list'],
    summary: 'List browsers paired with this computer',
    usage: 'yiru connect access list [--json]',
    allowedFlags: GLOBAL_FLAGS,
    examples: ['yiru connect access list']
  },
  {
    path: ['connect', 'access', 'revoke'],
    summary: 'Revoke a paired browser',
    usage: 'yiru connect access revoke <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    positionalArgs: ['id'],
    destructive: true,
    notes: ['Use `yiru connect access list` to find the browser access ID.'],
    examples: ['yiru connect access revoke <id>']
  },
  {
    path: ['connect', 'forget'],
    summary: 'Revoke all browsers and remove this computer identity',
    usage: 'yiru connect forget [--json]',
    allowedFlags: GLOBAL_FLAGS,
    destructive: true,
    notes: ['Pairing is required again before this computer can connect.'],
    examples: ['yiru connect forget']
  }
]
