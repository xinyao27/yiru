import { readExtensionBootstrapIfExists } from '../../native-messaging/bootstrap-file'
import { readRuntimeMetadata } from '../../runtime/metadata'
import { resolveDefaultUserDataPath } from '../../runtime/paths'
import { readFlag } from '../arguments'
import { createRuntimeOrpcClient, createRuntimeOrpcSocketLink } from '../orpc-client'
import type { RuntimeOrpcClient } from '../orpc-types'

export type CliRuntimeSession = {
  client: RuntimeOrpcClient
  close: () => void
}

const CLI_CONNECT_TIMEOUT_MS = 10_000

export async function connectCliRuntime(args: string[] = []): Promise<CliRuntimeSession> {
  const userDataPath = readFlag(args, '--daemon-data') ?? resolveDefaultUserDataPath()
  const metadata = readRuntimeMetadata(userDataPath)
  if (!metadata || !isProcessRunning(metadata.pid)) {
    throw new Error('daemon_not_running')
  }
  const bootstrap = readExtensionBootstrapIfExists(userDataPath, metadata.pid)
  if (!bootstrap) {
    throw new Error('daemon_not_ready')
  }
  const url = new URL(bootstrap.endpoint)
  url.searchParams.set('protocolVersion', String(bootstrap.protocolVersion))
  url.searchParams.set('token', bootstrap.authToken)
  const socket = new WebSocket(url)
  await waitForOpen(socket)
  const client = createRuntimeOrpcClient(createRuntimeOrpcSocketLink(socket, {}))
  const expectedRuntimeId = readFlag(args, '--runtime')
  if (expectedRuntimeId) {
    const status = await client.status.get()
    if (status.runtimeId !== expectedRuntimeId) {
      socket.close(1008, 'Runtime target mismatch')
      throw new Error('daemon_runtime_id_mismatch')
    }
  }
  return {
    client,
    close: () => socket.close(1000, 'CLI request complete')
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error('daemon_connection_timeout'))
    }, CLI_CONNECT_TIMEOUT_MS)
    const settle = (callback: () => void): void => {
      clearTimeout(timeout)
      callback()
    }
    socket.addEventListener('open', () => settle(resolve), { once: true })
    socket.addEventListener(
      'error',
      () => settle(() => reject(new Error('daemon_connection_failed'))),
      { once: true }
    )
  })
}
