import { describe, expect, it, vi } from 'vite-plus/test'

import type { DaemonEvent } from '../daemon/daemon-stream-events'
import type { ListSessionsResult, SessionInfo } from '../daemon/types'

const daemonClientHarness = vi.hoisted(() => ({
  requests: [] as { type: string; payload: unknown }[],
  notifications: [] as { type: string; payload: unknown }[],
  listSessionsResult: { sessions: [] } as ListSessionsResult,
  eventListener: null as ((event: unknown) => void) | null,
  disconnectedListener: null as (() => void) | null,
  disconnected: false
}))

// Why: exercise the real adapter state machine without opening a process-global daemon socket.
vi.mock('../daemon/client', () => ({
  DaemonClient: class {
    async ensureConnected(): Promise<void> {}

    async request<T>(type: string, payload: unknown): Promise<T> {
      daemonClientHarness.requests.push({ type, payload })
      if (type === 'listSessions') {
        return daemonClientHarness.listSessionsResult as T
      }
      return undefined as T
    }

    notify(type: string, payload: unknown): void {
      daemonClientHarness.notifications.push({ type, payload })
    }

    onEvent(listener: (event: unknown) => void): () => void {
      daemonClientHarness.eventListener = listener
      return () => {
        if (daemonClientHarness.eventListener === listener) {
          daemonClientHarness.eventListener = null
        }
      }
    }

    onDisconnected(listener: () => void): () => void {
      daemonClientHarness.disconnectedListener = listener
      return () => {
        if (daemonClientHarness.disconnectedListener === listener) {
          daemonClientHarness.disconnectedListener = null
        }
      }
    }

    disconnect(): void {
      daemonClientHarness.disconnected = true
      daemonClientHarness.eventListener = null
      daemonClientHarness.disconnectedListener = null
    }
  }
}))

import { toAppSshPtyId } from '../../shared/ssh-pty-id'
import { DaemonPtyAdapter } from '../daemon/daemon-pty-adapter'
import { mintPtySessionId } from '../daemon/pty-session-id'
import { SshPtyProvider } from '../providers/ssh-pty-provider'
import {
  FrameDecoder,
  encodeJsonRpcFrame,
  parseJsonRpcMessage,
  type JsonRpcMessage
} from '../ssh/relay-protocol'
import { SshChannelMultiplexer, type MultiplexerTransport } from '../ssh/ssh-channel-multiplexer'

function createSession(sessionId: string, isAlive: boolean): SessionInfo {
  return {
    sessionId,
    state: isAlive ? 'running' : 'exited',
    shellState: 'ready',
    isAlive,
    pid: isAlive ? 123 : null,
    cwd: null,
    cols: 80,
    rows: 24,
    createdAt: 1
  }
}

function emitDaemonEvent(event: DaemonEvent): void {
  const listener = daemonClientHarness.eventListener
  if (!listener) {
    throw new Error('Daemon event routing was not registered')
  }
  listener(event)
}

function decodeRelayMessage(frame: Buffer): JsonRpcMessage {
  let message: JsonRpcMessage | null = null
  let decodingError: Error | null = null
  new FrameDecoder(
    (decoded) => {
      message = parseJsonRpcMessage(decoded.payload)
    },
    (error) => {
      decodingError = error
    }
  ).feed(frame)
  if (decodingError) {
    throw decodingError
  }
  if (!message) {
    throw new Error('Relay frame did not contain a JSON-RPC message')
  }
  return message
}

describe('terminal provider authority boundaries', () => {
  it('routes SSH relay notifications and host-scoped resize commands through the provider', () => {
    const outgoing: Buffer[] = []
    let deliver: (data: Buffer) => void = () => undefined
    const transport: MultiplexerTransport = {
      write: (data) => outgoing.push(Buffer.from(data)),
      onData: (listener) => {
        deliver = listener
      },
      onClose: () => undefined
    }
    const mux = new SshChannelMultiplexer(transport)
    const provider = new SshPtyProvider('host/example', mux)
    const dataEvents: { id: string; data: string }[] = []
    const exitEvents: { id: string; code: number }[] = []
    const appPtyId = toAppSshPtyId('host/example', 'pty-1')

    try {
      provider.onData((event) => dataEvents.push(event))
      provider.onExit((event) => exitEvents.push(event))

      deliver(
        encodeJsonRpcFrame(
          { jsonrpc: '2.0', method: 'pty.data', params: { id: 'pty-1', data: 'output' } },
          1,
          0
        )
      )
      deliver(
        encodeJsonRpcFrame(
          { jsonrpc: '2.0', method: 'pty.exit', params: { id: 'pty-1', code: 7 } },
          2,
          0
        )
      )
      provider.resize(appPtyId, 101, 31)

      expect(dataEvents).toEqual([{ id: appPtyId, data: 'output' }])
      expect(exitEvents).toEqual([{ id: appPtyId, code: 7 }])
      const resizeFrame = outgoing.at(-1)
      if (!resizeFrame) {
        throw new Error('SSH resize did not emit a relay frame')
      }
      expect(decodeRelayMessage(resizeFrame)).toEqual({
        jsonrpc: '2.0',
        method: 'pty.resize',
        params: { id: 'pty-1', cols: 101, rows: 31 }
      })
    } finally {
      provider.dispose()
      mux.dispose()
    }
  })

  it('reconciles daemon sessions and routes resize, data, and exit on the live adapter', async () => {
    const worktreeId = 'repo-id::workspace-path'
    const liveSessionId = mintPtySessionId(worktreeId)
    const orphanSessionId = mintPtySessionId('removed-repo::removed-path')
    daemonClientHarness.requests.length = 0
    daemonClientHarness.notifications.length = 0
    daemonClientHarness.disconnected = false
    daemonClientHarness.listSessionsResult = {
      sessions: [
        createSession(liveSessionId, true),
        createSession(orphanSessionId, true),
        createSession(mintPtySessionId(worktreeId), false)
      ]
    }
    const adapter = new DaemonPtyAdapter({
      socketPath: 'test-daemon.sock',
      tokenPath: 'test-daemon.token'
    })
    const dataEvents: { id: string; data: string; sequenceChars?: number }[] = []
    const exitEvents: { id: string; code: number }[] = []

    try {
      adapter.onData((event) => dataEvents.push(event))
      adapter.onExit((event) => exitEvents.push(event))

      await expect(adapter.reconcileOnStartup(new Set([worktreeId]))).resolves.toEqual({
        alive: [liveSessionId],
        killed: [orphanSessionId]
      })
      expect(daemonClientHarness.requests).toContainEqual({
        type: 'kill',
        payload: { sessionId: orphanSessionId }
      })

      adapter.resize(liveSessionId, 102, 32)
      emitDaemonEvent({
        type: 'event',
        event: 'data',
        sessionId: liveSessionId,
        payload: { data: 'daemon-output', sequenceChars: 13 }
      })
      emitDaemonEvent({
        type: 'event',
        event: 'exit',
        sessionId: liveSessionId,
        payload: { code: 9 }
      })

      expect(daemonClientHarness.notifications).toContainEqual({
        type: 'resize',
        payload: { sessionId: liveSessionId, cols: 102, rows: 32 }
      })
      expect(dataEvents).toEqual([{ id: liveSessionId, data: 'daemon-output', sequenceChars: 13 }])
      expect(exitEvents).toEqual([{ id: liveSessionId, code: 9 }])
      expect(adapter.getActiveSessionIds()).toEqual([])
    } finally {
      adapter.dispose()
    }
    expect(daemonClientHarness.disconnected).toBe(true)
  })
})
