import {
  MOBILE_DEVELOPMENT_PAIRING_METHOD,
  type MobileDevelopmentPairingResult
} from '~shared/mobile-development-pairing/contract'

import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'

export const MOBILE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['mobile', 'development-pairing'],
    summary: 'Create a reusable mobile pairing link for a local development client',
    usage: 'yiru mobile development-pairing --address <host> --device-name <name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'address', 'device-name'],
    notes: [
      'This local-only development command reuses the named device credential so repeated dev starts do not accumulate paired-device rows.'
    ],
    examples: [
      'yiru-dev mobile development-pairing --address 127.0.0.1 --device-name "iOS Simulator <udid>" --json'
    ]
  }
]

export const MOBILE_HANDLERS: Record<string, CommandHandler> = {
  'mobile development-pairing': async ({ client, flags, json }) => {
    const result = await client.call<MobileDevelopmentPairingResult>(
      MOBILE_DEVELOPMENT_PAIRING_METHOD,
      {
        address: getRequiredStringFlag(flags, 'address'),
        deviceName: getRequiredStringFlag(flags, 'device-name')
      }
    )
    printResult(result, json, (value) => value.pairingUrl)
  }
}
