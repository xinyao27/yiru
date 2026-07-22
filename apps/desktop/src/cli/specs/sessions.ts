import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const SESSION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['sessions', 'list'],
    summary: 'List AI sessions discovered by Yiru',
    usage: 'yiru sessions list [--agent <agent>] [--limit <count>] [--force] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'agent', 'limit', 'force'],
    notes: ['Use --force to rescan provider history instead of using the AI Vault cache.'],
    examples: ['yiru sessions list', 'yiru sessions list --agent codex --limit 20 --json']
  },
  {
    path: ['sessions', 'search'],
    summary: 'Search AI session metadata and previews',
    usage: 'yiru sessions search <query> [--agent <agent>] [--limit <count>] [--force] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'query', 'agent', 'limit', 'force'],
    positionalArgs: ['query'],
    notes: ['Search covers titles, paths, branches, models, session ids, and preview messages.'],
    examples: [
      'yiru sessions search "release checklist"',
      'yiru sessions search auth --agent claude --limit 10 --json'
    ]
  }
]
