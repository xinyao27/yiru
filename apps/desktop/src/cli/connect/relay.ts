import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'

import type { ConnectIdentityStore, MachineIdentity } from '~main/web-connect/identity'
import { startRelayBridge, type LocalRuntimeTarget } from '~main/web-connect/relay-bridge'
import { decodePairingOffer } from '~shared/pairing'
import { RuntimeClientError } from '~shared/runtime-client-error'

type RuntimeReadiness = {
  web: { pairingFile: string }
}

const RUNTIME_START_TIMEOUT_MS = 30_000

export async function runForegroundRelay(
  store: ConnectIdentityStore,
  identity: MachineIdentity,
  json: boolean
): Promise<void> {
  const machineId = store.listPairedBrowserAccess()[0]?.machineId
  if (!machineId) {
    throw new RuntimeClientError('connect_not_paired', 'No paired browser access was found.')
  }
  const runtime = await startRuntimeHost()
  const bridge = startRelayBridge({
    identity,
    machineId,
    store,
    target: readRuntimeTarget(runtime.readiness.web.pairingFile),
    onOnline: () => {
      if (json) {
        console.log(JSON.stringify({ status: 'online', machineId }))
      } else {
        console.log('Connected to Yiru Web. Press Ctrl+C to take this computer offline.')
      }
    }
  })

  const stop = (): void => {
    bridge.stop()
    runtime.child.kill('SIGTERM')
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  await new Promise<void>((resolve, reject) => {
    runtime.child.once('exit', (code) => {
      bridge.stop()
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
      if (code === 0 || code === null) {
        resolve()
      } else {
        reject(new RuntimeClientError('runtime_exited', `Yiru runtime exited with code ${code}.`))
      }
    })
  })
}

async function startRuntimeHost(): Promise<{ child: ChildProcess; readiness: RuntimeReadiness }> {
  const cliEntry = process.argv[1]
  if (!cliEntry) {
    throw new RuntimeClientError(
      'runtime_start_failed',
      'Could not resolve the Yiru CLI entrypoint.'
    )
  }
  const child = spawn(process.execPath, [cliEntry, 'serve', '--port', '0', '--json'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit']
  })
  const readiness = await new Promise<RuntimeReadiness>((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(
        new RuntimeClientError('runtime_start_timeout', 'Timed out starting the Yiru runtime.')
      )
    }, RUNTIME_START_TIMEOUT_MS)
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
      const lines = output.split('\n')
      output = lines.pop() ?? ''
      for (const line of lines) {
        try {
          const parsed = readRuntimeReadiness(JSON.parse(line))
          if (parsed) {
            clearTimeout(timeout)
            resolve(parsed)
            return
          }
        } catch {
          // Why: the runtime can emit diagnostics before its machine-readable readiness line.
        }
      }
    })
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      reject(
        new RuntimeClientError('runtime_start_failed', `Yiru runtime exited with code ${code}.`)
      )
    })
  })
  return { child, readiness }
}

function readRuntimeTarget(path: string): LocalRuntimeTarget {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const pairingUrl =
    parsed && typeof parsed === 'object' ? Reflect.get(parsed, 'pairingUrl') : undefined
  if (typeof pairingUrl !== 'string') {
    throw new RuntimeClientError(
      'runtime_pairing_failed',
      'Runtime pairing credentials are missing.'
    )
  }
  const offer = decodePairingOffer(pairingUrl)
  return {
    deviceToken: offer.deviceToken,
    endpoint: offer.endpoint,
    runtimePublicKeyB64: offer.publicKeyB64
  }
}

function readRuntimeReadiness(value: unknown): RuntimeReadiness | null {
  if (!value || typeof value !== 'object' || Reflect.get(value, 'type') !== 'yiru_runtime_ready') {
    return null
  }
  const web = Reflect.get(value, 'web')
  if (!web || typeof web !== 'object') {
    return null
  }
  const pairingFile = Reflect.get(web, 'pairingFile')
  return typeof pairingFile === 'string' ? { web: { pairingFile } } : null
}
