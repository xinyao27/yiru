import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const SERVE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['serve'],
    summary: 'Start a Yiru runtime server without opening a desktop window',
    usage:
      'yiru serve [--port <port>] [--pairing-address <host>] [--mobile-pairing] [--no-pairing] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'port', 'pairing-address', 'mobile-pairing', 'no-pairing'],
    notes: [
      'Runs in the foreground and prints the runtime endpoint. Stop it with Ctrl+C.',
      'Use --pairing-address when clients should connect through a LAN, Tailscale, SSH-forward, or public tunnel address.',
      'Use --mobile-pairing to print a mobile-scoped pairing QR/link instead of the default runtime-environment pairing link.',
      'When the web client bundle is available, the server also prints a browser URL with the pairing data embedded.'
    ],
    examples: [
      'yiru serve',
      'yiru serve --json',
      'yiru serve --port 6768 --pairing-address 100.64.1.20',
      'yiru serve --pairing-address 100.64.1.20 --mobile-pairing'
    ]
  }
]
