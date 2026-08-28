import { translate } from '../../i18n/translate'
import { readExtensionBootstrapIfExists } from '../../native-messaging/bootstrap-file'
import { readRuntimeMetadata } from '../../runtime/metadata'
import { resolveDefaultUserDataPath } from '../../runtime/paths'
import { hasFlag, readFlag } from '../arguments'
import { writeCliOutput } from '../output'

export function runStatusCommand(args: string[]): void {
  const userDataPath = readFlag(args, '--daemon-data') ?? resolveDefaultUserDataPath()
  const metadata = readRuntimeMetadata(userDataPath)
  const processRunning = metadata ? isProcessRunning(metadata.pid) : false
  const bootstrap =
    metadata && processRunning ? readExtensionBootstrapIfExists(userDataPath, metadata.pid) : null
  // Why: legacy Desktop metadata can point at a live Electron PID without the
  // daemon bootstrap required by every current CLI and extension connection.
  const running = processRunning && bootstrap !== null
  const value = {
    endpoint: bootstrap?.endpoint ?? null,
    pid: running ? (metadata?.pid ?? null) : null,
    runtimeId: running ? (metadata?.runtimeId ?? null) : null,
    state: running ? 'running' : 'not_running'
  }
  writeCliOutput(
    value,
    hasFlag(args, '--json'),
    running
      ? translate('Yiru daemon is running at {{endpoint}}', {
          endpoint: bootstrap?.endpoint ?? ''
        })
      : translate('Yiru daemon is not running')
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
