import { readRuntimeMetadata, type RuntimeMetadata } from '../runtime/metadata'
import { resolveDefaultUserDataPath } from '../runtime/paths'
import { readExtensionBootstrap } from './bootstrap-file'
import { YIRU_EXTENSION_ORIGIN } from './identity'

const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024
const DAEMON_START_TIMEOUT_MS = 10_000
const DAEMON_START_POLL_MS = 50

type NativeRequest = {
  id: string
  type: 'bootstrap' | 'pick-directory'
}

type NativeResponse =
  | {
      id: string
      ok: true
      result: {
        authToken: string
        daemonStarted: boolean
        endpoint: string
        extensionOrigin: string
        protocolVersion: number
        runtimeId: string
      }
    }
  | { id: string; ok: true; result: { path: string | null } }
  | { id: string; ok: false; error: { code: string; message: string } }

export async function runNativeMessagingHost(argv: string[]): Promise<void> {
  const callerOrigin = argv.find((argument) => argument.startsWith('chrome-extension://'))
  if (callerOrigin && callerOrigin.replace(/\/$/, '') !== YIRU_EXTENSION_ORIGIN) {
    throw new Error('native_messaging_origin_denied')
  }
  const output = Bun.stdout.writer()
  let pending: Uint8Array<ArrayBufferLike> = new Uint8Array()
  try {
    for await (const chunk of Bun.stdin.stream()) {
      pending = concatenate(pending, chunk)
      while (pending.byteLength >= 4) {
        const messageLength = new DataView(
          pending.buffer,
          pending.byteOffset,
          pending.byteLength
        ).getUint32(0, true)
        if (messageLength > MAX_NATIVE_MESSAGE_BYTES) {
          throw new Error('native_messaging_message_too_large')
        }
        if (pending.byteLength < messageLength + 4) {
          break
        }
        const messageBytes = pending.slice(4, messageLength + 4)
        pending = pending.slice(messageLength + 4)
        const request = parseRequest(new TextDecoder().decode(messageBytes))
        writeResponse(output, await handleRequest(request))
      }
    }
  } finally {
    output.end()
  }
}

async function handleRequest(request: NativeRequest): Promise<NativeResponse> {
  try {
    if (request.type === 'pick-directory') {
      return { id: request.id, ok: true, result: { path: pickProjectDirectory() } }
    }
    const userDataPath = resolveDefaultUserDataPath()
    const current = readLiveMetadata(userDataPath)
    const daemonStarted = current === null
    const metadata = current ?? (await startDaemonAndWait(userDataPath))
    const extension = readExtensionBootstrap(userDataPath, metadata.pid)
    return {
      id: request.id,
      ok: true,
      result: {
        authToken: extension.authToken,
        daemonStarted,
        endpoint: extension.endpoint,
        extensionOrigin: YIRU_EXTENSION_ORIGIN,
        protocolVersion: extension.protocolVersion,
        runtimeId: extension.runtimeId
      }
    }
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: {
        code: 'native_bootstrap_failed',
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

function parseRequest(message: string): NativeRequest {
  const value: unknown = JSON.parse(message)
  if (
    typeof value !== 'object' ||
    value === null ||
    (Reflect.get(value, 'type') !== 'bootstrap' &&
      Reflect.get(value, 'type') !== 'pick-directory') ||
    typeof Reflect.get(value, 'id') !== 'string'
  ) {
    throw new Error('native_messaging_invalid_request')
  }
  return { id: Reflect.get(value, 'id'), type: Reflect.get(value, 'type') }
}

function pickProjectDirectory(): string | null {
  if (process.platform === 'darwin') {
    return runDirectoryPicker([
      'osascript',
      '-e',
      'POSIX path of (choose folder with prompt "Choose a project for Yiru")'
    ])
  }
  if (process.platform === 'win32') {
    const executable = Bun.which('pwsh.exe') ?? Bun.which('powershell.exe')
    if (!executable) {
      throw new Error('directory_picker_unavailable')
    }
    return runDirectoryPicker([
      executable,
      '-STA',
      '-NoProfile',
      '-Command',
      "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = 'Choose a project for Yiru'; if ($dialog.ShowDialog() -eq 'OK') { [Console]::Write($dialog.SelectedPath) }"
    ])
  }
  const executable = Bun.which('zenity') ?? Bun.which('kdialog')
  if (!executable) {
    throw new Error('directory_picker_unavailable')
  }
  return runDirectoryPicker(
    executable.endsWith('kdialog')
      ? [executable, '--getexistingdirectory', process.cwd()]
      : [executable, '--file-selection', '--directory', '--title=Choose a project for Yiru']
  )
}

function runDirectoryPicker(argumentsList: string[]): string | null {
  const result = Bun.spawnSync(argumentsList, { stderr: 'ignore', stdout: 'pipe' })
  if (result.exitCode !== 0) {
    return null
  }
  const path = result.stdout.toString('utf8').trim().replace(/\/$/, '')
  return path || null
}

function writeResponse(output: Bun.FileSink, response: NativeResponse): void {
  const body = new TextEncoder().encode(JSON.stringify(response))
  const header = new Uint8Array(4)
  new DataView(header.buffer).setUint32(0, body.byteLength, true)
  output.write(header)
  output.write(body)
  output.flush()
}

function readLiveMetadata(userDataPath: string): RuntimeMetadata | null {
  const metadata = readRuntimeMetadata(userDataPath)
  if (!metadata) {
    return null
  }
  try {
    process.kill(metadata.pid, 0)
    return metadata
  } catch {
    return null
  }
}

async function startDaemonAndWait(userDataPath: string): Promise<RuntimeMetadata> {
  const processArguments = resolveDaemonProcessArguments(userDataPath)
  const daemonProcess = Bun.spawn(processArguments, {
    cwd: process.cwd(),
    detached: true,
    env: process.env,
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore'
  })
  daemonProcess.unref()
  const deadline = Date.now() + DAEMON_START_TIMEOUT_MS
  while (Date.now() < deadline) {
    const metadata = readLiveMetadata(userDataPath)
    if (metadata) {
      return metadata
    }
    await Bun.sleep(DAEMON_START_POLL_MS)
  }
  throw new Error('daemon_start_timeout')
}

function resolveDaemonProcessArguments(userDataPath: string): string[] {
  const isBunInterpreter = /(?:^|[/\\])bun(?:\.exe)?$/i.test(process.execPath)
  return isBunInterpreter
    ? [process.execPath, process.argv[1] ?? '', 'daemon', '--user-data-path', userDataPath]
    : [process.execPath, 'daemon', '--user-data-path', userDataPath]
}

function concatenate(
  left: Uint8Array<ArrayBufferLike>,
  right: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBufferLike> {
  const result = new Uint8Array(left.byteLength + right.byteLength)
  result.set(left)
  result.set(right, left.byteLength)
  return result
}
