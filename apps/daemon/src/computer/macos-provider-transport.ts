import { chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { release, tmpdir } from 'node:os'
import { join } from 'node:path'

import { RuntimeClientError } from './runtime-client-error'

const HELPER_CONNECT_TIMEOUT_MS = 10_000
const HELPER_CONNECT_RETRY_MS = 100

export type MacOSProviderSocketHandlers = {
  close: (socket: Bun.Socket<MacOSProviderSocketData>, error?: Error) => void
  data: (socket: Bun.Socket<MacOSProviderSocketData>, chunk: Uint8Array) => void
  error: (socket: Bun.Socket<MacOSProviderSocketData>, error: Error) => void
}

export type MacOSProviderSocketData = {
  handlers: MacOSProviderSocketHandlers
}

export type StartedMacOSProvider = {
  process: ReturnType<typeof Bun.spawn>
  socket: Bun.Socket<MacOSProviderSocketData>
  socketDirectory: string
  socketToken: string
}

export function isMacOS14OrNewer(): boolean {
  const darwinMajor = Number.parseInt(release().split('.')[0] ?? '', 10)
  return Number.isFinite(darwinMajor) && darwinMajor >= 23
}

export async function startMacOSProvider(input: {
  helperExecutablePath: string
  handlers: MacOSProviderSocketHandlers
  signal: AbortSignal
}): Promise<StartedMacOSProvider> {
  const socketDirectory = mkdtempSync(join(tmpdir(), 'yiru-computer-use-'))
  chmodSync(socketDirectory, 0o700)
  const socketPath = join(socketDirectory, 'provider.sock')
  const socketToken = crypto.randomUUID()
  const socketTokenPath = join(socketDirectory, 'provider.token')
  await Bun.write(socketTokenPath, socketToken)
  chmodSync(socketTokenPath, 0o600)

  let provider: ReturnType<typeof Bun.spawn>
  try {
    provider = Bun.spawn(
      [input.helperExecutablePath, '--agent', socketPath, '--token-file', socketTokenPath],
      { detached: true, stderr: 'ignore', stdin: 'ignore', stdout: 'ignore' }
    )
    provider.unref()
  } catch (error) {
    cleanupSocketDirectory(socketDirectory)
    throw new RuntimeClientError(
      'accessibility_error',
      `native macOS helper app failed to start: ${errorMessage(error)}`
    )
  }

  try {
    const socket = await Promise.race([
      connectMacOSProviderSocket(socketPath, input.handlers, input.signal),
      rejectWhenProviderExits(provider)
    ])
    rmSync(socketTokenPath, { force: true })
    if (input.signal.aborted) {
      socket.terminate()
      provider.kill('SIGTERM')
      throw new RuntimeClientError(
        'accessibility_error',
        'native macOS helper app startup was cancelled'
      )
    }
    return { process: provider, socket, socketDirectory, socketToken }
  } catch (error) {
    provider.kill('SIGTERM')
    cleanupSocketDirectory(socketDirectory)
    throw error
  }
}

export function cleanupSocketDirectory(socketDirectory: string | null): void {
  if (socketDirectory) {
    rmSync(socketDirectory, { force: true, recursive: true })
  }
}

async function connectMacOSProviderSocket(
  socketPath: string,
  handlers: MacOSProviderSocketHandlers,
  signal: AbortSignal
): Promise<Bun.Socket<MacOSProviderSocketData>> {
  const deadline = Date.now() + HELPER_CONNECT_TIMEOUT_MS
  let lastError: Error | null = null
  while (Date.now() < deadline && !signal.aborted) {
    try {
      return await Bun.connect<MacOSProviderSocketData>({
        data: { handlers },
        socket: {
          binaryType: 'uint8array',
          close(socket, error) {
            socket.data.handlers.close(socket, error)
          },
          connectError() {},
          data(socket, chunk) {
            socket.data.handlers.data(socket, chunk)
          },
          error(socket, error) {
            socket.data.handlers.error(socket, error)
          }
        },
        unix: socketPath
      })
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      await Bun.sleep(HELPER_CONNECT_RETRY_MS)
    }
  }
  if (signal.aborted) {
    throw new RuntimeClientError(
      'accessibility_error',
      'native macOS helper app startup was cancelled'
    )
  }
  throw new RuntimeClientError(
    'action_timeout',
    `native macOS helper app did not open its socket: ${lastError?.message ?? 'timed out'}`
  )
}

async function rejectWhenProviderExits(provider: ReturnType<typeof Bun.spawn>): Promise<never> {
  const code = await provider.exited
  throw new RuntimeClientError(
    'accessibility_error',
    `native macOS helper app exited before connecting: code ${code}`
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
