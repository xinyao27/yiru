import { translate } from '../../i18n/translate'
import { readExtensionBootstrap } from '../../native-messaging/bootstrap-file'
import { readRuntimeMetadata } from '../../runtime/metadata'
import { resolveDefaultUserDataPath } from '../../runtime/paths'
import { hasFlag, readFlag } from '../arguments'
import { writeCliOutput } from '../output'

export function runConnectionCommand(args: string[]): void {
  if (args[0] !== 'show') {
    throw new Error('connection_action_unsupported')
  }
  const userDataPath = resolveDefaultUserDataPath()
  const metadata = readRuntimeMetadata(userDataPath)
  if (!metadata || !isProcessRunning(metadata.pid)) {
    throw new Error('daemon_not_running')
  }
  const bootstrap = readExtensionBootstrap(userDataPath, metadata.pid)
  const endpoint = new URL(bootstrap.endpoint)
  const advertisedHost = readFlag(args, '--host')?.trim()
  if (advertisedHost) {
    endpoint.hostname = advertisedHost
  }
  const value = {
    authToken: bootstrap.authToken,
    endpoint: endpoint.href,
    protocolVersion: bootstrap.protocolVersion,
    runtimeId: bootstrap.runtimeId
  }
  writeCliOutput(
    value,
    hasFlag(args, '--json'),
    [
      `${translate('Daemon endpoint')}: ${value.endpoint}`,
      `${translate('Access token')}: ${value.authToken}`,
      `${translate('Protocol version')}: ${value.protocolVersion}`
    ].join('\n')
  )
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
