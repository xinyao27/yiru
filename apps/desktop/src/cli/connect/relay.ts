import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'

import {
  WEB_CONNECT_PROTOCOL_VERSION,
  machineRelayAuthSigningMessage
} from '@yiru/runtime-protocol/web-connect'
import {
  RelayBrowserAuthEnvelopeSchema,
  WEB_CONNECT_MAX_TRANSPORT_FRAME_BYTES
} from '@yiru/runtime-protocol/web-connect/relay-frames'
import { WebSocket } from 'ws'
import { decodePairingOffer } from '~shared/pairing'

import { RuntimeClientError } from '../runtime-client'
import { openBrowserChannel } from './browser-channel'
import type { MachineIdentity, PairedBrowserAccess } from './identity'
import {
  connectionCloseFrame,
  decodeRelayFrame,
  encodeRelayFrame,
  parseConnectionClose
} from './relay-frame'

type RuntimeReadiness = {
  web: { pairingFile: string }
}

const RUNTIME_START_TIMEOUT_MS = 30_000
const RECONNECT_DELAY_MS = 1_000

export async function runForegroundRelay(
  access: PairedBrowserAccess[],
  identity: MachineIdentity,
  json: boolean
): Promise<void> {
  const runtime = await startRuntimeHost()
  const machineId = access[0]?.machineId
  if (!machineId) {
    throw new RuntimeClientError('connect_not_paired', 'No paired browser access was found.')
  }
  const pairing = readRuntimePairing(runtime.readiness.web.pairingFile)
  const localSockets = new Map<string, WebSocket>()
  let stopped = false
  let relaySocket: WebSocket | null = null

  const stop = (): void => {
    if (stopped) {
      return
    }
    stopped = true
    for (const local of localSockets.values()) {
      local.close()
    }
    relaySocket?.close()
    runtime.child.kill('SIGTERM')
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  const connectRelay = (): void => {
    if (stopped) {
      return
    }
    const socket = new WebSocket(machineSocketUrl(machineId), {
      maxPayload: WEB_CONNECT_MAX_TRANSPORT_FRAME_BYTES
    })
    relaySocket = socket
    socket.on('open', () => {
      const timestamp = Date.now()
      const nonce = randomBase64Url(18)
      const unsigned = {
        machineId,
        timestamp,
        nonce,
        runtimePublicKeyB64: pairing.publicKeyB64
      }
      socket.send(
        JSON.stringify({
          type: 'machine-auth',
          version: WEB_CONNECT_PROTOCOL_VERSION,
          ...unsigned,
          signature: sign(
            null,
            Buffer.from(machineRelayAuthSigningMessage(unsigned)),
            identity.privateKey
          ).toString('base64url')
        })
      )
    })
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        socket.close(1008, 'Invalid relay frame')
        return
      }
      const text = data.toString()
      const envelope = parseBrowserAuthEnvelope(text)
      if (envelope) {
        localSockets.get(envelope.connectionId)?.close()
        let local: WebSocket | null = null
        local = openBrowserChannel(envelope, access, pairing.endpoint, pairing.deviceToken, {
          onClose: () => {
            if (localSockets.get(envelope.connectionId) === local) {
              localSockets.delete(envelope.connectionId)
              sendRelayJson(socket, connectionCloseFrame(envelope.connectionId))
            }
          },
          sendFrame: (frame, binary) => {
            const encoded = encodeRelayFrame(envelope.connectionId, frame, binary)
            if (encoded) {
              sendRelayJson(socket, encoded)
            } else {
              local?.close(1009, 'Relay frame is too large')
            }
          },
          sendReady: (deviceToken) => {
            const ready = encodeRelayFrame(
              envelope.connectionId,
              Buffer.from(JSON.stringify({ type: 'relay-browser-ready', deviceToken })),
              false
            )
            if (ready) {
              sendRelayJson(socket, ready)
            }
          }
        })
        if (local) {
          localSockets.set(envelope.connectionId, local)
        }
        return
      }
      if (text.includes('"type":"machine-ready"')) {
        if (json) {
          console.log(JSON.stringify({ status: 'online', machineId }))
        } else {
          console.log('Connected to Yiru Web. Press Ctrl+C to take this computer offline.')
        }
        return
      }
      const close = parseConnectionClose(text)
      if (close) {
        localSockets.get(close.connectionId)?.close()
        localSockets.delete(close.connectionId)
        return
      }
      const frame = decodeRelayFrame(text)
      const local = frame ? localSockets.get(frame.connectionId) : null
      if (frame && local?.readyState === WebSocket.OPEN) {
        local.send(frame.data, { binary: frame.isBinary })
      }
    })
    socket.on('close', () => {
      for (const local of localSockets.values()) {
        local.close()
      }
      localSockets.clear()
      if (!stopped) {
        setTimeout(connectRelay, RECONNECT_DELAY_MS)
      }
    })
    socket.on('error', () => {})
  }
  connectRelay()

  await new Promise<void>((resolve, reject) => {
    runtime.child.once('exit', (code) => {
      stopped = true
      relaySocket?.close()
      for (const local of localSockets.values()) {
        local.close()
      }
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
          const parsed = JSON.parse(line) as Partial<RuntimeReadiness> & { type?: unknown }
          if (parsed.type === 'yiru_runtime_ready' && parsed.web?.pairingFile) {
            clearTimeout(timeout)
            resolve({ web: parsed.web })
            return
          }
        } catch {
          // Ignore non-readiness output from the supervised runtime.
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

function readRuntimePairing(path: string): ReturnType<typeof decodePairingOffer> {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { pairingUrl?: unknown }
  if (typeof parsed.pairingUrl !== 'string') {
    throw new RuntimeClientError(
      'runtime_pairing_failed',
      'Runtime pairing credentials are missing.'
    )
  }
  return decodePairingOffer(parsed.pairingUrl)
}

function parseBrowserAuthEnvelope(
  value: string
): ReturnType<typeof RelayBrowserAuthEnvelopeSchema.parse> | null {
  try {
    const parsed = RelayBrowserAuthEnvelopeSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function sendRelayJson(socket: WebSocket, value: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(value))
  }
}

function machineSocketUrl(machineId: string): string {
  const origin = new URL(process.env.YIRU_CONNECT_ORIGIN ?? 'https://app.yiru.ai')
  origin.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:'
  origin.pathname = `/api/connect/machines/${encodeURIComponent(machineId)}/socket`
  return origin.toString()
}

function randomBase64Url(byteLength: number): string {
  return randomBytes(byteLength).toString('base64url')
}
