import { resolve } from 'node:path'

import { translate } from '../i18n/translate'
import { resolveDefaultUserDataPath } from '../runtime/paths'

export type DaemonOptions = {
  json: boolean
  listenAddress: string
  mobilePairing: boolean
  pairingAddress: string | null
  port: number
  preferPinnedPort: boolean
  rpcPort: number
  userDataPath: string
}

const DEFAULT_WEB_SOCKET_PORT = 6768

export class DaemonArgumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DaemonArgumentError'
  }
}

export function parseDaemonOptions(argv: string[]): DaemonOptions {
  let json = false
  let listenAddress = '127.0.0.1'
  let mobilePairing = false
  let pairingAddress: string | null = null
  let port = DEFAULT_WEB_SOCKET_PORT
  let preferPinnedPort = false
  let rpcPort = 0
  let userDataPath: string | null = null
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    switch (argument) {
      case '--json':
        json = true
        break
      case '--listen':
        listenAddress = readOptionValue(argv, index, argument)
        index++
        break
      case '--mobile-pairing':
        mobilePairing = true
        break
      case '--pairing-address':
        pairingAddress = readOptionValue(argv, index, argument)
        index++
        break
      case '--port': {
        const rawPort = readOptionValue(argv, index, argument)
        port = parsePort(rawPort)
        preferPinnedPort = true
        index++
        break
      }
      case '--rpc-port': {
        rpcPort = parsePort(readOptionValue(argv, index, argument))
        index++
        break
      }
      case '--user-data-path':
        userDataPath = readOptionValue(argv, index, argument)
        index++
        break
      default:
        throw new DaemonArgumentError(
          translate('Unknown runtime host option: {{option}}', { option: argument })
        )
    }
  }
  if (pairingAddress && !mobilePairing) {
    throw new DaemonArgumentError(translate('`--pairing-address` requires `--mobile-pairing`'))
  }
  return {
    json,
    listenAddress,
    mobilePairing,
    pairingAddress,
    port,
    preferPinnedPort,
    rpcPort,
    userDataPath: resolve(userDataPath ?? resolveDefaultUserDataPath())
  }
}

function parsePort(rawPort: string): number {
  const parsedPort = Number(rawPort)
  if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
    throw new DaemonArgumentError(
      translate('Invalid runtime host port: {{port}}', { port: rawPort })
    )
  }
  return parsedPort
}

function readOptionValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1]
  if (!value || value.startsWith('-')) {
    throw new DaemonArgumentError(translate('`{{option}}` requires a value', { option }))
  }
  return value
}
