import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const SERVE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['serve'],
    summary: 'Start Yiru without opening a desktop window',
    usage:
      'yiru serve [--port <port>] [--mobile-pairing [--pairing-address <host>]] [--electron] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'port', 'pairing-address', 'mobile-pairing', 'electron'],
    notes: [
      'Runs in the foreground and prints the runtime endpoint. Stop it with Ctrl+C.',
      'Desktop-to-desktop connections are managed through Coworking.',
      'Use --mobile-pairing to print a Yiru Mobile pairing QR/link.',
      'Use --pairing-address with --mobile-pairing to advertise a reachable phone-facing address.'
    ],
    examples: [
      'yiru serve',
      'yiru serve --json',
      'yiru serve --mobile-pairing',
      'yiru serve --pairing-address 100.64.1.20 --mobile-pairing',
      'yiru serve --electron'
    ]
  }
]
